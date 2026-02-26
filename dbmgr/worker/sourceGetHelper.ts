import { Worker } from "worker_threads";
import { statusErrorCodeDbmgrFormat, stringToErrorCode } from "../../func/dbmgrErrorCodeParser.js";

/** 
 * yt-dlpを用いて　YouTube動画のデータを取得します。返り値はファイル名です。
 */
export function youtubeSourceGet(videoId: string, callback?: (progress: number) => void) {
    const progress = callback || (() => { });
    return new Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>(resolve => workerstartup(videoId, "youtube", progress, resolve))
}
/** 
 * yt-dlpを用いて　Twitter動画のデータを取得します。返り値はファイル名です。
 */
export function twitterSourceGet(videoId: string, itemNumber: number, callback?: (progress: number) => void) {
    const progress = callback || (() => { });
    return new Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>(resolve => workerstartup(videoId, "twitter", progress, resolve, itemNumber))
}
/** 
 * yt-dlpを用いて　ニコニコ動画のデータを取得します。返り値はファイル名です。
 */
export function niconicoSourceGet(videoId: string, callback?: (progress: number) => void) {
    const progress = callback || (() => { });
    return new Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>(resolve => workerstartup(videoId, "niconico", progress, resolve))
}
/** 
 * yt-dlpを用いて　SoundCloudのデータを取得します。返り値はファイル名です。
 */
export function soundcloudSourceGet(videoId: string, callback?: (progress: number) => void) {
    const progress = callback || (() => { });
    return new Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>(resolve => workerstartup(videoId, "soundcloud", progress, resolve))
}

function workerstartup(videoId: string, type: "youtube" | "niconico" | "twitter" | "soundcloud", progress: (progress: number) => void, resolve: (string: statusErrorCodeDbmgrFormat<{
    filename: string;
    sourceInfo: {
        duration?: number;
        size: number;
    }
}>) => void, itemNumber?: number) {
    const errorCode: string[] = [];
    try {
        const worker = new Worker(new URL("./sourceGetWorker.js", import.meta.url), { workerData: { id: videoId, type, itemNumber } });
        let processDone = false;
        let data: {
            filename: string;
            sourceInfo: {
                duration?: number;
                size: number;
            }
        } | undefined;
        worker.on("message", async message => {
            if (message.errorMsg) {
                errorCode.push(stringToErrorCode(String(message.errorMsg)));
                return;
            }
            if (message.data !== undefined) {
                if (!processDone) {
                    processDone = true;
                    data = message.data;
                }
            }
            if (message.progress !== undefined) progress(message.progress);
        })
        worker.on("exit", code => {
            if (!processDone) {
                processDone = true;
                resolve({
                    status: "error",
                    reject: {
                        errorCode: errorCode,
                        message: "意図しない理由で" + type + "動画取得関数は終了しました。"
                    }
                });
            }
            if (processDone && data !== undefined) {
                resolve({
                    status: "success",
                    resolve: data
                });
            }
        })
        worker.on("error", err => {
            errorCode.push(stringToErrorCode(String(err)));
            resolve({
                status: "error",
                reject: {
                    errorCode: errorCode,
                    message: "ワーカーエラーが発生しました。"
                }
            });
        })
    } catch (e) {
        errorCode.push(stringToErrorCode(String(e)));
        resolve({
            status: "error",
            reject: {
                errorCode: errorCode,
                message: "ワーカーの動作中にエラーが発生しました。予想外の挙動をした可能性があります。"
            }
        })
    }
}
