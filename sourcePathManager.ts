import fs, { constants } from "fs";
import fsPromise from "fs/promises";
import { exec, execSync, spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import { parseYtDlpProgressLine } from "./parseYtDlpProgressLine.js";
import { Playlist } from "./envJSON.js";
import path from "path";

/**
 * 状況ごとにステータスが変動します。
 * - loading: 曲が存在するかのチェックをしています。
 * - queue: まだキューの中で、ダウンロードを始められません。
 * - formatchoosing: ダウンロードする動画の品質などをチェックしています。
 * - downloading: ダウンロードを開始しました。
 * - converting: ダウンロードが完了し変換を開始しました。
 * - done: 完了しました。
 */
type Status = "loading" | "queue" | "formatchoosing" | "downloading" | "converting" | "done";

/** メディアデータを管理するクラスです。 */
export class SourcePathManager {
    #downloadingQueues: {
        /** 種類を識別します。 */
        playlist: Playlist;
        /** ステータスです。ここで閲覧することも可能です。途中からキューに追加された時に一番最初のステータスコールバックをする際に役立ちます。 */
        status: Status;
        /** 進捗です。ステータスと併用してください。 */
        percent: number;
        /** ここに関数を入れると、完了した時に入れられた関数を発火します。 */
        processedCallback: (() => void)[];
        /** ここに関数を入れるとステータスが転移した時に入れられた関数を発火します。 */
        statusCallback: ((status: Status, percent: number) => void)[];
    }[] = [];
    async getAudioPath(playlistData: Playlist, statusCallback?: (status: Status, percent: number) => void) {
        if (statusCallback) statusCallback("loading", 1);
        const type = playlistData.type;
        const folderPath = type === "videoId" ? "./youtubeCache" : type === "nicovideoId" ? "./niconicoCache" : undefined;
        if (!folderPath) return console.error("SourcePathManager: 現時点で対応していない種類が選ばれました。", type);
        if (!await fsPromise.access(folderPath, constants.R_OK).then(() => true).catch(() => false)) await fsPromise.mkdir(folderPath);
        const files = await fsPromise.readdir(folderPath);
        const result = files.find(file => file.startsWith(playlistData.body + "."));
        if (result) return folderPath + "/" + result;
        else {
            await this.addQueue(playlistData, statusCallback);
            if (statusCallback) statusCallback("loading", 95);
            const files = await fsPromise.readdir(folderPath);
            const result = files.find(file => file.startsWith(playlistData.body + "."));
            if (statusCallback) statusCallback("done", 100);
            if (result) return folderPath + "/" + result;
            else return undefined;
        }
    }
    async addQueue(playlistData: Playlist, statusCallback?: (status: Status, percent: number) => void) {
        if (!this.#downloadingQueues.find(downloadingQueue => downloadingQueue.playlist.body === playlistData.body)) {
            this.#downloadingQueues.push({
                playlist: playlistData,
                status: "queue",
                percent: 5,
                statusCallback: [],
                processedCallback: []
            });
        }
        const downloadingQueue = this.#downloadingQueues.find(downloadingQueue => downloadingQueue.playlist.body === playlistData.body);
        if (!downloadingQueue) return console.error("通常なら存在するはずのキューを取得できず、処理を続行できませんでした。");
        if (statusCallback) {
            statusCallback(downloadingQueue.status, downloadingQueue.percent);
            downloadingQueue.statusCallback.push(statusCallback);
        }
        this.downloadProcess(); // 実際に待機するのは下のprocessedCallbackなのでこの関数で待機をしない。
        await new Promise<void>(resolve => { downloadingQueue.processedCallback.push(() => { resolve(); }); });
    }
    downloadProcess() {
        const downloading = this.#downloadingQueues.filter(downloadingQueue => downloadingQueue.status !== "queue");
        if (downloading.length >= 5) return;
        const downloadingQueue = this.#downloadingQueues.find(downloadingQueue => downloadingQueue.status === "queue");
        if (downloadingQueue === undefined) return;
        const downloadingId = downloadingQueue.playlist.body;
        const downloadingGet = () => {
            return this.#downloadingQueues.find(downloadingQueue => downloadingQueue.playlist.body === downloadingId);
        };
        function status(status?: Status, percent?: number) {
            const downloading = downloadingGet();
            if (!downloading) return;
            if (status) downloading.status = status;
            if (percent) downloading.percent = percent;
            downloading.statusCallback.forEach(func => func(downloading.status, downloading.percent));
        }
        const processEnd = () => {
            downloadingGet()?.processedCallback.forEach(func => { try { func() } catch (e) { console.error("SourcePathManager: コールバック先でエラーが発生しました。", e) } });
            const index = this.#downloadingQueues.findIndex(downloadingQueue => downloadingQueue.playlist.body === downloadingId);
            if (index !== -1) this.#downloadingQueues.splice(index, 1);
            this.downloadProcess();
        }
        status("formatchoosing", 30);
        this.downloadProcess();
        const type = downloadingQueue.playlist.type;
        const folderPath = type === "videoId" ? "youtubeCache" : type === "nicovideoId" ? "niconicoCache" : undefined;
        if (!folderPath) {
            processEnd();
            return console.error("SourcePathManager: 通常存在しないといけない変数が存在しませんでした。もしかしたら不具合が起きるかもしれません。種類を判別できませんでした。", downloadingQueue);
        }
        (async () => {
            try {
                // 1. その動画に関連づけられているデータから最適なフォーマットを取得する。
                interface Format {
                    asr?: number;
                    format_id: string;
                    format_note: string;
                    resolution: string;
                    url?: string;
                    manifest_url?: string;
                    ext?: string | null;
                    protocol?: string | null;
                    has_drm?: boolean;
                    vcodec?: string | null;
                    acodec?: string | null;
                    audio_ext?: string | null;
                    video_ext?: string | null;
                    abr?: number | null;  // audio bitrate (kbps)
                    tbr?: number | null;  // total bitrate (kbps)
                }
                const formats: Format[] = await new Promise((resolve, reject) => {
                    function retry(err: any, olderrt: string) {
                        console.log("SourcePathManager: 通常のyt-dlpではメタデータを取得できませんでした。別のパターンで検証します。", err, olderrt);
                        const candidates = [
                            "/opt/homebrew/bin/yt-dlp",
                            "/usr/local/bin/yt-dlp",
                            (() => { try { return execSync("which yt-dlp").toString().trim(); } catch { return null; } })(),
                        ].filter(Boolean);
                        const ytdlp = candidates.find(p => { try { return p && fs.existsSync(p); } catch { return false; } });
                        if (!ytdlp) throw new Error("yt-dlp が見つかりませんでした（PATHに無い/権限不足）。/opt/homebrew/bin/yt-dlp を確認してください。");

                        let text = "";
                        let errt = "";
                        const proc = exec(`${ytdlp} --print "%(formats)j" -q --cookies-from-browser chrome --no-warnings ${type === "videoId" ? '--extractor-args youtube:player_client=mweb https://youtu.be/'
                            : type === "nicovideoId" ? '--add-header "Referer:https://www.nicovideo.jp/" https://www.nicovideo.jp/watch/'
                                : ""
                            }` + downloadingId, { cwd: process.cwd() }, (err, stdout, stderr) => {
                                text += stdout;
                                errt += stderr;
                            });
                        proc.on("close", () => {
                            try { resolve(JSON.parse(text)) }
                            catch (e) {
                                console.log("次の動画のJSONをパースしようとしたらエラーが発生しました。", downloadingId, text, "ここからはエラーです。", errt, e);
                                reject(new Error("この動画(" + downloadingId + ")のフォーマットリストを解析しようとした時にエラーが発生しました。: " + err + e));
                            }
                        });
                        proc.on("error", e => {
                            console.log("次の動画のJSONを取得しようとしたらエラーが発生しました。", downloadingId, text, "ここからはエラーです。", errt, e);
                            reject(new Error("この動画(" + downloadingId + ")の解析を行うためにフォーマットリストを取得しようとした時にエラーが発生しました。: " + err + e));
                        });
                    }
                    let text = "";
                    let errt = "";
                    const proc = exec(`yt-dlp --print "%(formats)j" -q --cookies-from-browser chrome --no-warnings ${type === "videoId" ? '--extractor-args youtube:player_client=tv_embedded,ios https://youtu.be/'
                        : type === "nicovideoId" ? '--add-header "Referer:https://www.nicovideo.jp/" https://www.nicovideo.jp/watch/'
                            : ""
                        }` + downloadingId, (err, stdout, stderr) => {
                            text += stdout;
                            errt += stderr;
                        });
                    proc.on("close", () => {
                        try { resolve(JSON.parse(text)) }
                        catch (e) {
                            retry(e, errt);
                        }
                    });
                    proc.on("error", e => { retry(e, errt) });
                });
                /** Created by ChatGPT. */
                function pickBestFormat(formats: Format[]): Format | undefined {
                    if (!Array.isArray(formats) || formats.length === 0) return undefined;

                    const isAudioOnly = (f: Format) => {
                        const res = (f.resolution ?? '').toLowerCase();
                        return (
                            (f.vcodec ?? '').toLowerCase() === 'none' ||
                            (f.video_ext ?? '').toLowerCase() === 'none' ||
                            res.includes('audio only')
                        );
                    };

                    // 1) 音声のみ & 非DRM に絞る
                    const audioCandidates = formats.filter(f => isAudioOnly(f) && !f.has_drm);

                    if (audioCandidates.length === 0) {
                        // 最低限のフェイルセーフ：音声トラックを含むもの全般から選ぶ
                        const anyWithAudio = formats.filter(f => (f.acodec && f.acodec !== 'none') && !f.has_drm);
                        if (anyWithAudio.length === 0) return undefined;
                        return anyWithAudio.sort(sorter).at(0) ?? undefined;
                    }

                    const high = audioCandidates.filter(f =>
                        (f.format_note ?? '').toLowerCase().includes('high')
                    );
                    const medium = audioCandidates.filter(f =>
                        (f.format_note ?? '').toLowerCase().includes('medium')
                    );
                    // 2) "Main Audio" を優先（"Main Audio, high" など含む広い判定）
                    const mainAudio = audioCandidates.filter(f =>
                        (f.format_note ?? '').toLowerCase().includes('main audio')
                    );

                    const pool = high.length > 0 ? high : medium.length > 0 ? medium : mainAudio.length > 0 ? mainAudio : audioCandidates;

                    // 3) 品質順に並べて先頭を採用
                    return pool.sort(sorter).at(0) ?? undefined;

                    // 並び替え関数：ABR > ASR > TBR（降順）
                    function num(n: number | null | undefined) { return typeof n === 'number' && isFinite(n) ? n : 0; }
                    function sorter(a: Format, b: Format) {
                        const abrDiff = num(b.abr) - num(a.abr);
                        if (abrDiff !== 0) return abrDiff;
                        const asrDiff = num(b.asr) - num(a.asr);
                        if (asrDiff !== 0) return asrDiff;
                        return num(b.tbr) - num(a.tbr);
                    }
                }
                const audioformat = pickBestFormat(formats);
                // 4. もし取得できたらダウンロードをして拡張子・コンテナを修正する。
                if (audioformat) {
                    status("downloading", 40);
                    await new Promise<void>((resolve, reject) => {
                        const retry = (err?: any) => {
                            const candidates = [
                                "/opt/homebrew/bin/yt-dlp",
                                "/usr/local/bin/yt-dlp",
                                (() => { try { return execSync("which yt-dlp").toString().trim(); } catch { return null; } })(),
                            ].filter(Boolean);
                            const ytdlp = candidates.find(p => { try { return p && fs.existsSync(p); } catch { return false; } });
                            if (!ytdlp) throw new Error("yt-dlp が見つかりませんでした（PATHに無い/権限不足）。/opt/homebrew/bin/yt-dlp を確認してください。");

                            const cp = spawn(ytdlp, [
                                "--progress", "--newline",
                                "-f", audioformat.format_id,
                                "-o", folderPath + "/%(id)s-cache.%(ext)s",
                                "--progress-template", "%(progress)j",
                                "--cookies-from-browser", "chrome",
                                ...(() => {
                                    if (type === "videoId") return ["--extractor-args", 'youtube:player_client=mweb']
                                    if (type === "nicovideoId") return ["--add-header", "Referer:https://www.nicovideo.jp/"]
                                    return []
                                })(),
                                (type === "videoId" ? "https://youtu.be/" : "https://www.nicovideo.jp/watch/") + downloadingId
                            ], { cwd: process.cwd() });

                            cp.stdout.setEncoding("utf8");
                            cp.stderr.setEncoding("utf8");

                            cp.stdout.on("data", chunk => {
                                const progress = parseYtDlpProgressLine(String(chunk));
                                status("downloading", 40 + ((progress?._percent || 0) / 100) * 20);
                            });

                            cp.stderr.on("data", message => {
                                console.error("ダウンロードでエラーが発生しました。", String(message));
                            });

                            cp.on("close", code => {
                                if (code === 0) resolve();
                                else reject(new Error(`yt-dlp exited with code ${code}`));
                            });

                            cp.on("error", e => reject({ one: err, two: e }));
                        }
                        const cp = spawn("yt-dlp", [
                            "--progress", "--newline",
                            "-f", audioformat.format_id,
                            "-o", folderPath + "/%(id)s-cache.%(ext)s",
                            "--progress-template", "%(progress)j",
                            "--cookies-from-browser", "chrome",
                            ...(() => {
                                if (type === "videoId") return ["--extractor-args", 'youtube:player_client=tv_embedded,ios']
                                if (type === "nicovideoId") return ["--add-header", "Referer:https://www.nicovideo.jp/"]
                                return []
                            })(),
                            (type === "videoId" ? "https://youtu.be/" : "https://www.nicovideo.jp/watch/") + downloadingId
                        ], { cwd: process.cwd() });

                        cp.stdout.setEncoding("utf8");
                        cp.stderr.setEncoding("utf8");

                        cp.stdout.on("data", chunk => {
                            const progress = parseYtDlpProgressLine(String(chunk));
                            status("downloading", 40 + ((progress?._percent || 0) / 100) * 20);
                        });

                        cp.stderr.on("data", message => {
                            console.error(String(message));
                        });

                        cp.on("close", code => {
                            if (code === 0) resolve();
                            else retry();
                        });

                        cp.on("error", e => { retry(e) });
                    });
                    const files = await fsPromise.readdir("./" + folderPath);
                    const cacheFilename = files.find(file => file.startsWith(downloadingId + "-cache."));
                    if (cacheFilename) {
                        status("converting", 70);
                        const info = await new Promise<ffmpeg.FfprobeData>(resolve => ffmpeg.ffprobe("./" + folderPath + "/" + cacheFilename, (err, data) => resolve(data)));
                        await new Promise<void>((resolve, reject) => {
                            exec(`ffmpeg -i ${folderPath}/${cacheFilename} -c copy ${folderPath}/${downloadingId}.${info.streams[0].codec_name === "aac" ? "m4a" : "ogg"}`, (err, stdout, stderr) => {
                                if (err) return reject(err);
                                resolve();
                            });
                        });
                        await fsPromise.unlink("./" + folderPath + "/" + cacheFilename);
                    }
                } else {
                    console.error("このYouTubeのIDは無効のようです。: ", downloadingId, "内容: ", JSON.stringify(formats, null, "  "));
                }
                processEnd();
            } catch (e) {
                console.error("SourcePathManager: ダウンロードプロセス関数内でエラーを検出しました。", e);
                processEnd();
            }
        })();
    }
};

export const sourcePathManager = new SourcePathManager();
