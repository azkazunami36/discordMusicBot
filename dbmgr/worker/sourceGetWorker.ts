import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import fsP from "fs/promises";
import fluentffmpeg from "fluent-ffmpeg";
import { resolve } from "path";
import { stringToErrorCode } from "../../func/dbmgrErrorCodeParser.js";

const typeList = ["youtube", "twitter", "niconico", "soundcloud", "url"];

if (!parentPort) process.exit(1);
if (typeof workerData.id !== "string") process.exit(1);
let validtype = false;
for (const typenm of typeList) if (workerData.type === typenm) validtype = true;
if (!validtype) process.exit(1);
const selectitem = (() => {
    const num = Number(workerData.itemNumber);
    if (Number.isNaN(num)) return 1;
    if (num <= 0) return 1;
    return num;
})();

const id: string = workerData.id;
const type: "youtube" | "twitter" | "niconico" | "soundcloud" | "url" = workerData.type;

switch (type) {
    case "youtube": sourceGetMasterFunction(id, "./youtube", ["https://youtube.com/watch?v=", ""]); break;
    case "twitter": sourceGetMasterFunction(id, "./twitter", ["https://x.com/i/web/status/", ""]); break;
    case "niconico": sourceGetMasterFunction(id, "./niconico", ["https://www.nicovideo.jp/watch/", ""]); break;
    case "soundcloud": sourceGetMasterFunction(id, "./soundcloud", ["https://api-v2.soundcloud.com/tracks/", ""]); break;
    case "url": throw "";
}

/**
 * 取得する関数の共通部分です。
 * 
 * folderPathには保存に使用するフォルダパスを入力してください。
 * 
 * urlには0番目にidより前側のURL文字列、1番目にidより後側の文字列を入力してください。例: 
 * ```ts
 * // もしIDが「hoge」の場合。
 * sourceGetMasterFunction("hoge", "path/to/folder", ["https://example.com/?v=", "&test=true"]); // https://example.com/?v=hoge&test=true
 * ```
 * 
 * urlをそのまま入力するとidを適切な場面で使用できないため、idとurlの文字列は分けて引数に入力する形式とさせています。
 */
function sourceGetMasterFunction(videoId: string, folderPath: string, url: [string, string]) {
    function progress(progress: number) {
        parentPort?.postMessage({ progress });
    }
    progress(0);
    const random = (() => {
        for (let i = 0; i <= 500; i++) {
            const random = randomUUID();
            if (fs.existsSync(folderPath + "/" + random)) continue;
            fs.mkdirSync(folderPath + "/" + random, { recursive: true });
            return random;
        }
        parentPort?.postMessage({ errorMsg: new Error("500回一時フォルダ作成チャレンジを行いましたが、全てにおいてUUIDが重複しました。fs.existSyncにてcontinueを発火する条件であるパスが存在するかで500回成功したことが理由です。処理は強制終了しました。") });
        throw "強制終了。";
    })();

    function ytdlpProcess(savename: string, url: string, args: string[], continueStatus?: {
        type: "bot";
        number: number;
    }) {
        const optionArgs: string[] = [];
        switch (continueStatus?.type) {
            case "bot": {
                continueStatus.number === 1 ? optionArgs.push("--cookies-from-browser", "firefox") : "";
                continueStatus.number === 2 ? optionArgs.push("--cookies", "./cookies.txt") : "";
                break;
            }
        }
        return new Promise<string>((resolve, reject) => {
            const errorCode: string[] = [];
            const proc = spawn("yt-dlp", ["-f", "ba*", "--progress", "--newline", "--progress-template", "%(progress)j", "-o", savename, ...(args ? args : []), ...optionArgs, url]);
            proc.stdout.setEncoding("utf8");
            proc.stderr.setEncoding("utf8");
            proc.stdout.on("data", chunk => {
                const da = ytdlp進捗状況パーサー(chunk);
                const total_bytes = da?.total_bytes || da?.total_bytes_estimate;
                if (da?.downloaded_bytes !== undefined && total_bytes !== undefined && total_bytes > 0) {
                    progress((da.downloaded_bytes / total_bytes) * 50);
                }
            });
            proc.stderr.on("data", chunk => { parentPort?.postMessage({ errorMsg: chunk }); errorCode.push(stringToErrorCode(String(chunk))) });
            proc.on("error", err => {
                parentPort?.postMessage({ errorMsg: err });
                fs.rmSync(folderPath + "/" + random, { recursive: true, force: true });
            })
            proc.on("close", () => {
                try {
                    const dir = fs.readdirSync(folderPath + "/" + random);
                    const beforefile = dir.find(value => value.match(videoId));
                    if (!beforefile) throw new Error("yt-dlpでダウンロードしたファイルを見つけられませんでした。");
                    resolve(beforefile);
                } catch (e) {
                    if (continueStatus) {
                        if (continueStatus.type === "bot") {
                            /** 全てのエラー再施行をした場合 */
                            if (continueStatus.number >= 2) return reject(e);
                            else ytdlpProcess(savename, url, args, { type: "bot", number: continueStatus.number + 1 }).then(data => resolve(data)).catch(err => reject(err));
                        }
                    } else {
                        if (errorCode.includes("ytdlp-10")) {
                            ytdlpProcess(savename, url, args, { type: "bot", number: 1 }).then(data => resolve(data)).catch(err => reject(err));
                        } else reject(e);
                    }
                }
            });
        })
    }
    ytdlpProcess(folderPath + "/" + random + "/" + videoId + (type === "twitter" ? "-" + selectitem : "") + "-before.%(ext)s", url[0] + videoId + url[1], (type === "twitter" ? ["--playlist-items", String(selectitem)] : [])).then(beforefile => {
        progress(50);
        fluentffmpeg.ffprobe(folderPath + "/" + random + "/" + beforefile, (err, data) => {
            if (err) return parentPort?.postMessage({ errorMsg: err });
            try {
                const duration = Number(data.streams.reduce((a, data) => Number(a.duration) && Number(data.duration) && Number(a.duration) < Number(data.duration) ? data : a).duration);
                const fileTypeIs = (() => {
                    for (const stream of data.streams) {
                        switch (stream.codec_name) {
                            case "aac": return { type: "aac", stream };
                            case "opus": return { type: "opus", stream };
                            case "ogg": return { type: "ogg", stream };

                        }
                    }
                    return { type: undefined, stream: data.streams[0] as fluentffmpeg.FfprobeStream | undefined }
                })();
                const convertffmpeg = spawn("ffmpeg", ["-i", folderPath + "/" + random + "/" + beforefile, "-vn", "-c:a", fileTypeIs === undefined ? "libopus" : "copy", folderPath + "/" + random + "/" + videoId + (type === "twitter" ? "-" + selectitem : "") + "." + (fileTypeIs.type === "aac" ? "m4a" : "ogg")]);
                convertffmpeg.stdout.setEncoding("utf8");
                convertffmpeg.stderr.setEncoding("utf8");
                convertffmpeg.on("error", err => {
                    parentPort?.postMessage({ errorMsg: err });
                    fs.rmSync(folderPath + "/" + random, { recursive: true, force: true });
                })
                convertffmpeg.stdout.on("data", chunk => parentPort?.postMessage({ errorMsg: chunk }));
                convertffmpeg.stderr.on("data", chunk => {
                    if (String(chunk).startsWith("Error")) {
                        parentPort?.postMessage({ errorMsg: chunk })
                    }
                    const da = FFmpeg進捗状況パーサー(chunk);
                    if (da) progress(50 + ((da.time / duration) * 50));
                });
                convertffmpeg.on("close", async () => {
                    try {
                        const fileinfolder = fs.readdirSync(folderPath + "/" + random);
                        const file = fileinfolder.find(value => value.match(videoId + (type === "twitter" ? "-" + selectitem : "") + "." + (fileTypeIs.type === "aac" ? "m4a" : "ogg")));
                        if (!file) {
                            parentPort?.postMessage({ errorMsg: new Error("FFmpegで変換を試みましたが、変換が完了したファイルが存在しませんでした。") });
                        } else {
                            fs.renameSync(folderPath + "/" + random + "/" + file, folderPath + "/" + file);
                            const datastatus = await fsP.stat(folderPath + "/" + file);
                            parentPort?.postMessage({
                                data: {
                                    filename: file,
                                    sourceInfo: {
                                        duration: fileTypeIs.stream ? Number(fileTypeIs.stream.duration) : undefined,
                                        size: datastatus.size
                                    }
                                }
                            });
                            progress(100);
                        }
                        fs.rmSync(folderPath + "/" + random, { recursive: true, force: true });
                    } catch (e) {
                        parentPort?.postMessage({ errorMsg: e });
                        fs.rmSync(folderPath + "/" + random, { recursive: true, force: true });
                        throw e;
                    }
                })
            } catch (e) {
                parentPort?.postMessage({ errorMsg: e });
                fs.rmSync(folderPath + "/" + random, { recursive: true, force: true });
                throw e;
            }
        });
    }).catch(e => {
        parentPort?.postMessage({ errorMsg: e });
        fs.rmSync(folderPath + "/" + random, { recursive: true, force: true });
        throw e;
    })
};

function ytdlp進捗状況パーサー(string: string) {
    try {
        const json: {
            status?: string;
            downloaded_bytes?: number;
            total_bytes?: number;
            tmpfilename?: string;
            filename?: string;
            eta?: number;
            speed?: number;
            elapsed?: number;
            total_bytes_estimate?: number;
            ctx_id?: null;
        } = JSON.parse(string.replaceAll("\n", ""));
        return json;
    } catch (e) {
        return undefined;
    }
}

function FFmpeg進捗状況パーサー(string: string) {
    const json: {
        frame: number | null;
        fps: number | null;
        q: number | null;
        size: number | null;
        time: number | null;
        bitrate: number | null;
        speed: number | null;
        elapsed: number | null;
    } = {
        frame: null,
        fps: null,
        q: null,
        size: null,
        time: null,
        bitrate: null,
        speed: null,
        elapsed: null
    }
    const スペースでとりあえず分割 = string.split(" ").filter(Boolean);
    const プロパティ名リスト = Object.keys(json);
    /**
     * ここには値とキーがイコールで包まれるように整形されたデータが入ります。
     */
    const 生データ: string[] = [];
    for (const プロパティ名 of プロパティ名リスト) {
        const プロパティ名と一致する場所 = スペースでとりあえず分割.findIndex((value, index) => {
            return value.startsWith(プロパティ名);
        });
        if (プロパティ名と一致する場所 === -1) continue;
        const プロパティ名と一致するデータ = スペースでとりあえず分割[プロパティ名と一致する場所];

        const 生の値 = プロパティ名と一致するデータ === プロパティ名 + "=" ? プロパティ名と一致するデータ + スペースでとりあえず分割[プロパティ名と一致する場所 + 1] : プロパティ名と一致するデータ;
        生データ.push(生の値);
        const value = 生の値.split("=")[1];
        if (value === undefined) continue;
        if (プロパティ名 === "frame" || プロパティ名 === "fps" || プロパティ名 === "q") {
            json[プロパティ名] = Number(value);
            continue;
        }
        if (プロパティ名 === "time" || プロパティ名 === "elapsed") {
            /** 一番右が秒。時間:分:秒.00のような形式であると予測される。 */
            const nums = value.split(":");
            let second = 0;
            for (let i = 0; i < nums.length; i++) {
                const num = nums[i];
                second += Number(num) * (60 ** (nums.length - i - 1));
            }
            json[プロパティ名] = second;
        }
        if (プロパティ名 === "size") {
            if (value.endsWith("KiB")) json.size = Number(value.slice(0, value.length - 3));
            if (value.endsWith("kB")) json.size = Number(value.slice(0, value.length - 2));
        }
        if (プロパティ名 === "bitrate") {
            if (value.endsWith("kbits/s")) json.bitrate = Number(value.slice(0, value.length - 7));
        }
        if (プロパティ名 === "speed") {
            if (value.endsWith("x")) json.speed = Number(value.slice(0, value.length - 1));
        }
    }
    if (json.size !== null && json.speed !== null && json.time !== null) {
        return {
            elapsed: json.elapsed,
            fps: json.fps,
            frame: json.frame,
            size: json.size,
            speed: json.speed,
            time: json.time,
            q: json.q,
            bitrate: json.bitrate
        };
    }
}
