import { spawn } from "child_process";
import { parentPort, workerData } from "worker_threads";
import { stringToErrorCode } from "../../func/dbmgrErrorCodeParser.js";
import * as youtubei from "youtubei.js";
import soundcloud from "soundcloud.ts";

const typeList = ["youtube", "youtubechicon", "twitter", "niconico", "soundcloud", "soundcloudavicon", "mbrelease", "mbrecording"];

if (!parentPort) process.exit(1);
if (typeof workerData.id !== "string") process.exit(1);
let validtype = false;
for (const typenm of typeList) if (workerData.type === typenm) validtype = true;
if (!validtype) process.exit(1);

const id: string = workerData.id;
const type: "youtube" | "youtubechicon" | "twitter" | "niconico" | "soundcloud" | "soundcloudavicon" | "mbrelease" | "mbrecording" = workerData.type;

/** 
 * yt-dlpを用いて　YouTube動画の情報を取得します。
 */
async function youtubeInfoGet(videoId: string): Promise<{
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
}> {
    const res = (await ytdlpProcess("https://youtube.com/watch?v=" + videoId, errChunk => {
        parentPort?.postMessage({ errorMsg: errChunk });
    }) as {
        /** タイトル */
        title: string;
        /** 説明 */
        description: string;
        /** チャンネル名 */
        channel: string;
        /** 最も品質の良いとされるサムネイル */
        thumbnail: string;
        /** チャンネルID */
        channel_id: string;
        /** ユーザーID */
        uploader_id?: string;
        /** Video ID */
        display_id: string;
    }[])[0];
    const check = ["title", "description", "channel", "thumbnail", "channel_id", "uploader", "display_id"];
    for (const name of check)
        if (typeof res[name as keyof typeof res] !== "string")
            throw new Error("「" + name + "」は正常なデータではありません。内容: " + res[name as keyof typeof res]);
    return {
        title: res.title,
        description: res.description,
        channelName: res.channel,
        thumbnailUrl: res.thumbnail,
        channelId: res.channel_id,
        userId: res.uploader_id,
        videoId: videoId
    }
}

/** 
 * yt-dlpを用いて　ニコニコ動画の情報を取得します。
 */
async function niconicoInfoGet(id: string): Promise<{
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
}> {
    const res = (await ytdlpProcess("https://nicovideo.jp/watch/" + id, errChunk => {
        parentPort?.postMessage({ errorMsg: errChunk });
    }) as {
        /** タイトル */
        title: string;
        /** 説明 */
        description: string;
        /** チャンネル名 */
        channel: string;
        /** チャンネルID */
        channel_id: string;
        /** 最も品質の良いとされるサムネイル */
        thumbnail: string;
        id: string;
    }[])[0];
    const check = ["title", "description", "thumbnail", "id"];
    for (const name of check)
        if (typeof res[name as keyof typeof res] !== "string")
            throw new Error("「" + name + "」は正常なデータではありません。内容: " + res[name as keyof typeof res]);

    return {
        title: res.title,
        description: res.description,
        channelName: res.channel,
        thumbnailUrl: res.thumbnail,
        channelId: res.channel_id,
        id: id
    }
}

/** 
 * yt-dlpを用いて　SoundCloudの情報を取得します。
 */
async function soundcloudInfoGet(id: string): Promise<{
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
}> {
    const res = (await ytdlpProcess("https://api-v2.soundcloud.com/tracks/" + id, errChunk => {
        parentPort?.postMessage({ errorMsg: errChunk });
    }) as {
        /** タイトル */
        title: string;
        /** 説明 */
        description: string | null;
        /** チャンネル名 */
        uploader: string;
        /** チャンネルID */
        uploader_id: string;
        /** 最も品質の良いとされるサムネイル */
        thumbnail: string;
        id: string;
    }[])[0];
    if (res === undefined) throw new Error("正常なデータではありません。")
    const check = ["title", "thumbnail", "uploader", "uploader_id", "id"];
    for (const name of check)
        if (typeof res[name as keyof typeof res] !== "string")
            throw new Error("「" + name + "」は正常なデータではありません。内容: " + res[name as keyof typeof res]);
    return {
        title: res.title,
        description: res.description,
        userName: res.uploader,
        thumbnailUrl: res.thumbnail,
        userId: res.uploader_id,
        id: id
    }
}

/** 
 * yt-dlpを用いて　Twitter動画の情報を取得します。
 */
async function twitterInfoGet(id: string): Promise<{
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
}[]> {
    const datas = await ytdlpProcess("https://x.com/i/web/status/" + id, errChunk => {
        parentPort?.postMessage({ errorMsg: errChunk });
    }) as {
        /** タイトル */
        title: string;
        /** 説明 */
        description: string;
        /** チャンネル名 */
        uploader: string;
        /** チャンネルID */
        channel_id: string;
        /** ユーザーID */
        uploader_id: string;
        /** 最も品質の良いとされるサムネイル */
        thumbnail: string;
        id: string;
    }[];
    const res: ({
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
    })[] = [];
    for (const r of datas) {
        const check = ["title", "description", "thumbnail", "id"];
        for (const name of check)
            if (typeof res[name as keyof typeof res] !== "string") continue;
        res.push({
            full: r.title,
            body: r.description,
            userName: r.uploader,
            thumbnailUrl: r.thumbnail,
            userId: r.uploader_id,
            id: id
        })
    }
    return res;
}

/**
 * yrdlpの実行をします。ytdlpのエラーが発生した際、自動で試行を行います。
 * 
 * - bot判定: 最大試行回数2回(1はfirefox cookieを使用、2はcoockies.txtを使用(存在しなければそのまま終了))
 */
function ytdlpProcess(url: string, errorCallback: (chunk: any) => void, continueStatus?: {
    type: "bot";
    number: number;
}) {
    return new Promise<any[]>((resolve, reject) => {
        const optionArgs: string[] = [];
        switch (continueStatus?.type) {
            case "bot": {
                continueStatus.number === 1 ? optionArgs.push("--cookies-from-browser", "firefox") : "";
                continueStatus.number === 2 ? optionArgs.push("--cookies", "./cookies.txt") : "";
                break;
            }
        }
        const proc = spawn("yt-dlp", ["-j", ...optionArgs, url]);
        proc.stdout.setEncoding("utf8");
        proc.stderr.setEncoding("utf8");
        let data: string = "";
        const errorCode: string[] = [];
        proc.on("close", code => {
            try {
                if (code === 0) {
                    const datas = data.split("\n").filter(Boolean);
                    const jsons: any[] = [];
                    for (const data of datas) jsons.push(JSON.parse(data));
                    resolve(jsons);
                } else {
                    throw new Error(`yt-dlpが予期しない理由で終了しました。終了コード: ${code}`)
                }
            } catch (e) {
                if (continueStatus) {
                    if (continueStatus.type === "bot") {
                        /** 全てのエラー再施行をした場合 */
                        if (continueStatus.number >= 2) return reject(e);
                        else ytdlpProcess(url, errorCallback, { type: "bot", number: continueStatus.number + 1 }).then(data => resolve(data)).catch(err => reject(err));
                    }
                } else {
                    if (errorCode.includes("ytdlp-10")) {
                        ytdlpProcess(url, errorCallback, { type: "bot", number: 1 }).then(data => resolve(data)).catch(err => reject(err));
                    } else reject(e);
                }
                /** もしbot判定された場合 */
            }
        });
        proc.stdout.on("data", chunk => { data += chunk; });
        proc.stderr.on("data", chunk => { errorCallback(chunk); errorCode.push(stringToErrorCode(String(chunk))) })
        proc.on("error", err => { reject(err); })
    })
}

export interface MusicBrainzReleaseInfo {
    uuid: string;
    /** アルバム名 */
    title: string;
    /** アーティスト名 */
    author: string;
    /** アルバム画像 */
    thumbnailUrl: string;
    /** 情報を取得した時の時刻です。 */
    infoGetTimestamp: number;
}

export interface MusicBrainzRecordingInfo {
    uuid: string;
    /** 曲名 */
    title: string;
    /** 情報を取得した時の時刻です。 */
    infoGetTimestamp: number;
}

function musicBrainzReleaseInfoGet(id: string) {
    return new Promise(async (resolve, reject) => {
        try {
            const releaseRes = await fetch("https://musicbrainz.org/ws/2/release/" + id + "?fmt=json&inc=artist-credits", {
                headers: {
                    "User-Agent": "discordMusicBot/1.0 (https://github.com/azkazunami36/discordMusicBot; contact: azkazunami36)",
                    "Accept": "application/json"
                }
            });
            const releaseJson: {
                title: string;
                id: string;
                "artist-credit": {
                    name: string;
                    joinphrase?: string;
                }[];
            } = await releaseRes.json();
            resolve({
                uuid: id,
                title: releaseJson.title,
                author: (() => {
                    let text = "";
                    for (const credit of releaseJson["artist-credit"])
                        text += credit.name + (credit.joinphrase || "")
                    return text;
                })(),
                thumbnailUrl: "https://coverartarchive.org/release/" + id + "/front",
                infoGetTimestamp: Date.now()
            });
        } catch (e) { reject(e) }
    });
}

function musicBrainzRecordingInfoGet(id: string) {
    return new Promise(async (resolve, reject) => {
        try {
            const recordingRes = await fetch("https://musicbrainz.org/ws/2/recording/" + id + "?fmt=json&inc=releases", {
                headers: {
                    "User-Agent": "discordMusicBot/1.0 (https://github.com/azkazunami36/discordMusicBot; contact: azkazunami36)",
                    "Accept": "application/json"
                }
            });
            const recordingJson: {
                id: string;
                data?: {
                    title: string;
                }
                title?: string;
            } = await recordingRes.json();
            resolve({
                uuid: id,
                title: recordingJson.data?.title || recordingJson.title,
                infoGetTimestamp: Date.now()
            });
        } catch (e) { reject(e) }
    });
}

async function youtubeUserIconGet(channelId: string) {
    try {
        const p = await youtubei.Innertube.create();
        const channel = await p.getChannel(channelId);
        const thumbs = channel.metadata.thumbnail;
        if (thumbs && thumbs.length >= 1) {
            let thumb = thumbs[0];
            thumbs.forEach(forthumb => { if (forthumb.width > thumb.width) thumb = forthumb });
            return thumb.url;
        }
    } catch { }
}

async function soundcloudUserIconGet(userId: string) {
    const a = new soundcloud.Soundcloud();
    const user = await a.users.get(userId);
    return user.avatar_url
}

switch (type) {
    case "youtube": youtubeInfoGet(id).then(data => parentPort?.postMessage({ data })).catch(e => { parentPort?.postMessage({ errorMsg: e }) }); break;
    case "twitter": twitterInfoGet(id).then(data => parentPort?.postMessage({ data })).catch(e => { parentPort?.postMessage({ errorMsg: e }) }); break;
    case "niconico": niconicoInfoGet(id).then(data => parentPort?.postMessage({ data })).catch(e => { parentPort?.postMessage({ errorMsg: e }) }); break;
    case "soundcloud": soundcloudInfoGet(id).then(data => parentPort?.postMessage({ data })).catch(e => { parentPort?.postMessage({ errorMsg: e }) }); break;
    case "mbrelease": musicBrainzReleaseInfoGet(id).then(data => parentPort?.postMessage({ data })).catch(e => { parentPort?.postMessage({ errorMsg: e }) }); break;
    case "mbrecording": musicBrainzRecordingInfoGet(id).then(data => parentPort?.postMessage({ data })).catch(e => { parentPort?.postMessage({ errorMsg: e }) }); break;
    case "youtubechicon": youtubeUserIconGet(id).then(data => parentPort?.postMessage({ data })).catch(e => { parentPort?.postMessage({ errorMsg: e }) }); break;
    case "soundcloudavicon": soundcloudUserIconGet(id).then(data => parentPort?.postMessage({ data })).catch(e => { parentPort?.postMessage({ errorMsg: e }) }); break;
}
