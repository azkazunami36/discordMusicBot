import fs from "fs";
import { exec, spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import { parseYtDlpProgressLine } from "./parseYtDlpProgressLine.js";
import { Playlist } from "./envJSON.js";

/** メディアデータを管理するクラスです。 */
export class SourcePathManager {
    #youtubeDownloading: {
        [videoId: string]: (func: () => void, statusCallback: (status: "loading" | "downloading" | "converting" | "done", body: {
            percent?: number;
        }) => void) => void;
    } = {}
    #niconicoDownloading: {
        [videoId: string]: (func: () => void, statusCallback: (status: "loading" | "downloading" | "converting" | "done", body: {
            percent?: number;
        }) => void) => void;
    } = {}
    #twitterDownloading: {
        [videoId: string]: (func: () => void, statusCallback: (status: "loading" | "downloading" | "converting" | "done", body: {
            percent?: number;
        }) => void) => void;
    } = {}
    constructor() { }
    /** VideoIDまたは特殊なIDから音声ファイルのパスを返します。 */
    async getAudioPath(playlistData: Playlist, statusCallback?: (status: "loading" | "downloading" | "converting" | "formatchoosing" | "done", body: {
        percent?: number;
        type?: "niconico" | "youtube" | "twitter"
    }) => void) {
        const statuscall = statusCallback || (st => { });
        statuscall("loading", {
            percent: 1
        });
        if (playlistData.type === "videoId") {
            const videoId = playlistData.body;
            // 1. フォルダ内を取得してVideoIDが一致するファイルが存在するかチェック。
            if (!fs.existsSync("./youtubeCache")) fs.mkdirSync("./youtubeCache");
            const files = fs.readdirSync("./youtubeCache");
            const result = files.find(file => file.startsWith(videoId + "."));
            // 2. 存在したらリターン、しなかったら取得。
            if (result) return "./youtubeCache/" + result;
            else {
                statuscall("formatchoosing", {
                    percent: 15,
                    type: "youtube"
                });
                if (this.#youtubeDownloading[videoId]) {
                    // 1. もしダウンロード中だったらこの処理では処理が終わるまでの待機を待つ。
                    await new Promise<void>(resolve => {
                        this.#youtubeDownloading[videoId](resolve, ((status, body) => { statuscall(status, body); }));
                    });
                } else {
                    // 2. もしまだダウンロードされてなかったら、ダウンロードを開始する。
                    const listener: (() => void)[] = [];
                    this.#youtubeDownloading[videoId] = function (func) { listener.push(func); };
                    // 3. その動画に関連づけられているデータから最適なフォーマットを取得する。
                    interface Format {
                        asr?: number;
                        format_id: string;
                        format_note: string;
                        resolution: string;
                    }
                    const formats: Format[] = await new Promise((resolve, reject) => {
                        let text = "";
                        const proc = exec('yt-dlp --print "%(formats)j" -q --extractor-args youtube:player_client=tv_embedded --cookies /Users/kazunami36_sum2/cookies.txt --no-warnings https://youtu.be/' + videoId, (err, stdout, stderr) => {
                            text += stdout;
                        });
                        proc.on("close", () => {
                            try { resolve(JSON.parse(text)) }
                            catch (e) {
                                console.log("次の動画のJSONをパースしようとしたらエラーが発生しました。", videoId, text);
                                reject(new Error("この動画(" + videoId + ")の解析を行うためにフォーマットリストを解析しようとした時にエラーが発生しました。: " + e));
                            }
                        })

                    });
                    function pickBestFormat(formats: Format[]): Format | undefined {
                        return formats
                            // まず条件に一致するものだけ残す
                            .filter(f => f.resolution === "audio only" && (
                                f.format_note === "Default, high" || f.format_note === "medium"
                            ))
                            // その中から asr が最大のものを選ぶ
                            .reduce<Format | undefined>((best, cur) => {
                                if (!best) return cur;
                                if ((cur.asr ?? 0) > (best.asr ?? 0)) return cur;
                                return best;
                            }, undefined);
                    }
                    const audioformat = pickBestFormat(formats);
                    // 4. もし取得できたらダウンロードをして拡張子・コンテナを修正する。
                    if (audioformat) {
                        statuscall("downloading", {
                            percent: 30,
                            type: "youtube"
                        });
                        await new Promise<void>((resolve, reject) => {
                            const cp = spawn("yt-dlp", [
                                "--progress", "--newline",
                                "-f", audioformat.format_id,
                                "-o", "youtubeCache/%(id)s-cache.%(ext)s",
                                "--progress-template", "%(progress)j",
                                "--extractor-args", 'youtube:player_client=tv_embedded',
                                "--cookies", "/Users/kazunami36_sum2/cookies.txt",
                                `https://youtu.be/${videoId}`
                            ], { cwd: process.cwd() });

                            cp.stdout.setEncoding("utf8");
                            cp.stderr.setEncoding("utf8");

                            cp.stdout.on("data", chunk => {
                                const progress = parseYtDlpProgressLine(String(chunk));
                                statuscall("downloading", {
                                    percent: 40 + ((progress?._percent || 0) / 100) * 20,
                                    type: "youtube"
                                });
                            });

                            cp.stderr.on("data", message => {
                                console.log(String(message));
                            });

                            cp.on("close", code => {
                                if (code === 0) resolve();
                                else reject(new Error(`yt-dlp exited with code ${code}`));
                            });

                            cp.on("error", e => reject(e));
                        });
                        const files = fs.readdirSync("./youtubeCache");
                        const cacheFilename = files.find(file => file.startsWith(videoId + "-cache."));
                        if (cacheFilename) {
                            statuscall("converting", {
                                percent: 70,
                                type: "youtube"
                            });
                            const info = await new Promise<ffmpeg.FfprobeData>(resolve => ffmpeg.ffprobe("./youtubeCache/" + cacheFilename, (err, data) => resolve(data)));
                            await new Promise<void>((resolve, reject) => {
                                exec(`ffmpeg -i youtubeCache/${cacheFilename} -c copy youtubeCache/${videoId}.${info.streams[0].codec_name === "aac" ? "m4a" : "ogg"}`, (err, stdout, stderr) => {
                                    if (err) return reject(err);
                                    resolve();
                                });
                            });
                            fs.unlinkSync("./youtubeCache/" + cacheFilename);
                        }
                    } else {
                        console.error("このYouTubeのIDは無効のようです。: ", playlistData);
                    }
                    // 5. 完了したことを伝えて終了。
                    for (const func of listener) func();
                    delete this.#youtubeDownloading[videoId];
                }
                statuscall("loading", {
                    percent: 90,
                    type: "youtube"
                });
                // 3. 再度フォルダ内を検索して、見つけたら出力。ないとundefined。
                const files = fs.readdirSync("./youtubeCache");
                const result = files.find(file => file.startsWith(videoId + "."));
                statuscall("done", {
                    percent: 100,
                    type: "youtube"
                });
                return "./youtubeCache/" + result;
            }
        }

        if (playlistData.type === "nicovideoId") {
            const nicovideoId = playlistData.body;
            // 1. フォルダ内を取得してVideoIDが一致するファイルが存在するかチェック。
            if (!fs.existsSync("./niconicoCache")) fs.mkdirSync("./niconicoCache");
            const files = fs.readdirSync("./niconicoCache");
            const result = files.find(file => file.startsWith(nicovideoId + "."));
            // 2. 存在したらリターン、しなかったら取得。
            if (result) return "./niconicoCache/" + result;
            else {
                statuscall("formatchoosing", {
                    percent: 15,
                    type: "niconico"
                });
                if (this.#niconicoDownloading[nicovideoId]) {
                    // 1. もしダウンロード中だったらこの処理では処理が終わるまでの待機を待つ。
                    await new Promise<void>(resolve => {
                        this.#niconicoDownloading[nicovideoId](resolve, ((status, body) => { statuscall(status, body); }));
                    });
                } else {
                    // 2. もしまだダウンロードされてなかったら、ダウンロードを開始する。
                    const listener: (() => void)[] = [];
                    this.#niconicoDownloading[nicovideoId] = function (func) { listener.push(func); };
                    // 3. その動画に関連づけられているデータから最適なフォーマットを取得する。
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
                        exec('yt-dlp --print "%(formats)j" -q --cookies /Users/kazunami36_sum2/cookies.txt --no-warnings --add-header "Referer:https://www.nicovideo.jp/" https://www.nicovideo.jp/watch/' + nicovideoId, (err, stdout, stderr) => {
                            if (stderr) console.log(stderr);
                            try { resolve(JSON.parse(stdout)) }
                            catch (e) {
                                console.log(nicovideoId);
                                reject(e);
                            }
                        });
                    });

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

                        // 2) "Main Audio" を優先（"Main Audio, high" など含む広い判定）
                        const mainAudio = audioCandidates.filter(f =>
                            (f.format_note ?? '').toLowerCase().includes('main audio')
                        );

                        const pool = mainAudio.length > 0 ? mainAudio : audioCandidates;

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
                        statuscall("downloading", {
                            percent: 30,
                            type: "niconico"
                        });
                        await new Promise<void>((resolve, reject) => {
                            const cp = spawn("yt-dlp", [
                                "--progress", "--newline",
                                "-f", audioformat.format_id,
                                "-o", "niconicoCache/%(id)s-cache.%(ext)s",
                                "--progress-template", "%(progress)j",
                                "--cookies", "/Users/kazunami36_sum2/cookies.txt",
                                "--add-header", "Referer:https://www.nicovideo.jp/",
                                `https://www.nicovideo.jp/watch/${nicovideoId}`
                            ], { cwd: process.cwd() });

                            cp.stdout.setEncoding("utf8");
                            cp.stderr.setEncoding("utf8");

                            cp.stdout.on("data", chunk => {
                                const progress = parseYtDlpProgressLine(String(chunk));
                                statuscall("downloading", {
                                    percent: 40 + ((progress?._percent || 0) / 100) * 20,
                                    type: "niconico"
                                });
                            });

                            cp.stderr.on("data", message => {
                                console.log(String(message));
                            });

                            cp.on("close", code => {
                                if (code === 0) resolve();
                                else reject(new Error(`yt-dlp exited with code ${code}`));
                            });

                            cp.on("error", e => reject(e));
                        });
                        const files = fs.readdirSync("./niconicoCache");
                        const cacheFilename = files.find(file => file.startsWith(nicovideoId + "-cache."));
                        if (cacheFilename) {
                            statuscall("converting", {
                                percent: 70,
                                type: "niconico"
                            });
                            const info = await new Promise<ffmpeg.FfprobeData>(resolve => ffmpeg.ffprobe("./niconicoCache/" + cacheFilename, (err, data) => resolve(data)));
                            await new Promise<void>((resolve, reject) => {
                                exec(`ffmpeg -i niconicoCache/${cacheFilename} -c copy niconicoCache/${nicovideoId}.${info.streams[0].codec_name === "aac" ? "m4a" : "ogg"}`, (err, stdout, stderr) => {
                                    if (err) return reject(err);
                                    resolve();
                                });
                            });
                            fs.unlinkSync("./niconicoCache/" + cacheFilename);
                        }
                    } else {
                        console.error("このYouTubeのIDは無効のようです。: ", playlistData, formats, audioformat);
                    }
                    // 5. 完了したことを伝えて終了。
                    for (const func of listener) func();
                    delete this.#niconicoDownloading[nicovideoId];
                }
                statuscall("loading", {
                    percent: 90,
                    type: "niconico"
                });
                // 3. 再度フォルダ内を検索して、見つけたら出力。ないとundefined。
                const files = fs.readdirSync("./niconicoCache");
                const result = files.find(file => file.startsWith(nicovideoId + "."));
                statuscall("done", {
                    percent: 100,
                    type: "niconico"
                });
                return "./niconicoCache/" + result;
            }
        }

        if (playlistData.type === "twitterId") {
            const twitterId = playlistData.body;
            // 1. フォルダ内を取得してVideoIDが一致するファイルが存在するかチェック。
            if (!fs.existsSync("./twitterCache")) fs.mkdirSync("./twitterCache");
            const files = fs.readdirSync("./twitterCache");
            const result = files.find(file => file.startsWith(twitterId + "."));
            // 2. 存在したらリターン、しなかったら取得。
            if (result) return "./twitterCache/" + result;
            else {
                statuscall("formatchoosing", {
                    percent: 15,
                    type: "twitter"
                });
                if (this.#twitterDownloading[twitterId]) {
                    // 1. もしダウンロード中だったらこの処理では処理が終わるまでの待機を待つ。
                    await new Promise<void>(resolve => {
                        this.#twitterDownloading[twitterId](resolve, ((status, body) => { statuscall(status, body); }));
                    });
                } else {
                    // 2. もしまだダウンロードされてなかったら、ダウンロードを開始する。
                    const listener: (() => void)[] = [];
                    this.#twitterDownloading[twitterId] = function (func) { listener.push(func); };
                    // 3. その動画に関連づけられているデータから最適なフォーマットを取得する。
                    interface Format {
                        format_id: string;
                        format_note: string;
                        resolution: string;
                    }
                    const formats: Format[] = await new Promise((resolve, reject) => {
                        exec('yt-dlp --print "%(formats)j" -q --cookies /Users/kazunami36_sum2/cookies.txt --no-warnings https://www.x.com/i/web/status/' + twitterId, (err, stdout, stderr) => {
                            try { console.log(stdout); resolve(JSON.parse(stdout)) }
                            catch (e) {
                                console.log(twitterId);
                                reject(e);
                            }
                        });
                    });
                    function pickBestFormat(formats: Format[]): Format | undefined {
                        return formats
                            // まず条件に一致するものだけ残す
                            .filter(f => f.resolution === "audio only")[0];
                    }
                    const audioformat = pickBestFormat(formats);
                    // 4. もし取得できたらダウンロードをして拡張子・コンテナを修正する。
                    if (audioformat) {
                        statuscall("downloading", {
                            percent: 30,
                            type: "twitter"
                        });
                        await new Promise<void>((resolve, reject) => {
                            const cp = spawn("yt-dlp", [
                                "--progress", "--newline",
                                "-f", audioformat.format_id,
                                "-o", "twitterCache/%(id)s-cache.%(ext)s",
                                "--progress-template", "%(progress)j",
                                "--cookies", "/Users/kazunami36_sum2/cookies.txt",
                                "--add-header", "Referer:https://www.nicovideo.jp/",
                                `https://www.x.com/i/web/status/${twitterId}`
                            ], { cwd: process.cwd() });

                            cp.stdout.setEncoding("utf8");
                            cp.stderr.setEncoding("utf8");

                            cp.stdout.on("data", chunk => {
                                const progress = parseYtDlpProgressLine(String(chunk));
                                statuscall("downloading", {
                                    percent: 40 + ((progress?._percent || 0) / 100) * 20,
                                    type: "twitter"
                                });
                            });

                            cp.stderr.on("data", message => {
                                console.log(String(message));
                            });

                            cp.on("close", code => {
                                if (code === 0) resolve();
                                else reject(new Error(`yt-dlp exited with code ${code}`));
                            });

                            cp.on("error", e => reject(e));
                        });
                        const files = fs.readdirSync("./twitterCache");
                        const cacheFilename = files.find(file => file.startsWith(twitterId + "-cache."));
                        if (cacheFilename) {
                            statuscall("converting", {
                                percent: 70,
                                type: "twitter"
                            });
                            const info = await new Promise<ffmpeg.FfprobeData>(resolve => ffmpeg.ffprobe("./twitterCache/" + cacheFilename, (err, data) => resolve(data)));
                            await new Promise<void>((resolve, reject) => {
                                exec(`ffmpeg -i twitterCache/${cacheFilename} -c copy twitterCache/${twitterId}.${info.streams[0].codec_name === "aac" ? "m4a" : "ogg"}`, (err, stdout, stderr) => {
                                    if (err) return reject(err);
                                    resolve();
                                });
                            });
                            fs.unlinkSync("./twitterCache/" + cacheFilename);
                        }
                    }
                    // 5. 完了したことを伝えて終了。
                    for (const func of listener) func();
                    delete this.#twitterDownloading[twitterId];
                }
                statuscall("loading", {
                    percent: 90,
                    type: "twitter"
                });
                // 3. 再度フォルダ内を検索して、見つけたら出力。ないとundefined。
                const files = fs.readdirSync("./twitterCache");
                const result = files.find(file => file.startsWith(twitterId + "."));
                statuscall("done", {
                    percent: 100,
                    type: "twitter"
                });
                return "./twitterCache/" + result;
            }
        }
    }
};

export const sourcePathManager = new SourcePathManager();
