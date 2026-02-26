import fs from "fs";
import fsPromise from "fs/promises";
import express from "express";
import mime from "mime";
import path from "path";

import { musicBrainzRecordingInfoGet, musicBrainzReleaseInfoGet, niconicoInfo, niconicoInfoGet, SoundCloudInfo, soundcloudInfoGet, soundcloudUserIconGet, TwitterInfo, twitterInfoGet, YouTubeInfo, youtubeInfoGet, youtubeUserIconGet } from "./worker/infoGetHelper.js";
import { MusicBrainzRecordingInfo, MusicBrainzReleaseInfo } from "./worker/infoGetWorker.js";
import { niconicoSourceGet, soundcloudSourceGet, twitterSourceGet, youtubeSourceGet } from "./worker/sourceGetHelper.js";
import { jsonAnalizer } from "./worker/jsonAnalyzerHelper.js";
import { rejectDbmgrErrorCodeFormat, statusErrorCodeDbmgrFormat, stringToErrorCode } from "../func/dbmgrErrorCodeParser.js";
import { getOldData } from "../func/getOldData.js";
import { stringToServiceParser } from "../func/stringToServiceParser.js";

process.on("uncaughtException", err => {
    console.error("キャッチされずグローバルで発生した例外。これは重大なエラーです。エラーイベントをつかめていません。\n", err);
});

process.on("unhandledRejection", err => {
    console.error("未処理の拒否。これは重大なエラーです。エラーイベントをつかめていません。\n", err);
});

/**
 * ミュージックライブラリです。
 * 
 * YouTube、ニコニコ動画、Twitter、オリジナルソースに対応。
 */

/** マスター関数です。このプログラムはこの関数を実行することで起動します。main()は一番下で呼び出しています。 */
async function main() {
    console.log("ミュージックライブラリを起動しています...")
    console.log(await jsonAnalizer());
    console.log("このプロセスのCWD: " + process.cwd());
    console.log("このメインプロセスファイルが置いてあるパス: " + new URL("./", import.meta.url).pathname);
    /**
     * JSONの取得です。このプログラムのすべてのデータが保存されています。
     * 
     * 取得に失敗するとプログラムがこの場所で終了します。
     */
    const json = getJSON();
    console.log("ミュージックライブラリ用JSONの初期化(読み込み)が完了しました。")
    await getOldData(new URL("../../discordMusicBot", import.meta.url).pathname, json);
    /**
     * YouTubeなどの動画情報と音声データを管理するクラスです。ダウンロードを並列で実行したり、複数の同じ要求が来ても重複しないで丁寧に実行してくれる賢い関数です。
     */
    const sourcemanager = new SourceManager(json);
    const app = express();
    /**
     * データの取得をするルーティングです。JSONからバイナリまで担当します。
     */
    app.get("/*splat", (req, res) => get(req, res, json, sourcemanager));
    app.post("/*splat", (req, res) => post(req, res, json, sourcemanager));
    app.listen("81", () => { console.log("ミュージックライブラリのAPIホストが開始しました。") });
}

/**
 * Getリクエストの処理内容です。 
 * 
 * 基本的に４つのステータスコードしか吐きません。
 * - 200: JSONまたは音声のフルです。
 * - 206: 音声の部分取得です。
 * - 400: 不正なリクエストURLです。
 * - 404: 音声データの取得に失敗している可能性が高いです。大抵の場合、存在しなかったり、許可されていない音声リクエストである場合が多いです。これらをひっくるめて「404エラー、素材は存在しない」としています。
 * 
 * 404のエラーについてはJSONで事細かくエラーを解説しています。エラーコードがJSONに埋め込まれている場合、それを`dbmgrErrorCodeParser`関数でチェックすると日本語でエラー概要と詳細の解説をしてくれます。
 */
async function get(req: express.Request, res: express.Response, json: MusicLibraryJSON, sourcemanager: SourceManager) {
    /**
     * リクエストのURLが正しいかどうかのチェックなどを行います。正しくない場合、resに400エラーを送信するため、undefinedの場合は関数をそのまま終了してください。
     */
    const parseData = validGetRequestParse(req, res);
    if (!parseData) return;
    /**
     * 音声を返答する関数です。現在の実装ではStreamのpipeで突然エラーが発生すると通信に障害が発生する恐れがあります。
     */
    async function audioResponse(req: express.Request, res: express.Response, type: string, sourceInfo?: SourceInfo | null, errorCode?: string[]) {
        const headers = new Headers({ "Accept-Ranges": "bytes" });
        if (!sourceInfo) {
            const header = new Headers();
            header.set("content-type", "application/json");
            res.setHeaders(header);
            res.status(404);
            res.end(JSON.stringify({ dbmgrErrorCode: ["1-1", ...(errorCode ? errorCode : [])] }));
            return;
        }
        const length = sourceInfo.size;
        const range = parseRange(req.headers.range, length);
        headers.set("content-length", String(range.end - range.start + 1));
        const contentType = mime.getType(path.extname(sourceInfo.filename).replace(".", ""));
        headers.set("content-type", contentType ?? "application/octet-stream");
        if (req.headers.range) headers.set("content-range", "bytes " + range.start + "-" + (range.end === 0 ? 0 : range.end - 1) + "/" + length);
        /** SourceInfoの情報を元に物理ファイルの存在確認。存在しない場合は存在しない返信をする。 */
        if (!await new Promise<boolean>((resolve) => fsPromise.stat("./" + type + "/" + sourceInfo?.filename).then(() => resolve(true)).catch(() => resolve(false)))) {
            const header = new Headers();
            header.set("content-type", "application/json");
            res.setHeaders(header);
            res.status(404);
            res.end(JSON.stringify({ dbmgrErrorCode: ["1-2", ...(errorCode ? errorCode : [])] }));
            return;
        }
        const stream = fs.createReadStream("./" + type + "/" + sourceInfo.filename, range);
        res.setHeaders(headers);
        req.headers.range ? res.status(206) : res.status(200);
        stream.pipe(res);
    }
    switch (parseData.servicetype) {
        case "youtube": {
            if (parseData.datatype === "audio") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.getYouTube(parseData.id, false, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                await audioResponse(req, res, "youtube", data?.info.sourceInfo, errorCodes);
            }
            if (parseData.datatype === "json") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.getYouTube(parseData.id, true, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                if (!data) {
                    const header = new Headers();
                    header.set("content-type", "application/json");
                    res.setHeaders(header);
                    res.status(404);
                    res.end(JSON.stringify({ dbmgrErrorCode: ["2-1", ...errorCodes] }));
                    break;
                }
                const header = new Headers();
                header.set("content-type", "application/json");
                res.setHeaders(header);
                res.status(200);
                res.end(JSON.stringify(data));
            }
            break;
        }
        case "niconico": {
            if (parseData.datatype === "audio") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.getniconico(parseData.id, false, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                await audioResponse(req, res, "niconico", data?.info.sourceInfo, errorCodes)
            }
            if (parseData.datatype === "json") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.getniconico(parseData.id, true, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                if (!data) {
                    const header = new Headers();
                    header.set("content-type", "application/json");
                    res.setHeaders(header);
                    res.status(404);
                    res.end(JSON.stringify({ dbmgrErrorCode: ["2-1", ...errorCodes] }));
                    break;
                }
                const header = new Headers();
                header.set("content-type", "application/json");
                res.setHeaders(header);
                res.status(200);
                res.end(JSON.stringify(data));
            }
            break;
        }
        case "soundcloud": {
            if (parseData.datatype === "audio") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.getSoundCloud(parseData.id, false, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                await audioResponse(req, res, "soundcloud", data?.info.sourceInfo, errorCodes)
            }
            if (parseData.datatype === "json") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.getSoundCloud(parseData.id, true, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                if (!data) {
                    const header = new Headers();
                    header.set("content-type", "application/json");
                    res.setHeaders(header);
                    res.status(404);
                    res.end(JSON.stringify({ dbmgrErrorCode: ["2-1", ...errorCodes] }));
                    break;
                }
                const header = new Headers();
                header.set("content-type", "application/json");
                res.setHeaders(header);
                res.status(200);
                res.end(JSON.stringify(data));
            }
            break;
        }
        case "twitter": {
            if (parseData.datatype === "audio") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.getTwitter(parseData.postid, false, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                await audioResponse(req, res, "twitter", data?.info.sourceInfos.find(info => info?.filename.match(data.info.id + "-" + parseData.itemNumber)), errorCodes);
            }
            if (parseData.datatype === "json") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.getTwitter(parseData.postid, true, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                if (!data) {
                    const header = new Headers();
                    header.set("content-type", "application/json");
                    res.setHeaders(header);
                    res.status(404);
                    res.end(JSON.stringify({ dbmgrErrorCode: ["2-1", ...errorCodes] }));
                    break;
                }
                const header = new Headers();
                header.set("content-type", "application/json");
                res.setHeaders(header);
                res.status(200);
                res.end(JSON.stringify(data));
            }
            break;
        }
        case "url": {
            const header = new Headers();
            header.set("content-type", "application/json");
            res.setHeaders(header);
            res.status(404);
            res.end(JSON.stringify({ dbmgrErrorCode: ["2-2"] }));
            break;
        }
        case "mbrelease": {
            if (parseData.datatype === "json") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.jsonmanager.musicBrainz.getRelease(parseData.id, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                if (!data) {
                    const header = new Headers();
                    header.set("content-type", "application/json");
                    res.setHeaders(header);
                    res.status(404);
                    res.end(JSON.stringify({ dbmgrErrorCode: ["2-1", ...errorCodes] }));
                    break;
                }
                const header = new Headers();
                header.set("content-type", "application/json");
                res.setHeaders(header);
                res.status(200);
                res.end(JSON.stringify(data));
            }
            break;
        }
        case "mbrecording": {
            if (parseData.datatype === "json") {
                const errorCodes: string[] = [];
                const data = await sourcemanager.jsonmanager.musicBrainz.getRecording(parseData.id, {
                    errorGet(errorCode) {
                        errorCodes.push(errorCode);
                    },
                });
                if (!data) {
                    const header = new Headers();
                    header.set("content-type", "application/json");
                    res.setHeaders(header);
                    res.status(404);
                    res.end(JSON.stringify({ dbmgrErrorCode: ["2-1", ...errorCodes] }));
                    break;
                }
                const header = new Headers();
                header.set("content-type", "application/json");
                res.setHeaders(header);
                res.status(200);
                res.end(JSON.stringify(data));
            }
            break;
        }
        case "setting": {
            const params = parseData.params;
            switch (params.get("type")) {
                case "server": {
                    const guildId = parseData.id
                    const key = params.get("key");
                    if (!key) {
                        res.status(400);
                        res.end();
                        return;
                    }
                    const keys = key.split(",").filter(Boolean);
                    /**
                     * 初期データでもあり、ServerDataがどのキーを許可しているのかの検証にも利用します。また、サーバーIDが見つからない場合、このデータをダミーとして使用します。
                     */
                    const initData: ServerData = {
                        guildId: guildId,
                        callchannelId: undefined,
                        volume: 100,
                        playType: 0,
                        playlist: [],
                        changeTellIs: false,
                        playSpeed: 1,
                        playPitch: 0,
                        restartInfo: undefined,
                        reverbType: undefined,
                        manualStartedIs: false,
                        recordedAudioFileSaveChannelTo: undefined
                    }
                    const resData: { [key: string]: any } = {
                        guildId: guildId
                    };
                    const serverData = json.servers?.find(serverData => serverData.guildId === guildId) || initData;
                    keys.forEach(key => { if (Object.keys(initData).includes(key)) resData[key] = (serverData as { [key: string]: any })[key] });
                    const header = new Headers();
                    header.set("content-type", "application/json");
                    res.setHeaders(header);
                    res.status(200);
                    res.end(JSON.stringify(resData));
                    return;
                }
            }
            res.status(400);
            res.end();
            break;
        }
        case "parse": {
            const url = req.url.split("/").slice(4).join("/");
            const result = await stringToServiceParser(url);
            if (result && result.body[0]) {
                const redirectUrl = "/" + result.type + "/" + result.body[0] + (result.type === "twitter" ? "-" + (result.selectSourceNumber ?? 1) : "") + "/audio";
                console.log(redirectUrl);
                res.redirect(redirectUrl)
            } else {
                const header = new Headers();
                header.set("content-type", "application/json");
                res.setHeaders(header);
                res.status(404);
                res.end(JSON.stringify({ dbmgrErrorCode: ["2-3"] }));
            }
            break;
        }
        default: {
            const header = new Headers();
            header.set("content-type", "application/json");
            res.setHeaders(header);
            res.status(404);
            res.end(JSON.stringify({ dbmgrErrorCode: ["2-2"] }));
            break;
        }
    }
}
/**
 * Postリクエストの処理内容です。 
 * 
 */
async function post(req: express.Request, res: express.Response, json: MusicLibraryJSON, sourcemanager: SourceManager) {

}
interface DownloadStatusOfYouTube {
    id: string;
    type: "single";
    info?: YouTubeInfo;
    source?: {
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    };
    infowaitfunc: Promise<statusErrorCodeDbmgrFormat<YouTubeInfo>>;
    sourcewaitfunc: Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>;
    progress: number;
}
interface DownloadStatusOfniconico {
    id: string;
    type: "single";
    info?: niconicoInfo;
    source?: {
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    };
    infowaitfunc: Promise<statusErrorCodeDbmgrFormat<niconicoInfo>>;
    sourcewaitfunc: Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>;
    progress: number;
}
interface DownloadStatusOfTwitter {
    id: string;
    type: "multi";
    infos: TwitterInfo[];
    sources: {
        number: number;
        source: {
            filename: string;
            sourceInfo: {
                duration?: number;
                size: number;
            }
        };
    }[];
    infowaitfuncs: Promise<statusErrorCodeDbmgrFormat<TwitterInfo[]>>;
    sourcewaitfuncs: {
        number: number;
        func: Promise<statusErrorCodeDbmgrFormat<{
            filename: string;
            sourceInfo: {
                duration?: number;
                size: number;
            }
        }>>; progress: number;
    }[];
}
interface DownloadStatusOfSoundCloud {
    id: string;
    type: "single";
    info?: SoundCloudInfo;
    source?: {
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    };
    infowaitfunc: Promise<statusErrorCodeDbmgrFormat<SoundCloudInfo>>;
    sourcewaitfunc: Promise<statusErrorCodeDbmgrFormat<{
        filename: string;
        sourceInfo: {
            duration?: number;
            size: number;
        }
    }>>;
    progress: number;
}

/**
 * YouTubeやニコニコ動画、TwitterやSoundCloud、URLソース、保存した音楽ソースなどのデータを管理するクラスです。
 * 
 * ダウンロードを並列で行ったり、情報取得とソース取得の両方が終わるまで待ってくれたりもするシステムです。
 */
class SourceManager {
    private json: MusicLibraryJSON;
    /**
     * ダウンロードステータスです。
     * ここにはこれらの情報が一時的に記録されます。
     * - Promise関数(完了を追跡するため)
     * - info、source(Promiseが完了すると中身が入る)
     * - progress(進行状況が取得できる場合に滑らかに値が上昇する)
     * 
     * また、保存されるステータスタイプに「single」「multi」があります。
     * - single: １つのステータスにつき１つの情報と１つのソースの取得を追跡します。
     * - multi: 1つのステータスに１つの情報(複数のデータが１回で取得可能な場合)と複数のソースの取得を追跡します。
     */
    private downloadStatus: {
        youtube: DownloadStatusOfYouTube[];
        niconico: DownloadStatusOfniconico[];
        twitter: DownloadStatusOfTwitter[];
        soundcloud: DownloadStatusOfSoundCloud[];
    } = {
            youtube: [],
            niconico: [],
            twitter: [],
            soundcloud: []
        }
    jsonmanager: JSONManager;
    constructor(json: MusicLibraryJSON) {
        this.json = json;
        this.jsonmanager = new JSONManager(json);
    }
    private async getSingleBase<VideoInfo,
        JsonInfo extends {
            id: string;
            videoInfo: VideoInfo;
            sourceInfo: SourceInfo;
            musicBrainz: {
                releaseUuid?: string;
                recordingUuid?: string;
            };
        }[],
        DownloadStats extends {
            id: string;
            info?: VideoInfo;
            source?: {
                filename: string;
                sourceInfo: {
                    duration?: number;
                    size: number;
                }
            };
            infowaitfunc: Promise<statusErrorCodeDbmgrFormat<VideoInfo>>;
            sourcewaitfunc: Promise<statusErrorCodeDbmgrFormat<{
                filename: string;
                sourceInfo: {
                    duration?: number;
                    size: number;
                }
            }>>;
            progress: number;
        }>(
            videoId: string,
            infodatas: JsonInfo,
            downloadStatus: DownloadStats[],
            fast: boolean,
            statusformat: () => DownloadStats,
            userIconUrl: (info: VideoInfo) => Promise<string | null>,
            /** オプションです。通常この関数で使用しなくていい設定をここに打ちます。 */
            option?: {
                errorGet?: (errorCode: string) => void;
            }
        ) {
        const info = infodatas.find(info => info.id === videoId);
        if (info) { // ここが存在する場合、100%情報とソースが揃っている状態です。
            return { info, userIconUrl: await userIconUrl(info.videoInfo) };
        } else {
            const status = downloadStatus.find(status => status.id === videoId);
            if (status === undefined) {
                const status = statusformat();
                downloadStatus.push(status);

                function downloadStatusDelete(this: SourceManager) {
                    const inde = downloadStatus.findIndex(status => status.id === videoId);
                    if (inde !== -1) downloadStatus.splice(inde, 1);
                }
                function register(this: SourceManager, status: DownloadStats) {
                    if (!status.info || !status.source) return;
                    infodatas.push({
                        id: videoId,
                        sourceInfo: { sourceGetTimestamp: Date.now(), infoGetTimestamp: Date.now(), filename: status.source.filename, duration: status.source.sourceInfo.duration, size: status.source.sourceInfo.size },
                        videoInfo: status.info,
                        musicBrainz: {}
                    });
                    downloadStatusDelete.bind(this)();
                    saveJSON(this.json);
                }
                status.infowaitfunc.then(info => {
                    if (downloadStatus.find(status => status.id === videoId) === undefined) return; // エラーなどで削除された場合
                    if (info.status === "error") {
                        console.log("情報取得関数でエラー。");
                        option?.errorGet?.("3-2");
                        info.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                        downloadStatusDelete.bind(this)();
                        return;
                    }
                    status.info = info.resolve;
                    register.bind(this)(status);
                })
                status.sourcewaitfunc.then(source => {
                    if (downloadStatus.find(status => status.id === videoId) === undefined) return; // エラーなどで削除された場合
                    if (source.status === "error") {
                        console.log("音声を取得できませんでした。");
                        option?.errorGet?.("3-3");
                        source.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                        downloadStatusDelete.bind(this)();
                        return;
                    }
                    status.source = source.resolve;
                    register.bind(this)(status);
                });
                return fast ? fastreturn.bind(this)(status) : normalreturn.bind(this)(status);
            } else {
                return fast ? fastreturn.bind(this)(status) : normalreturn.bind(this)(status);
            }
            async function fastreturn(this: SourceManager, status: DownloadStats): Promise<{
                info: {
                    id: string;
                    videoInfo: VideoInfo;
                    sourceInfo: SourceInfo | undefined;
                    musicBrainz: {
                        releaseUuid?: string;
                        recordingUuid?: string;
                    };
                }
                userIconUrl: string | null;
                progress?: number;
            } | undefined> {
                const info = infodatas.find(info => info.id === videoId);
                if (info) return { info, userIconUrl: await userIconUrl(info.videoInfo) }
                else {
                    const result = await status.infowaitfunc;
                    if (result.status === "error") {
                        option?.errorGet?.("3-2");
                        result.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                        return;
                    }
                    return { info: { id: videoId, videoInfo: result.resolve, sourceInfo: undefined, musicBrainz: {} }, userIconUrl: await userIconUrl(result.resolve), progress: status.progress }
                }
            }
            async function normalreturn(this: SourceManager, status: DownloadStats): Promise<{
                info: {
                    id: string;
                    videoInfo: VideoInfo;
                    sourceInfo: SourceInfo;
                    musicBrainz: {
                        releaseUuid?: string;
                        recordingUuid?: string;
                    };
                };
                progress?: number;
            } | undefined> {
                await Promise.allSettled([status.infowaitfunc, status.sourcewaitfunc]);
                const info = infodatas.find(info => info.id === videoId);
                if (info) {
                    return { info }
                } else {
                    option?.errorGet?.("3-1");
                }
            }
        }
    }
    private async getMultiBase<VideoInfo,
        JsonInfo extends {
            id: string;
            videoInfos: VideoInfo[];
            sourceInfos: SourceInfo[];
            musicBrainzs: {
                releaseUuid?: string;
                recordingUuid?: string;
            }[];
        }[],
        DownloadStats extends {
            id: string;
            infos: VideoInfo[];
            sources: {
                number: number;
                source: {
                    filename: string;
                    sourceInfo: {
                        duration?: number;
                        size: number;
                    }
                } | null;
            }[];
            infowaitfuncs: Promise<statusErrorCodeDbmgrFormat<VideoInfo[]>>;
            sourcewaitfuncs: {
                number: number;
                func: Promise<statusErrorCodeDbmgrFormat<{
                    filename: string;
                    sourceInfo: {
                        duration?: number;
                        size: number;
                    }
                }>>; progress: number;
            }[];
        }>(
            videoId: string,
            infodatas: JsonInfo,
            downloadStatus: DownloadStats[],
            fast: boolean,
            statusformat: () => DownloadStats,
            sourceformat: (itemNumber: number) => {
                number: number; func: Promise<statusErrorCodeDbmgrFormat<{
                    filename: string;
                    sourceInfo: {
                        duration?: number;
                        size: number;
                    }
                }>>; progress: number;
            },
            userIconUrl: (info: VideoInfo) => Promise<{ id: string; url: string | null } | undefined>,
            option?: {
                errorGet?: (errorCode: string) => void;
            }
        ) {
        const info = infodatas.find(info => info.id === videoId);
        if (info) { // ここが存在する場合、100%情報とソースが揃っている状態です。
            return { info, usericonUrls: (await Promise.allSettled(info.videoInfos.map(info => userIconUrl(info)))).map(result => result.status === "fulfilled" ? result.value : undefined) };
        } else {
            const status = downloadStatus.find(status => status.id === videoId);
            if (status === undefined) {
                const status = statusformat();
                downloadStatus.push(status);
                function downloadStatusDelete(this: SourceManager) {
                    const inde = downloadStatus.findIndex(status => status.id === videoId);
                    if (inde !== -1) downloadStatus.splice(inde, 1);
                }
                function register(this: SourceManager, status: DownloadStats) {
                    let valid = true;
                    /** ここでは取得されたソース情報の内容を巡回し、ソースと一致するものを検索します。もし一致しない場合、infodataに登録したり、ダウンロードステータスを削除したりしません。理由は、まだ実行中である可能性があるからです。もし実行が完了している場合、すべてが一致したり、エラーによってすでにダウンロードステータスが削除されています。 */
                    for (let i = 1; i <= status.infos.length; i++) if (status.sources.find(source => source.number === i) === undefined) valid = false;
                    if (!valid) return;
                    infodatas.push({
                        id: videoId,
                        videoInfos: status.infos,
                        sourceInfos: (() => {
                            const infodatas: { sourceGetTimestamp: number; infoGetTimestamp: number; filename: string; duration?: number; size: number; }[] = [];
                            for (const source of status.sources) {
                                if (source.source === null) continue;
                                infodatas.push({ sourceGetTimestamp: Date.now(), infoGetTimestamp: Date.now(), filename: source.source.filename, duration: source.source.sourceInfo.duration, size: source.source.sourceInfo.size });
                            }
                            return infodatas;
                        })(),
                        musicBrainzs: []
                    })
                    downloadStatusDelete.bind(this)();
                    saveJSON(this.json);
                }
                status.infowaitfuncs.then(infos => {
                    if (sourceformat === undefined) return downloadStatusDelete.bind(this)();
                    if (downloadStatus.find(status => status.id === videoId) === undefined) return; // エラーなどで削除された場合
                    if (infos.status === "error") {
                        console.log("情報取得関数でエラー。");
                        option?.errorGet?.("3-2");
                        infos.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                        downloadStatusDelete.bind(this)();
                        return;
                    }
                    status.infos = infos.resolve;
                    for (let i = 1; i <= infos.resolve.length; i++) {
                        const sourcewait = sourceformat(i);
                        status.sourcewaitfuncs.push(sourcewait);
                        sourcewait.func.then(source => {
                            if (downloadStatus.find(status => status.id === videoId) === undefined) return; // エラーなどで削除された場合
                            if (source.status === "error") {
                                console.log("動画取得関数でエラー。しかし取得は続行されます。");
                                option?.errorGet?.("3-4");
                                source.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                                status.sources.push({ number: sourcewait.number, source: null });
                                register.bind(this)(status);
                                return;
                            }
                            status.sources.push({ number: sourcewait.number, source: source.resolve });
                            register.bind(this)(status);
                        }).catch(e => {
                        })
                    }
                })
                return fastreturn.bind(this)(status);
            } else {
                return fastreturn.bind(this)(status);
            }
            async function fastreturn(this: SourceManager, status: DownloadStats): Promise<{
                info: {
                    id: string;
                    videoInfos: VideoInfo[];
                    sourceInfos: (SourceInfo | null)[];
                    musicBrainzs: {
                        releaseUuid?: string;
                        recordingUuid?: string;
                    }[];
                };
                usericonUrls: ({ id: string, url: string | null } | undefined)[]
                progress?: number;
            } | undefined> {
                if (fast) {
                    const info = infodatas.find(info => info.id === videoId);
                    if (info) return { info, usericonUrls: (await Promise.allSettled(info.videoInfos.map(info => userIconUrl(info)))).map(result => result.status === "fulfilled" ? result.value : undefined) }
                    else {
                        const result = await status.infowaitfuncs;
                        if (result.status === "error") {
                            option?.errorGet?.("3-2");
                            result.reject.errorCode.forEach(code => { option?.errorGet?.(code); })
                            return;
                        }
                        return { info: { id: videoId, videoInfos: result.resolve, sourceInfos: [], musicBrainzs: [] }, usericonUrls: (await Promise.allSettled(result.resolve.map(info => userIconUrl(info)))).map(result => result.status === "fulfilled" ? result.value : undefined), progress: (status.sourcewaitfuncs.map(waitfuncs => waitfuncs.progress).reduce((pre, cur) => pre + cur, 0) / status.sourcewaitfuncs.length) }
                    }
                }
                await status.infowaitfuncs;
                await Promise.allSettled(status.sourcewaitfuncs.map(waitfunc => waitfunc.func));
                const info = infodatas.find(info => info.id === videoId);
                if (info) {
                    return { info, usericonUrls: (await Promise.allSettled(info.videoInfos.map(info => userIconUrl(info)))).map(result => result.status === "fulfilled" ? result.value : undefined) }
                } else {
                    option?.errorGet?.("3-1");
                }
            }
        }
    }

    /**
     * YouTubeの情報やソースの状況を取得します。
     * 
     * 引数2番目にtrueを入れると、ソースが取得されていなくても返答をします。falseや空にするとソースが取得されるまで待機することになります。
     */
    async getYouTube(videoId: string, fast?: boolean, option?: { errorGet?: (errorCode: string) => void }) {
        if (this.json.youtube === undefined) this.json.youtube = [];
        const infodatas = this.json.youtube;
        const downloadStatus = this.downloadStatus.youtube;
        return await this.getSingleBase<YouTubeInfo, YouTubeInfoData[], DownloadStatusOfYouTube>(videoId, infodatas, downloadStatus, fast || false, () => {
            return {
                id: videoId,
                type: "single",
                infowaitfunc: youtubeInfoGet(videoId),
                sourcewaitfunc: youtubeSourceGet(videoId, progress => {
                    const status = downloadStatus.find(status => status.id === videoId);
                    if (status) status.progress = progress;
                }),
                progress: 0
            }
        }, async info => (await this.jsonmanager.userIcons.getYouTube.bind(this.jsonmanager.userIcons)(info.channelId)).info, {
            errorGet(errorCode) {
                option?.errorGet?.(errorCode)
            },
        })
    }
    /**
     * ニコニコ動画の情報やソースの状況を取得します。
     * 
     * 引数2番目にtrueを入れると、ソースが取得されていなくても返答をします。falseや空にするとソースが取得されるまで待機することになります。
     */
    async getniconico(id: string, fast?: boolean, option?: { errorGet?: (errorCode: string) => void }) {
        if (this.json.niconico === undefined) this.json.niconico = [];
        const infodatas = this.json.niconico;
        const downloadStatus = this.downloadStatus.niconico;
        return await this.getSingleBase<niconicoInfo, niconicoInfoData[], DownloadStatusOfniconico>(id, infodatas, downloadStatus, fast || false, () => {
            return {
                id: id,
                type: "single",
                infowaitfunc: niconicoInfoGet(id),
                sourcewaitfunc: niconicoSourceGet(id, progress => {
                    const status = downloadStatus.find(status => status.id === id);
                    if (status) status.progress = progress;
                }),
                progress: 0
            }
        }, async info => {
            if (info.channelId) return (await this.jsonmanager.userIcons.getniconico.bind(this.jsonmanager.userIcons)(info.channelId)).info
            if (info.channelName) return (await this.jsonmanager.userIcons.getniconico.bind(this.jsonmanager.userIcons)(info.channelName)).info
            return null
        }, {
            errorGet(errorCode) {
                option?.errorGet?.(errorCode)
            },
        })
    }
    /**
     * SoundCloudの情報やソースの状況を取得します。
     * 
     * 引数2番目にtrueを入れると、ソースが取得されていなくても返答をします。falseや空にするとソースが取得されるまで待機することになります。
     */
    async getSoundCloud(id: string, fast?: boolean, option?: { errorGet?: (errorCode: string) => void }) {
        if (this.json.soundcloud === undefined) this.json.soundcloud = [];
        const infodatas = this.json.soundcloud;
        const downloadStatus = this.downloadStatus.soundcloud;
        return await this.getSingleBase<SoundCloudInfo, SoundCloudInfoData[], DownloadStatusOfSoundCloud>(id, infodatas, downloadStatus, fast || false, () => {
            return {
                id: id,
                type: "single",
                infowaitfunc: soundcloudInfoGet(id),
                sourcewaitfunc: soundcloudSourceGet(id, progress => {
                    const status = downloadStatus.find(status => status.id === id);
                    if (status) status.progress = progress;
                }),
                progress: 0
            }
        }, async info => (await this.jsonmanager.userIcons.getSoundCloud.bind(this.jsonmanager.userIcons)(info.userId)).info, {
            errorGet(errorCode) {
                option?.errorGet?.(errorCode)
            },
        })
    }
    /**
     * Twitterの情報やソースの状況を取得します。
     * 
     * 引数2番目にtrueを入れると、ソースが取得されていなくても返答をします。falseや空にするとソースが取得されるまで待機することになります。
     */
    async getTwitter(id: string, fast?: boolean, option?: { errorGet?: (errorCode: string) => void }) {
        if (this.json.twitter === undefined) this.json.twitter = [];
        const infodatas = this.json.twitter;
        const downloadStatus = this.downloadStatus.twitter;
        return await this.getMultiBase<TwitterInfo, TwitterInfoData[], DownloadStatusOfTwitter>(id,
            infodatas,
            downloadStatus,
            fast || false,
            () => {
                return {
                    id: id,
                    type: "multi",
                    infos: [],
                    sources: [],
                    infowaitfuncs: twitterInfoGet(id),
                    sourcewaitfuncs: []
                }
            },
            itemNumber => {
                return {
                    number: itemNumber,
                    func: twitterSourceGet(id, itemNumber, progress => {
                        const status = downloadStatus.find(status => status.id === id);
                        if (status) {
                            const waitfunc = status.sourcewaitfuncs.find(waitfunc => waitfunc.number === itemNumber);
                            if (waitfunc) waitfunc.progress = progress
                        }
                    }),
                    progress: 0
                }
            }, async info => {
                if (info.userId) return { id: info.userId, url: (await this.jsonmanager.userIcons.getTwitter.bind(this.jsonmanager.userIcons)(info.userId)).info };
                return undefined;
            }, {
            errorGet(errorCode) {
                option?.errorGet?.(errorCode)
            },
        });
    }
}

/**
 * MusicBrainzなどの情報データやユーザー情報などの処理を行います。
 * 
 * 同時に要求された場合に重複処理しないように賢く内部で処理をします。
 */
class JSONManager {
    private json: MusicLibraryJSON;
    private get JSON() { return this.json }
    private downloadStatus: {
        musicBrainz: {
            release: {
                mbid: string;
                datawaitfunc: Promise<statusErrorCodeDbmgrFormat<MusicBrainzReleaseInfo>>;
            }[];
            recording: {
                mbid: string;
                datawaitfunc: Promise<statusErrorCodeDbmgrFormat<MusicBrainzRecordingInfo>>;
            }[];
        };
        userIcons: {
            youtube: {
                id: string;
                urlwaitfunc: Promise<statusErrorCodeDbmgrFormat<string>>
            }[];
            soundcloud: {
                id: string;
                urlwaitfunc: Promise<statusErrorCodeDbmgrFormat<string>>
            }[];
            niconico: {
                id: string;
                urlwaitfunc: Promise<string | void>
            }[];
            twitter: {
                id: string;
                urlwaitfunc: Promise<string | void>
            }[];
        }
    } = {
            musicBrainz: {
                release: [],
                recording: []
            },
            userIcons: {
                youtube: [],
                niconico: [],
                soundcloud: [],
                twitter: []

            }
        }
    constructor(json: MusicLibraryJSON) {
        this.json = json;
        this.userIcons = new (class UserIconsGet {
            private JSONManager: JSONManager;
            private json: MusicLibraryJSON;
            constructor(json: MusicLibraryJSON, JSONManager: JSONManager) {
                this.JSONManager = JSONManager;
                this.json = json;
            }
            async getYouTube(id: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.youtubeUserIcons) this.json.youtubeUserIcons = [];
                const info = this.json.youtubeUserIcons.find(info => info.id === id);
                if (info) return { info: info.url }
                else {
                    const status = this.JSONManager.downloadStatus.userIcons.youtube.find(status => status.id === id);
                    if (status) {
                        const result = await status.urlwaitfunc;
                        if (result.status === "error") return { info: null }
                        return { info: result.resolve }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.userIcons.youtube.findIndex(status => status.id === id);
                            if (inde !== -1) JSONManager.downloadStatus.userIcons.youtube.splice(inde, 1);
                        }
                        const status: {
                            id: string;
                            urlwaitfunc: Promise<statusErrorCodeDbmgrFormat<string>>;
                        } = {
                            id, urlwaitfunc: youtubeUserIconGet(id)
                        }
                        this.JSONManager.downloadStatus.userIcons.youtube.push(status);
                        status.urlwaitfunc.then(data => {
                            if (!this.json.youtubeUserIcons) this.json.youtubeUserIcons = [];
                            if (data.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                data.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            }
                            if (data.status === "success") {
                                this.json.youtubeUserIcons.push({ id: id, url: data.resolve });
                                saveJSON(this.json);
                            }
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.youtubeUserIcons.find(info => info.id === id);
                        if (info) return { info: info.url }
                        else {
                            const result = await status.urlwaitfunc;
                            if (result.status === "error") return { info: null }
                            return { info: result.resolve }
                        }
                    }
                }
            }
            async getSoundCloud(id: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.soundcloudUserIcons) this.json.soundcloudUserIcons = [];
                const info = this.json.soundcloudUserIcons.find(info => info.id === id);
                if (info) return { info: info.url }
                else {
                    const status = this.JSONManager.downloadStatus.userIcons.soundcloud.find(status => status.id === id);
                    if (status) {
                        const result = await status.urlwaitfunc;
                        if (result.status === "error") return { info: null }
                        return { info: result.resolve }

                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.userIcons.soundcloud.findIndex(status => status.id === id);
                            if (inde !== -1) JSONManager.downloadStatus.userIcons.soundcloud.splice(inde, 1);
                        }
                        const status: {
                            id: string;
                            urlwaitfunc: Promise<statusErrorCodeDbmgrFormat<string>>;
                        } = {
                            id, urlwaitfunc: soundcloudUserIconGet(id)
                        }
                        this.JSONManager.downloadStatus.userIcons.soundcloud.push(status);
                        status.urlwaitfunc.then(data => {
                            if (!this.json.soundcloudUserIcons) this.json.soundcloudUserIcons = [];
                            if (data.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                data.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            }
                            if (data.status === "success") {
                                this.json.soundcloudUserIcons.push({ id: id, url: data.resolve });
                                saveJSON(this.json);
                            }
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.soundcloudUserIcons.find(info => info.id === id);
                        if (info) return { info: info.url }
                        else {
                            const result = await status.urlwaitfunc;
                            if (result.status === "error") return { info: null }
                            return { info: result.resolve }
                        }
                    }
                }
            }
            async getniconico(id: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.niconicoUserIcons) this.json.niconicoUserIcons = [];
                const info = this.json.niconicoUserIcons.find(info => info.id === id);
                if (info) return { info: info.url }
                else {
                    const status = this.JSONManager.downloadStatus.userIcons.niconico.find(status => status.id === id);
                    if (status) {
                        return { info: await status.urlwaitfunc ?? null }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.userIcons.niconico.findIndex(status => status.id === id);
                            if (inde !== -1) JSONManager.downloadStatus.userIcons.niconico.splice(inde, 1);
                        }
                        const status: {
                            id: string;
                            urlwaitfunc: Promise<string | void>;
                        } = {
                            id, urlwaitfunc: new Promise<string | void>(async resolve => {
                                try {
                                    const url = "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/" + Math.floor(Number(id) / 10000) + "/" + id + ".jpg";
                                    const res = await fetch(url, { method: "HEAD" });
                                    if (res.ok) return resolve(url);
                                } catch { }
                                resolve()
                            })
                        }
                        this.JSONManager.downloadStatus.userIcons.niconico.push(status);
                        status.urlwaitfunc.then(data => {
                            if (!this.json.niconicoUserIcons) this.json.niconicoUserIcons = [];
                            if (data === undefined) {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                option?.errorGet?.(stringToErrorCode("画像存在チェックで404エラーまたは正常ではない応答が返ってきました。画像は利用できません。"));
                                this.json.niconicoUserIcons.push({ id: id, url: null });
                            }
                            if (data) this.json.niconicoUserIcons.push({ id: id, url: data });
                            saveJSON(this.json);
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.niconicoUserIcons.find(info => info.id === id);
                        if (info) return { info: info.url }
                        else return { info: await status.urlwaitfunc ?? null }
                    }
                }
            }
            async getTwitter(id: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.twitterUserIcons) this.json.twitterUserIcons = [];
                const info = this.json.twitterUserIcons.find(info => info.id === id);
                if (info) return { info: info.url }
                else {
                    const status = this.JSONManager.downloadStatus.userIcons.twitter.find(status => status.id === id);
                    if (status) {
                        return { info: await status.urlwaitfunc ?? null }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.userIcons.twitter.findIndex(status => status.id === id);
                            if (inde !== -1) JSONManager.downloadStatus.userIcons.twitter.splice(inde, 1);
                        }
                        const status: {
                            id: string;
                            urlwaitfunc: Promise<string | void>;
                        } = {
                            id, urlwaitfunc: new Promise<string | void>(async resolve => {
                                try {
                                    const url = "https://api.fxtwitter.com/" + id;
                                    const res = await fetch(url, { method: "HEAD" });
                                    if (res.ok) return resolve(url);
                                } catch { }
                                resolve()
                            })
                        }
                        this.JSONManager.downloadStatus.userIcons.twitter.push(status);
                        status.urlwaitfunc.then(data => {
                            if (!this.json.twitterUserIcons) this.json.twitterUserIcons = [];
                            if (data === undefined) {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                option?.errorGet?.(stringToErrorCode("画像存在チェックで404エラーまたは正常ではない応答が返ってきました。画像は利用できません。"));
                                this.json.twitterUserIcons.push({ id: id, url: null });
                                return;
                            }
                            if (data) this.json.twitterUserIcons.push({ id: id, url: data });
                            saveJSON(this.json);
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.twitterUserIcons.find(info => info.id === id);
                        if (info) return { info: info.url }
                        else return { info: await status.urlwaitfunc ?? null }
                    }
                }
            }
        })(this.JSON, this)
        this.musicBrainz = new (class MusicBrainz {
            private JSONManager: JSONManager;
            private json: MusicLibraryJSON;
            constructor(json: MusicLibraryJSON, JSONManager: JSONManager) {
                this.JSONManager = JSONManager;
                this.json = json;
            }
            async getRelease(mbid: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.musicBrainzReleaseInfo) this.json.musicBrainzReleaseInfo = [];
                const info = this.json.musicBrainzReleaseInfo.find(info => info.uuid === mbid);
                if (info) return { info }
                else {
                    const status = this.JSONManager.downloadStatus.musicBrainz.release.find(status => status.mbid === mbid);
                    if (status) {
                        const result = await status.datawaitfunc;
                        if (result.status === "error") {
                            console.log("情報取得関数でエラー。");
                            option?.errorGet?.("3-2");
                            result.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            return;
                        }
                        return { info: result.resolve }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.musicBrainz.release.findIndex(status => status.mbid === mbid);
                            if (inde !== -1) JSONManager.downloadStatus.musicBrainz.release.splice(inde, 1);
                        }
                        const status: {
                            mbid: string;
                            datawaitfunc: Promise<statusErrorCodeDbmgrFormat<MusicBrainzReleaseInfo>>;
                        } = {
                            mbid, datawaitfunc: musicBrainzReleaseInfoGet(mbid)
                        }
                        this.JSONManager.downloadStatus.musicBrainz.release.push(status);
                        status.datawaitfunc.then(data => {
                            if (!this.json.musicBrainzReleaseInfo) this.json.musicBrainzReleaseInfo = [];
                            if (data.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                data.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            }
                            if (data.status === "success") {
                                this.json.musicBrainzReleaseInfo.push(data.resolve);
                                saveJSON(this.json);
                            }
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.musicBrainzReleaseInfo.find(info => info.uuid === mbid);
                        if (info) return { info }
                        else {
                            const result = await status.datawaitfunc;
                            if (result.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                result.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                                return;
                            }
                            return { info: result.resolve }
                        }
                    }
                }
            }
            async getRecording(mbid: string, option?: {
                errorGet?: (errorCode: string) => void;
            }) {
                if (!this.json.musicBrainzRecordingInfo) this.json.musicBrainzRecordingInfo = [];
                const info = this.json.musicBrainzRecordingInfo.find(info => info.uuid === mbid);
                if (info) return { info }
                else {
                    const status = this.JSONManager.downloadStatus.musicBrainz.recording.find(status => status.mbid === mbid);
                    if (status) {
                        const result = await status.datawaitfunc;
                        if (result.status === "error") {
                            console.log("情報取得関数でエラー。");
                            option?.errorGet?.("3-2");
                            result.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            return;
                        }
                        return { info: result.resolve }
                    } else {
                        function downloadStatusDelete(JSONManager: JSONManager) {
                            const inde = JSONManager.downloadStatus.musicBrainz.recording.findIndex(status => status.mbid === mbid);
                            if (inde !== -1) JSONManager.downloadStatus.musicBrainz.recording.splice(inde, 1);
                        }
                        const status: {
                            mbid: string;
                            datawaitfunc: Promise<statusErrorCodeDbmgrFormat<MusicBrainzRecordingInfo>>;
                        } = {
                            mbid, datawaitfunc: musicBrainzRecordingInfoGet(mbid)
                        }
                        this.JSONManager.downloadStatus.musicBrainz.recording.push(status);
                        status.datawaitfunc.then(data => {
                            if (!this.json.musicBrainzRecordingInfo) this.json.musicBrainzRecordingInfo = [];
                            if (data.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                data.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                            }
                            if (data.status === "success") {
                                this.json.musicBrainzRecordingInfo.push(data.resolve);
                                saveJSON(this.json);
                            }
                            downloadStatusDelete(this.JSONManager);
                        });
                        const info = this.json.musicBrainzRecordingInfo.find(info => info.uuid === mbid);
                        if (info) return { info }
                        else {
                            const result = await status.datawaitfunc;
                            if (result.status === "error") {
                                console.log("情報取得関数でエラー。");
                                option?.errorGet?.("3-2");
                                result.reject.errorCode.forEach(code => { option?.errorGet?.(code); });
                                return;
                            }
                            return { info: result.resolve }
                        }
                    }
                }
            }
        })(this.JSON, this);
    }
    readonly musicBrainz
    readonly userIcons
}

function getJSON(): MusicLibraryJSON {
    if (!fs.existsSync("./dbmgr.json")) fs.writeFileSync("./dbmgr.json", "{}");
    try {
        return JSON.parse(String(fs.readFileSync("./dbmgr.json")));
    } catch (e) {
        try {
            fs.renameSync("./dbmgr.json", "./dbmgr-old.json");
        } catch (e) {
            // SumLog.error("ミュージックライブラリは読み込みに失敗したJSONの名前の変更にも失敗しました。");
            process.exit(1);
        }
        try {
            fs.writeFileSync("./dbmgr.json", "{}");
        } catch (e) {
            // SumLog.error("ミュージックライブラリは読み込みに失敗したJSONの上書きにも失敗しました。");
            process.exit(1);
        }
        return {};
    }
};

let saveQueue: string | undefined;
let saving = false;
async function saveJSON(json: MusicLibraryJSON) {
    saveQueue = JSON.stringify(json, null, 2);
    if (saving) return;
    while (true) {
        saving = true;
        const saveData = saveQueue;
        saveQueue = undefined;
        await fsPromise.writeFile("./dbmgr-saving.json", saveData);
        await fsPromise.rename("./dbmgr-saving.json", "./dbmgr.json");
        saving = false;
        if (!saveQueue) break;
    }
}

/**
 * Getリクエストの内容が正しいかのチェックを行い、正しい場合はリクエストされたデータについてを返します。
 */
function validGetRequestParse(req: express.Request, res: express.Response) {
    function error400() {
        res.status(400);
        res.end();
        return undefined;
    }
    const url = (() => {
        try {
            return new URL("http://localhost" + req.originalUrl);
        } catch { }
    })();
    if (!url) return error400();
    const params = url.searchParams;
    const splitedPath: (string | undefined)[] = url.pathname.split("/");
    const servicetype = splitedPath[1];
    const id = splitedPath[2];
    if (!id) return error400();
    const datatype = splitedPath[3] as "audio" | "json";
    if (!(datatype === "audio" || datatype === "json")) return error400();
    if (datatype === "audio" && req.url.includes("?")) return error400();
    switch (servicetype) {
        case "youtube":
        case "soundcloud":
        case "niconico": {
            return { id, datatype, servicetype, params }
        }
        case "twitter": {
            const splited = id.split("-");
            const postid = splited[0];
            const videoitemnum = Number(splited[1]);
            if (!postid || !videoitemnum || Number.isNaN(videoitemnum)) return error400();
            return { postid, itemNumber: videoitemnum, datatype, servicetype, params }
        }
        case "url": {
            // Buffer.from(data).toString("base64url");で変換したものを使用する。
            const url = Buffer.from(id, "base64url").toString("utf-8");
            return { id: url, datatype, servicetype, params }
        }
        case "mbrelease":
        case "mbrecording":
        case "parse":
        case "setting": {
            if (datatype === "audio") return error400();
            return { id, datatype, servicetype, params }
        }
    }
    return error400();
}

/**
 * header内のrange要求を正しいrange範囲に変換します。
 */
function parseRange(rangeHeader: string | undefined, fileSize: number) {
    if (!rangeHeader) {
        return { start: 0, end: fileSize - 1 };
    }

    // 例: "bytes=60-1000" / "bytes 60-" / "60-1000"
    const cleaned = rangeHeader
        .replace(/bytes/i, "")
        .replace(/=/g, "")
        .trim();

    const [startStr, endStr] = cleaned.split("-");

    let start = startStr === "" ? undefined : Number(startStr);
    let end = endStr === "" ? undefined : Number(endStr);

    // suffix-range: "-500" → 最後の500バイト
    if (start === undefined && end !== undefined) {
        start = Math.max(0, fileSize - end);
        end = fileSize - 1;
    }

    // normal: "60-" → 60 〜 最後まで
    if (start !== undefined && end === undefined) {
        end = fileSize - 1;
    }

    // どちらも数値でない → 全体
    if (isNaN(start!) || isNaN(end!)) {
        start = 0;
        end = fileSize - 1;
    }

    // 範囲チェック
    start = Math.max(0, Math.min(start!, fileSize - 1));
    end = Math.max(start, Math.min(end!, fileSize - 1));

    return { start, end };
}

interface SourceInfo {
    /** 情報を取得した時の時刻です。 */
    infoGetTimestamp: number;
    /** 音声を取得した時の時刻です。 */
    sourceGetTimestamp: number;
    /** 実際に存在するファイル名です。拡張子の調査の必要がなくなります。fsを使用せずにファイル名を検出できるため、速度が上がります。fsを使わずにファイル名を取得したい場合に使用する物です。これを配列にしている場合、順番を保証するものがないため、matchなどを使用してファイルを特定してください。 */
    filename: string;
    size: number;
    duration?: number;
}

export interface YouTubeInfoData {
    id: string;
    videoInfo: YouTubeInfo;
    sourceInfo: SourceInfo;
    musicBrainz: {
        releaseUuid?: string;
        recordingUuid?: string;
    };
}

export interface niconicoInfoData {
    id: string;
    videoInfo: niconicoInfo;
    sourceInfo: SourceInfo;
    musicBrainz: {
        releaseUuid?: string;
        recordingUuid?: string;
    };
}

export interface TwitterInfoData {
    id: string;
    videoInfos: TwitterInfo[];
    sourceInfos: SourceInfo[];
    musicBrainzs: {
        releaseUuid?: string;
        recordingUuid?: string;
    }[];
}

export interface SoundCloudInfoData {
    id: string;
    videoInfo: SoundCloudInfo;
    sourceInfo: SourceInfo;
    musicBrainz: {
        releaseUuid?: string;
        recordingUuid?: string;
    };
}

export interface MusicLibraryJSON {
    youtube?: YouTubeInfoData[];
    niconico?: niconicoInfoData[];
    twitter?: TwitterInfoData[];
    soundcloud?: SoundCloudInfoData[];
    musicBrainzReleaseInfo?: MusicBrainzReleaseInfo[];
    musicBrainzRecordingInfo?: MusicBrainzRecordingInfo[];
    youtubeUserIcons?: {
        id: string;
        url: string | null;
    }[];
    niconicoUserIcons?: {
        id: string;
        url: string | null;
    }[];
    twitterUserIcons?: {
        id: string;
        url: string | null;
    }[];
    soundcloudUserIcons?: {
        id: string;
        url: string | null;
    }[];
    users?: UserData[];
    servers?: ServerData[];
}

export interface UserData {
    userId: string;
}

export interface ServerData {
    guildId: string;
    callchannelId?: string;
    volume?: number;
    playType?: 0 | 1 | 2;
    playlist?: ({
        type: "youtube" | "niconico" | "twitter" | "soundcloud";
        id: string;
        index?: number;
    } | undefined)[];
    changeTellIs?: boolean;
    playSpeed?: number;
    playPitch?: number;
    restartInfo?: {
        playPoint: number;
        restartCalledChannel: string;
        restartedVoiceChannel: string;
        restartedPlayIs: boolean;
    }
    reverbType?: string;
    manualStartedIs?: boolean;
    recordedAudioFileSaveChannelTo?: string;
}

main();
