import fs, { constants } from "fs";
import fsPromise from "fs/promises";
import { exec, execSync, spawn } from "child_process";
import util from "util";
import ffmpeg, { FfprobeData } from "fluent-ffmpeg";
import { Playlist } from "./envJSON.js";
import { SumLog } from "./sumLog.js";
import { ytDlpInfoGet } from "../worker/helper/createByChatGPT/ytDlpInfoGetHelper.js";
import { parseYtDlpProgressLine, pickBestAudioFormat, pickBestThumbnail, YtDlpFormat, YtDlpThumbnail } from "../createByChatGPT/ytDlp.js";

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
export interface Picture {
    type: "twitterThumbnail";
    body: string;
    number?: number;
}

/** メディアデータを管理するクラスです。 */
export class SourcePathManager {
    #downloadingQueues: {
        /** 種類を識別します。 */
        playlist: Playlist | Picture;
        /** ステータスです。ここで閲覧することも可能です。途中からキューに追加された時に一番最初のステータスコールバックをする際に役立ちます。 */
        status: Status;
        /** 進捗です。ステータスと併用してください。 */
        percent: number;
        /** ここに関数を入れると、完了した時に入れられた関数を発火します。 */
        processedCallback: ((err?: unknown) => void)[];
        /** ここに関数を入れるとステータスが転移した時に入れられた関数を発火します。 */
        statusCallback: ((status: Status, percent: number) => void)[];
    }[] = [];
    async getAudioPath(playlistData: Playlist, statusCallback?: (status: Status, percent: number) => void) {
        if (statusCallback) statusCallback("loading", 1);
        const type = playlistData.type;
        const folderPath = type === "videoId" ? "./youtubeCache" : type === "nicovideoId" ? "./niconicoCache" : type === "twitterId" ? "./twitterCache" : undefined;
        if (!folderPath) {
            SumLog.error("現時点で対応していない種類が選ばれました。", { functionName: "SourcePathManager getAudioPath" });
            return console.error("SourcePathManager: 現時点で対応していない種類が選ばれました。", type);
        }
        if (!await fsPromise.access(folderPath, constants.R_OK).then(() => true).catch(() => false)) await fsPromise.mkdir(folderPath);
        const files = await fsPromise.readdir(folderPath);
        const result = files.find(file => file.startsWith(playlistData.body + (playlistData.type === "twitterId" ? "-" + (playlistData.number || 1) : "") + "."));
        if (result) return folderPath + "/" + result;
        else {
            await this.addQueue(playlistData, statusCallback);
            if (statusCallback) statusCallback("loading", 95);
            const files = await fsPromise.readdir(folderPath);
            const result = files.find(file => file.startsWith(playlistData.body + (playlistData.type === "twitterId" ? "-" + (playlistData.number || 1) : "") + "."));
            if (statusCallback) statusCallback("done", 100);
            if (result) return folderPath + "/" + result;
            else return undefined;
        }
    }
    async getThumbnailPath(pictureData: Picture, statusCallback?: (status: Status, percent: number) => void) {
        if (statusCallback) statusCallback("loading", 1);
        const type = pictureData.type;
        const folderPath = type === "twitterThumbnail" ? "./twitterThumbnailCache" : undefined;
        if (!folderPath) {
            SumLog.error("現時点で対応していない種類が選ばれました。", { functionName: "SourcePathManager getAudioPath" });
            return console.error("SourcePathManager: 現時点で対応していない種類が選ばれました。", type);
        }
        if (!await fsPromise.access(folderPath, constants.R_OK).then(() => true).catch(() => false)) await fsPromise.mkdir(folderPath);
        const files = await fsPromise.readdir(folderPath);
        const result = files.find(file => file.startsWith(pictureData.body + (pictureData.type === "twitterThumbnail" ? "-" + (pictureData.number || 1) : "") + "."));
        if (result) return folderPath + "/" + result;
        else {
            await this.addQueue(pictureData, statusCallback);
            if (statusCallback) statusCallback("loading", 95);
            const files = await fsPromise.readdir(folderPath);
            const result = files.find(file => file.startsWith(pictureData.body + (pictureData.type === "twitterThumbnail" ? "-" + (pictureData.number || 1) : "") + "."));
            if (statusCallback) statusCallback("done", 100);
            if (result) return folderPath + "/" + result;
            else return undefined;
        }
    }
    addQueue(playlistData: Playlist | Picture, statusCallback?: (status: Status, percent: number) => void) {
        const existIs = this.#downloadingQueues.find(downloadingQueue => downloadingQueue.playlist.body === playlistData.body);
        if (existIs === undefined) {
            SumLog.log("キューに" + playlistData.body + "を追加しました。", { functionName: "SourcePathManager addQueue" });
            this.#downloadingQueues.push({
                playlist: playlistData,
                status: "queue",
                percent: 5,
                statusCallback: [],
                processedCallback: []
            });
        } else {
            SumLog.log("キューに存在している" + playlistData.body + "を待機しています。", { functionName: "SourcePathManager addQueue" });
        }
        const downloadingQueue = this.#downloadingQueues.find(downloadingQueue => downloadingQueue.playlist.body === playlistData.body);
        if (!downloadingQueue) {
            SumLog.error("通常なら存在するはずのキューを取得できず、処理を続行できませんでした。", { functionName: "SourcePathManager addQueue" });
            return console.error("通常なら存在するはずのキューを取得できず、処理を続行できませんでした。");
        }
        if (statusCallback) {
            statusCallback(downloadingQueue.status, downloadingQueue.percent);
            downloadingQueue.statusCallback.push(statusCallback);
        }
        this.downloadProcess(); // 実際に待機するのは下のprocessedCallbackなのでこの関数で待機をしない。
        return new Promise<void>((resolve, reject) => { downloadingQueue.processedCallback.push((err) => { if (!err) resolve(); else reject(err); }); });
    }
    downloadProcess() {
        const downloadings = this.#downloadingQueues.filter(downloadingQueue => downloadingQueue.status === "converting" || downloadingQueue.status === "downloading" || downloadingQueue.status === "formatchoosing");
        if (downloadings.length >= 5) return;
        const downloadingQueue = this.#downloadingQueues.find(downloadingQueue => downloadingQueue.status === "queue");
        if (downloadingQueue === undefined) return SumLog.log("ダウンロードキューを全て消化しました。ダウンロード中が" + downloadings.length + "つです。", { functionName: "SourcePathManager downloadProcess" });
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
        const processEnd = (e?: unknown) => {
            console.log("ダウンロードプロセスの終了: ", downloadingId, downloadingGet()?.status);
            const downloadingInfo = downloadingGet();
            if (downloadingInfo) downloadingInfo.processedCallback.forEach(func => { try { func(e) } catch (e) { console.error("SourcePathManager: コールバック先でエラーが発生しました。", e) } });
            const index = this.#downloadingQueues.findIndex(downloadingQueue => downloadingQueue.playlist.body === downloadingId);
            if (index !== -1) this.#downloadingQueues.splice(index, 1);
            const downloading = this.#downloadingQueues.filter(downloadingQueue => downloadingQueue.status === "converting" || downloadingQueue.status === "downloading" || downloadingQueue.status === "formatchoosing");
            SumLog.log(downloadingId + "のダウンロードプロセスが完了しました。ダウンロード中が" + downloading.length + "つで、処理中などを含めた全てのキューの数が" + this.#downloadingQueues.length + "つです。", { functionName: "SourcePathManager downloadProcess" })
            this.downloadProcess();
        }
        status("formatchoosing", 30);
        this.downloadProcess();
        const type = downloadingQueue.playlist.type;
        const folderPath = type === "videoId" ? "youtubeCache" : type === "nicovideoId" ? "niconicoCache" : type === "twitterId" ? "twitterCache" : type === "twitterThumbnail" ? "twitterThumbnailCache" : undefined;
        if (!folderPath) {
            processEnd();
            return console.error("SourcePathManager: 通常存在しないといけない変数が存在しませんでした。もしかしたら不具合が起きるかもしれません。種類を判別できませんでした。", downloadingQueue);
        }
        // 1. その動画に関連づけられているデータから最適なフォーマットを取得する。

        let audioformat: YtDlpFormat | undefined;
        let thumbnailformat: YtDlpThumbnail | undefined;
        let info;
        (async () => {
            try {
                if (downloadingQueue.playlist.type === "twitterThumbnail") {
                    status("downloading", 40);
                    info = await ytDlpInfoGet(downloadingQueue.playlist);
                    const thumbnails = info[(downloadingQueue.playlist.number || 1) - 1].thumbnails;
                    if (!thumbnails) throw new Error("サムネイルが１つもありませんでした。");
                    thumbnailformat = pickBestThumbnail(thumbnails);
                    if (!thumbnailformat?.url) throw new Error("サムネイルが１つもありませんでした。");
                    const splitedUrl = thumbnailformat.url.split("?")[0].split(".");
                    const ext = splitedUrl[splitedUrl.length - 1];
                    if (!thumbnailformat?.url) throw new Error("サムネイルが１つもありませんでした。");
                    const res = await fetch(thumbnailformat.url);
                    fs.writeFileSync("./" + folderPath + "/" + downloadingId + "-" + (downloadingQueue.playlist.number || 1) + "." + ext, Buffer.from(await res.arrayBuffer()));
                    return processEnd();
                }
                info = await ytDlpInfoGet(downloadingQueue.playlist);
                    status("downloading", 40);
                    await new Promise<void>((resolve, reject) => {
                        let errmsg = "";
                        const retry = (err?: any) => {
                            SumLog.warn("yt-dlpでダウンロードしようとしたらエラーが発生しました。１つ目のリトライ関数で再施行します。理由となるエラーはこのような内容です。" + util.format(err), { functionName: "SourcePathManager downloadProcess" });
                            const cp = spawn("yt-dlp", [
                                "--progress", "--newline",
                                "-f", "bestaudio[ext=webm]/bestaudio[acodec^=mp4a]/bestaudio/best",
                                "-o", folderPath + "/%(id)s" + (downloadingQueue.playlist.type === "twitterId" ? "-" + (downloadingQueue.playlist.number || 1) : "") + "-cache.%(ext)s",
                                "--progress-template", "%(progress)j",
                                "--cookies-from-browser", "firefox",
                                ...(() => {
                                    if (type === "nicovideoId") return ["--add-header", "Referer:https://www.nicovideo.jp/"]
                                    if (type === "twitterId") return ["--playlist-items", String(downloadingQueue.playlist.number || 1)]
                                    return []
                                })(),
                                (type === "videoId" ? "https://youtu.be/" : type === "twitterId" ? "https://x.com/i/web/status/" : "https://www.nicovideo.jp/watch/") + downloadingId
                            ], { cwd: process.cwd() });

                            cp.stdout.setEncoding("utf8");
                            cp.stderr.setEncoding("utf8");

                            cp.stdout.on("data", chunk => {
                                const progress = parseYtDlpProgressLine(String(chunk));
                                status("downloading", 40 + ((progress?._percent || 0) / 100) * 20);
                            });

                            cp.stderr.on("data", message => {
                                errmsg += message;
                            });

                            cp.on("close", code => {
                                if (code === 0) resolve();
                                else retry2(errmsg);
                            });

                            cp.on("error", e => { retry2(errmsg) });
                        }
                        const retry2 = (err?: any) => {
                            SumLog.warn("yt-dlpでダウンロードしようとしたらエラーが発生しました。２つめのリトライ関数で再施行します。理由となるエラーはこのような内容です。" + util.format(err), { functionName: "SourcePathManager downloadProcess" });
                            const cp = spawn("yt-dlp", [
                                "--progress", "--newline",
                                "-f", "bestaudio[ext=webm]/bestaudio[acodec^=mp4a]/bestaudio/best",
                                "-o", folderPath + "/%(id)s" + (downloadingQueue.playlist.type === "twitterId" ? "-" + (downloadingQueue.playlist.number || 1) : "") + "-cache.%(ext)s",
                                "--progress-template", "%(progress)j",
                                ...(() => {
                                    if (type === "twitterId") return ["--playlist-items", String(downloadingQueue.playlist.number || 1)]
                                    return []
                                })(),
                                (type === "videoId" ? "https://youtu.be/" : type === "twitterId" ? "https://x.com/i/web/status/" : "https://www.nicovideo.jp/watch/") + downloadingId
                            ], { cwd: process.cwd() });

                            cp.stdout.setEncoding("utf8");
                            cp.stderr.setEncoding("utf8");

                            cp.stdout.on("data", chunk => {
                                const progress = parseYtDlpProgressLine(String(chunk));
                                status("downloading", 40 + ((progress?._percent || 0) / 100) * 20);
                            });

                            cp.stderr.on("data", message => {
                                errmsg += message;
                            });

                            cp.on("close", code => {
                                if (code === 0) resolve();
                                else reject(new Error(`yt-dlp exited with code ${code}: ` + errmsg, err));
                            });

                            cp.on("error", e => reject({ one: err, two: e, errmsg }));
                        }
                        const cp = spawn("yt-dlp", [
                            "--progress", "--newline",
                            "-f", "bestaudio[ext=webm]/bestaudio[acodec^=mp4a]/bestaudio/best",
                            "-o", folderPath + "/%(id)s" + (downloadingQueue.playlist.type === "twitterId" ? "-" + downloadingId + "-" + (downloadingQueue.playlist.number || 1) : "") + "-cache.%(ext)s",
                            "--progress-template", "%(progress)j",
                            "--cookies-from-browser", "firefox",
                            ...(() => {
                                if (type === "videoId") return ["--extractor-args", 'youtube:player_client=tv_embedded']
                                if (type === "nicovideoId") return ["--add-header", "Referer:https://www.nicovideo.jp/"]
                                if (type === "twitterId") return ["--playlist-items", String(downloadingQueue.playlist.number || 1)]
                                return []
                            })(),
                            (type === "videoId" ? "https://youtu.be/" : type === "twitterId" ? "https://x.com/i/web/status/" : "https://www.nicovideo.jp/watch/") + downloadingId
                        ], { cwd: process.cwd() });

                        cp.stdout.setEncoding("utf8");
                        cp.stderr.setEncoding("utf8");

                        cp.stdout.on("data", chunk => {
                            const progress = parseYtDlpProgressLine(String(chunk));
                            status("downloading", 40 + ((progress?._percent || 0) / 100) * 20);
                        });

                        cp.stderr.on("data", message => {
                            errmsg += message;
                        });

                        cp.on("close", code => {
                            if (code === 0) resolve();
                            else retry(errmsg);
                        });

                        cp.on("error", e => { retry(errmsg) });
                    });
                    const files = await fsPromise.readdir("./" + folderPath);
                    const cacheFilename = files.find(file => file.match(downloadingId + (downloadingQueue.playlist.type === "twitterId" ? "-" + (downloadingQueue.playlist.number || 1) : "") + "-cache."));
                    if (cacheFilename) {
                        status("converting", 70);
                        try {
                            const info: FfprobeData = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => ffmpeg.ffprobe("./" + folderPath + "/" + cacheFilename, (err, data) => { if (!err) resolve(data); else reject(err) }));
                            await new Promise<void>((resolve, reject) => {
                                exec(`ffmpeg -i ${folderPath}/${cacheFilename} -vn -c copy ${folderPath}/${downloadingId}${downloadingQueue.playlist.type === "twitterId" ? "-" + (downloadingQueue.playlist.number || 1) : ""}.${info.streams.filter(stream => stream.codec_name === "aac").length !== 0 ? "m4a" : "ogg"}`, (err, stdout, stderr) => {
                                    if (err) return reject(err);
                                    resolve();
                                });
                            });
                            await fsPromise.unlink("./" + folderPath + "/" + cacheFilename);
                        } catch (e) {
                            await fsPromise.unlink("./" + folderPath + "/" + cacheFilename);
                            throw e;
                        }
                    }
                processEnd();
            } catch (e) {
                SumLog.error("ダウンロードプロセス中にエラーが発生しました。ログを確認してください。", { functionName: "SourcePathManager downloadProcess" });
                console.log("ダウンロードに使用したフォーマットは次です。", audioformat, " フォーマット全てです。", info)
                console.error("SourcePathManager: ダウンロードプロセス関数内でエラーを検出しました。", e);
                console.error(e);
                processEnd(e);
            }
        })();
    }
};

export const sourcePathManager = new SourcePathManager();
