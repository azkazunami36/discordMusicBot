import fs from "fs";
import { exec, spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import { parseYtDlpProgressLine } from "./parseYtDlpProgressLine.js";
import { Playlist } from "./envJSON.js";

/** メディアデータを管理するクラスです。 */
export const sourcePathManager = new class SourcePathManager {
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
    constructor() {}
    /** VideoIDまたは特殊なIDから音声ファイルのパスを返します。 */
    async getAudioPath(playlistData: Playlist, statusCallback?: (status: "loading" | "downloading" | "converting" | "formatchoosing" | "done", body: {
        percent?: number;
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
                    percent: 15
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
                        exec('yt-dlp --print "%(formats)j" -q --extractor-args youtube:player_client=tv_embedded --cookies-from-browser chrome --no-warnings https://youtu.be/' + videoId, (err, stdout, stderr) => {
                            try { resolve(JSON.parse(stdout)) }
                            catch (e) {
                                console.log(videoId);
                                reject(e);
                            }
                        });
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
                            percent: 30
                        });
                        await new Promise<void>((resolve, reject) => {
                            const cp = spawn("yt-dlp", [
                                "--progress", "--newline",
                                "-f", audioformat.format_id,
                                "-o", "youtubeCache/%(id)s-cache.%(ext)s",
                                "--progress-template", "%(progress)j",
                                "--extractor-args", 'youtube:player_client=tv_embedded',
                                "--cookies-from-browser", "chrome",
                                `https://youtu.be/${videoId}`
                            ], { cwd: process.cwd() });

                            cp.stdout.setEncoding("utf8");
                            cp.stderr.setEncoding("utf8");

                            cp.stdout.on("data", chunk => {
                                const progress = parseYtDlpProgressLine(String(chunk));
                                statuscall("downloading", { percent: 40 + ((progress?._percent || 0) / 100) * 20 });
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
                                percent: 70
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
                    }
                    // 5. 完了したことを伝えて終了。
                    for (const func of listener) func();
                    delete this.#youtubeDownloading[videoId];
                }
                statuscall("loading", {
                    percent: 90
                });
                // 3. 再度フォルダ内を検索して、見つけたら出力。ないとundefined。
                const files = fs.readdirSync("./youtubeCache");
                const result = files.find(file => file.startsWith(videoId + "."));
                statuscall("done", {
                    percent: 100
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
                    percent: 15
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
                    }
                    const formats: Format[] = await new Promise((resolve, reject) => {
                        exec('yt-dlp --print "%(formats)j" -q --cookies-from-browser chrome --no-warnings --add-header "Referer:https://www.nicovideo.jp/" https://www.nicovideo.jp/watch/' + nicovideoId, (err, stdout, stderr) => {
                            try { resolve(JSON.parse(stdout)) }
                            catch (e) {
                                console.log(nicovideoId);
                                reject(e);
                            }
                        });
                    });
                    function pickBestFormat(formats: Format[]): Format | undefined {
                        return formats
                            // まず条件に一致するものだけ残す
                            .filter(f => f.resolution === "audio only" && (
                                f.format_note === "Main Audio, high"
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
                            percent: 30
                        });
                        await new Promise<void>((resolve, reject) => {
                            const cp = spawn("yt-dlp", [
                                "--progress", "--newline",
                                "-f", audioformat.format_id,
                                "-o", "niconicoCache/%(id)s-cache.%(ext)s",
                                "--progress-template", "%(progress)j",
                                "--cookies-from-browser", "chrome",
                                "--add-header", "Referer:https://www.nicovideo.jp/",
                                `https://www.nicovideo.jp/watch/${nicovideoId}`
                            ], { cwd: process.cwd() });

                            cp.stdout.setEncoding("utf8");
                            cp.stderr.setEncoding("utf8");

                            cp.stdout.on("data", chunk => {
                                const progress = parseYtDlpProgressLine(String(chunk));
                                statuscall("downloading", { percent: 40 + ((progress?._percent || 0) / 100) * 20 });
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
                                percent: 70
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
                    }
                    // 5. 完了したことを伝えて終了。
                    for (const func of listener) func();
                    delete this.#niconicoDownloading[nicovideoId];
                }
                statuscall("loading", {
                    percent: 90
                });
                // 3. 再度フォルダ内を検索して、見つけたら出力。ないとundefined。
                const files = fs.readdirSync("./niconicoCache");
                const result = files.find(file => file.startsWith(nicovideoId + "."));
                statuscall("done", {
                    percent: 100
                });
                return "./niconicoCache/" + result;
            }
        }
    }
};
