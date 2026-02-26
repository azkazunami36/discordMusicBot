import { Worker } from "worker_threads";
import { MusicBrainzRecordingInfo, MusicBrainzReleaseInfo } from "./infoGetWorker.js";
import { rejectDbmgrErrorCodeFormat, statusErrorCodeDbmgrFormat, stringToErrorCode } from "../../func/dbmgrErrorCodeParser.js";

export interface YouTubeInfo {
    /** タイトル */
    title: string;
    /** 説明 */
    description: string;
    /** チャンネル名 */
    channelName: string;
    /** サムネイルURL */
    thumbnailUrl: string;
    /** チャンネルID */
    channelId: string;
    /** ユーザーID */
    userId?: string;
    /** VideoID */
    videoId: string;
}
/** 
 * yt-dlpを用いて　YouTube動画の情報を取得します。
 * エラーはdbmgrErrorCode対応です。100%rejectせず、resolveにエラーJSONを返します。
 */
export function youtubeInfoGet(videoId: string) {
    return new Promise<statusErrorCodeDbmgrFormat<YouTubeInfo>>(resolve => {
        const errorCode: string[] = [];
        try {
            const worker = new Worker(new URL("./infoGetWorker.js", import.meta.url), { workerData: { id: videoId, type: "youtube" } });
            let processDone = false;
            worker.on("message", async message => {
                if (message.errorMsg) {
                    errorCode.push(stringToErrorCode(String(message.errorMsg)));
                    return;
                }
                if (message.data !== undefined) {
                    if (!processDone) {
                        processDone = true;
                        resolve({ status: "success", resolve: message.data });
                    }
                }
            })
            worker.on("exit", code => {
                if (!processDone) {
                    processDone = true;
                    resolve({
                        status: "error",
                        reject: {
                            errorCode: errorCode,
                            message: "意図しない理由でYouTube情報取得関数は終了しました。"
                        }
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
    })
}

export interface niconicoInfo {
    /** タイトル */
    title: string;
    /** ID */
    id: string;
    /** 説明 */
    description: string;
    /** チャンネル名 */
    channelName?: string;
    /** チャンネルID */
    channelId?: string;
    /** サムネイルURL */
    thumbnailUrl: string;
}

/** 
 * yt-dlpを用いて　ニコニコ動画の情報を取得します。
 * エラーはdbmgrErrorCode対応です。100%rejectせず、resolveにエラーJSONを返します。
 */
export function niconicoInfoGet(videoId: string) {
    return new Promise<statusErrorCodeDbmgrFormat<niconicoInfo>>(resolve => {
        const errorCode: string[] = [];
        try {
            const worker = new Worker(new URL("./infoGetWorker.js", import.meta.url), { workerData: { id: videoId, type: "niconico" } });
            let processDone = false;
            let errormsg = "";
            worker.on("message", async message => {
                if (message.errorMsg) {
                    errormsg += message.errorMsg;
                    return;
                }
                if (message.data !== undefined) {
                    if (!processDone) {
                        processDone = true;
                        resolve({ status: "success", resolve: message.data });
                    }
                }
            })
            worker.on("exit", code => {
                if (!processDone) {
                    processDone = true;
                    console.error("意図しない理由でTwitter情報取得関数は終了しました。終了コード: ", code, " yt-dlp: ", errormsg);
                    resolve({
                        status: "error",
                        reject: {
                            errorCode: ["0"],
                            message: errormsg
                        }
                    });
                }
            })
            worker.on("error", err => {
                console.error("エラーが発生しました。ワーカーのエラーとyt-dlpのエラーを記載します。yt-dlp: ", errormsg, ", \nworker: ", err)
                resolve({
                    status: "error",
                    reject: {
                        errorCode: ["0"],
                        message: errormsg + String(err)
                    }
                });
            })
        } catch (e) {
            console.error("ワーカーの動作中にエラーが発生しました。予想外の挙動をした可能性があります。", e)
            resolve({
                status: "error",
                reject: {
                    errorCode: ["0"],
                    message: String(e)
                }
            })
        }
    })
}

export interface SoundCloudInfo {
    /** タイトル */
    title: string;
    /** ID */
    id: string;
    /** 説明 */
    description: string | null;
    /** ユーザー名 */
    userName: string;
    /** ユーザーID */
    userId: string;
    /** サムネイルURL */
    thumbnailUrl: string;
}
/** 
 * yt-dlpを用いて　SoundCloudの情報を取得します。
 * エラーはdbmgrErrorCode対応です。100%rejectせず、resolveにエラーJSONを返します。
 */
export function soundcloudInfoGet(videoId: string) {
    return new Promise<statusErrorCodeDbmgrFormat<SoundCloudInfo>>(resolve => {
        const errorCode: string[] = [];
        try {
            const worker = new Worker(new URL("./infoGetWorker.js", import.meta.url), { workerData: { id: videoId, type: "soundcloud" } });
            let processDone = false;
            let errormsg = "";
            worker.on("message", async message => {
                if (message.errorMsg) {
                    errormsg += message.errorMsg;
                    return;
                }
                if (message.data !== undefined) {
                    if (!processDone) {
                        processDone = true;
                        resolve({ status: "success", resolve: message.data });
                    }
                }
            })
            worker.on("exit", code => {
                if (!processDone) {
                    processDone = true;
                    console.error("意図しない理由でTwitter情報取得関数は終了しました。終了コード: ", code, " yt-dlp: ", errormsg);
                    resolve({
                        status: "error",
                        reject: {
                            errorCode: ["0"],
                            message: errormsg
                        }
                    });
                }
            })
            worker.on("error", err => {
                console.error("エラーが発生しました。ワーカーのエラーとyt-dlpのエラーを記載します。yt-dlp: ", errormsg, ", \nworker: ", err)
                resolve({
                    status: "error",
                    reject: {
                        errorCode: ["0"],
                        message: errormsg + String(err)
                    }
                });
            })
        } catch (e) {
            console.error("ワーカーの動作中にエラーが発生しました。予想外の挙動をした可能性があります。", e)
            resolve({
                status: "error",
                reject: {
                    errorCode: ["0"],
                    message: String(e)
                }
            })
        }
    })
}

export interface TwitterInfo {
    /** ID */
    id: string;
    /** 内容 */
    full: string;
    /** 概要 */
    body: string;
    /** ユーザー名 */
    userName?: string;
    /** ユーザーID */
    userId?: string;
    /** サムネイルURL */
    thumbnailUrl: string;
}
/** 
 * yt-dlpを用いて　Twitter動画の情報を取得します。
 * エラーはdbmgrErrorCode対応です。100%rejectせず、resolveにエラーJSONを返します。
 */
export function twitterInfoGet(videoId: string) {
    return new Promise<statusErrorCodeDbmgrFormat<TwitterInfo[]>>(resolve => {
        const errorCode: string[] = [];
        try {
            const worker = new Worker(new URL("./infoGetWorker.js", import.meta.url), { workerData: { id: videoId, type: "twitter" } });
            let processDone = false;
            let errormsg = "";
            worker.on("message", async message => {
                if (message.errorMsg) {
                    errormsg += message.errorMsg;
                    return;
                }
                if (message.data !== undefined) {
                    if (!processDone) {
                        processDone = true;
                        resolve({ status: "success", resolve: message.data });
                    }
                }
            })
            worker.on("exit", code => {
                if (!processDone) {
                    processDone = true;
                    console.error("意図しない理由でTwitter情報取得関数は終了しました。終了コード: ", code, " yt-dlp: ", errormsg);
                    resolve({
                        status: "error",
                        reject: {
                            errorCode: ["0"],
                            message: errormsg
                        }
                    });
                }
            })
            worker.on("error", err => {
                console.error("エラーが発生しました。ワーカーのエラーとyt-dlpのエラーを記載します。yt-dlp: ", errormsg, ", \nworker: ", err)
                resolve({
                    status: "error",
                    reject: {
                        errorCode: ["0"],
                        message: errormsg + String(err)
                    }
                });
            })
        } catch (e) {
            console.error("ワーカーの動作中にエラーが発生しました。予想外の挙動をした可能性があります。", e)
            resolve({
                status: "error",
                reject: {
                    errorCode: ["0"],
                    message: String(e)
                }
            })
        }
    })
}

/** 
 * MusicBrainzのReleaseの情報を取得します。
 * エラーはdbmgrErrorCode対応です。100%rejectせず、resolveにエラーJSONを返します。
 */
export function musicBrainzReleaseInfoGet(videoId: string) {
    return new Promise<statusErrorCodeDbmgrFormat<MusicBrainzReleaseInfo>>(resolve => {
        const errorCode: string[] = [];
        try {
            const worker = new Worker(new URL("./infoGetWorker.js", import.meta.url), { workerData: { id: videoId, type: "mbrelease" } });
            let processDone = false;
            let errormsg = "";
            worker.on("message", async message => {
                if (message.errorMsg !== undefined) {
                    errormsg += message.errorMsg;
                    return;
                }
                if (message.data !== undefined) {
                    if (!processDone) {
                        processDone = true;
                        resolve({ status: "success", resolve: message.data });
                    }
                }
            })
            worker.on("exit", code => {
                if (!processDone) {
                    processDone = true;
                    console.error("意図しない理由でTwitter情報取得関数は終了しました。終了コード: ", code, " yt-dlp: ", errormsg);
                    resolve({
                        status: "error",
                        reject: {
                            errorCode: ["0"],
                            message: errormsg
                        }
                    });
                }
            })
            worker.on("error", err => {
                console.error("エラーが発生しました。ワーカーのエラーとyt-dlpのエラーを記載します。yt-dlp: ", errormsg, ", \nworker: ", err)
                resolve({
                    status: "error",
                    reject: {
                        errorCode: ["0"],
                        message: errormsg + String(err)
                    }
                });
            })
        } catch (e) {
            console.error("ワーカーの動作中にエラーが発生しました。予想外の挙動をした可能性があります。", e)
            resolve({
                status: "error",
                reject: {
                    errorCode: ["0"],
                    message: String(e)
                }
            })
        }
    })
}

/** 
 * MusicBrainzのRecordingの情報を取得します。
 * エラーはdbmgrErrorCode対応です。100%rejectせず、resolveにエラーJSONを返します。
 */
export function musicBrainzRecordingInfoGet(videoId: string) {
    return new Promise<statusErrorCodeDbmgrFormat<MusicBrainzRecordingInfo>>(resolve => {
        const errorCode: string[] = [];
        try {
            const worker = new Worker(new URL("./infoGetWorker.js", import.meta.url), { workerData: { id: videoId, type: "mbrecording" } });
            let processDone = false;
            let errormsg = "";
            worker.on("message", async message => {
                if (message.errorMsg !== undefined) {
                    errormsg += message.errorMsg;
                    return;
                }
                if (message.data !== undefined) {
                    if (!processDone) {
                        processDone = true;
                        resolve({ status: "success", resolve: message.data });
                    }
                }
            })
            worker.on("exit", code => {
                if (!processDone) {
                    processDone = true;
                    console.error("意図しない理由でTwitter情報取得関数は終了しました。終了コード: ", code, " yt-dlp: ", errormsg);
                    resolve({
                        status: "error",
                        reject: {
                            errorCode: ["0"],
                            message: errormsg
                        }
                    });
                }
            })
            worker.on("error", err => {
                console.error("エラーが発生しました。ワーカーのエラーとyt-dlpのエラーを記載します。yt-dlp: ", errormsg, ", \nworker: ", err)
                resolve({
                    status: "error",
                    reject: {
                        errorCode: ["0"],
                        message: errormsg + String(err)
                    }
                });
            })
        } catch (e) {
            console.error("ワーカーの動作中にエラーが発生しました。予想外の挙動をした可能性があります。", e)
            resolve({
                status: "error",
                reject: {
                    errorCode: ["0"],
                    message: String(e)
                }
            })
        }
    })
}

export function youtubeUserIconGet(channelId: string) {
    return new Promise<statusErrorCodeDbmgrFormat<string>>(resolve => {
        const errorCode: string[] = [];
        try {
            const worker = new Worker(new URL("./infoGetWorker.js", import.meta.url), { workerData: { id: channelId, type: "youtubechicon" } });
            let processDone = false;
            worker.on("message", async message => {
                if (message.errorMsg) {
                    errorCode.push(stringToErrorCode(String(message.errorMsg)));
                    return;
                }
                if (message.data !== undefined) {
                    if (!processDone) {
                        processDone = true;
                        resolve({ status: "success", resolve: message.data });
                    }
                }
            })
            worker.on("exit", code => {
                if (!processDone) {
                    processDone = true;
                    resolve({
                        status: "error",
                        reject: {
                            errorCode: errorCode,
                            message: "意図しない理由でYouTubeユーザーアイコン情報取得関数は終了しました。"
                        }
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
    });
}

export function soundcloudUserIconGet(userId: string) {
    return new Promise<statusErrorCodeDbmgrFormat<string>>(resolve => {
        const errorCode: string[] = [];
        try {
            const worker = new Worker(new URL("./infoGetWorker.js", import.meta.url), { workerData: { id: userId, type: "soundcloudavicon" } });
            let processDone = false;
            worker.on("message", async message => {
                if (message.errorMsg) {
                    errorCode.push(stringToErrorCode(String(message.errorMsg)));
                    return;
                }
                if (message.data !== undefined) {
                    if (!processDone) {
                        processDone = true;
                        resolve({ status: "success", resolve: message.data });
                    }
                }
            })
            worker.on("exit", code => {
                if (!processDone) {
                    processDone = true;
                    resolve({
                        status: "error",
                        reject: {
                            errorCode: errorCode,
                            message: "意図しない理由でSoundCloudユーザーアイコン情報取得関数は終了しました。"
                        }
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
    });
}
