import fs, { stat } from "fs";
import { exec, spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import { parseYtDlpProgressLine } from "./parseYtDlpProgressLine.js";

/** メディアデータを管理するクラスです。 */
export const sourcePathManager = new class SourcePathManager {
    #downloading: {
        [videoId: string]: (func: () => void, statusCallback: (status: "loading" | "downloading" | "converting" | "done", body: {
            percent?: number;
        }) => void) => void;
    } = {}
    constructor() {
        if (!fs.existsSync("./cache")) fs.mkdirSync("./cache");
    }
    /** VideoIDまたは!から始まる特殊なIDから音声ファイルのパスを返します。 */
    async getAudioPath(videoId: string, statusCallback?: (status: "loading" | "downloading" | "converting" | "formatchoosing" | "done", body: {
        percent?: number;
    }) => void) {
        const statuscall = statusCallback || (st => { });
        statuscall("loading", {});
        // 1. フォルダ内を取得してVideoIDが一致するファイルが存在するかチェック。
        const files = fs.readdirSync("./cache");
        const result = files.find(file => file.startsWith(videoId + "."));
        // 2. 存在したらリターン、しなかったら取得。
        if (result) return result;
        else {
            statuscall("formatchoosing", {});
            if (this.#downloading[videoId]) {
                // 1. もしダウンロード中だったらこの処理では処理が終わるまでの待機を待つ。
                await new Promise<void>(resolve => {
                    this.#downloading[videoId](resolve, ((status, body) => { statuscall(status, body); }));
                });
            } else {
                // 2. もしまだダウンロードされてなかったら、ダウンロードを開始する。
                const listener: (() => void)[] = [];
                this.#downloading[videoId] = function (func) { listener.push(func); };
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
                    statuscall("downloading", {});
                    await new Promise<void>((resolve, reject) => {
                        const cp = spawn("yt-dlp", [
                            "--progress", "--newline",
                            "-f", audioformat.format_id,
                            "-o", "cache/%(id)s-cache.%(ext)s",
                            "--progress-template", "%(progress)j",
                            "--extractor-args", 'youtube:player_client=tv_embedded',
                            "--cookies-from-browser", "chrome",
                            `https://youtu.be/${videoId}`
                        ], { cwd: process.cwd() });

                        cp.stdout.setEncoding("utf8");
                        cp.stderr.setEncoding("utf8");

                        cp.stdout.on("data", chunk => {
                            const progress = parseYtDlpProgressLine(String(chunk));
                            statuscall("downloading", { percent: progress?._percent });
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
                    const files = fs.readdirSync("./cache");
                    const cacheFilename = files.find(file => file.startsWith(videoId + "-cache."));
                    if (cacheFilename) {
                        statuscall("converting", {});
                        const info = await new Promise<ffmpeg.FfprobeData>(resolve => ffmpeg.ffprobe("./cache/" + cacheFilename, (err, data) => resolve(data)));
                        await new Promise<void>((resolve, reject) => {
                            exec(`ffmpeg -i cache/${cacheFilename} -c copy cache/${videoId}.${info.streams[0].codec_name === "aac" ? "m4a" : "ogg"}`, (err, stdout, stderr) => {
                                if (err) return reject(err);
                                resolve();
                            });
                        });
                        fs.unlinkSync("./cache/" + cacheFilename);
                    }
                }
                // 5. 完了したことを伝えて終了。
                for (const func of listener) func();
                delete this.#downloading[videoId];
            }
            statuscall("loading", {});
            // 3. 再度フォルダ内を検索して、見つけたら出力。ないとundefined。
            const files = fs.readdirSync("./cache");
            const result = files.find(file => file.startsWith(videoId + "."));
            statuscall("done", {});
            return result;
        }
    }
};
