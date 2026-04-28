import mime from "mime";
import path from "path";
import { Server } from "http";
import express from "express";
import fs from "fs";
import fsPromise from "fs/promises";

import { MusicLibraryJSON, ServerData, SourceInfo } from "../interface.js";
import { SourceManager } from "./sourceManager.js";
import { stringToServiceParser } from "../../func/stringToServiceParser.js";

/**
 * Getに関する処理を関数として抽象化し、それらの関数をクラスでまとめました。mainが通常利用、内部にはprivateでさまざまな関数が利用されています。
 * 
 * mainを見やすくするための工夫です。
 */
export class GetFuncs {
    json: MusicLibraryJSON;
    sourcemanager: SourceManager;
    server: Server;
    constructor(json: MusicLibraryJSON, sourcemanager: SourceManager, server: Server) {
        this.json = json;
        this.sourcemanager = sourcemanager;
        this.server = server;
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
    async main(req: express.Request, res: express.Response) {
        /**
         * リクエストのURLが正しいかどうかのチェックなどを行います。正しくない場合、resに400エラーを送信するため、undefinedの場合は関数をそのまま終了してください。
         */
        const parseData = this.validGetRequestParse(req, res);
        if (!parseData) return;
        switch (parseData.servicetype) { // 要求されたサービスに返答を返します。内部でストリームや通信終了なども行われています。
            case "youtube": {
                await this.soundOrJsonResolver(req, res, parseData, { sourcemanagerFunc: this.sourcemanager.getYouTube });
                break;
            }
            case "niconico": {
                await this.soundOrJsonResolver(req, res, parseData, { sourcemanagerFunc: this.sourcemanager.getniconico });
                break;
            }
            case "soundcloud": {
                await this.soundOrJsonResolver(req, res, parseData, { sourcemanagerFunc: this.sourcemanager.getSoundCloud });
                break;
            }
            case "twitter": {
                await this.soundOrJsonResolver(req, res, parseData, { sourcemanagerFunc: this.sourcemanager.getTwitter });
                break;
            }
            case "mbrelease": {
                await this.soundOrJsonResolver(req, res, parseData, { jsonmanagerFunc: this.sourcemanager.jsonmanager.musicBrainz.getRelease });
                break;
            }
            case "mbrecording": {
                await this.soundOrJsonResolver(req, res, parseData, { jsonmanagerFunc: this.sourcemanager.jsonmanager.musicBrainz.getRecording });
                break;
            }
            case "setting": {
                await this.settingJsonResolver(req, res, parseData);
                break;
            }
            case "url": { // 未実装
                const header = new Headers();
                header.set("content-type", "application/json");
                res.setHeaders(header);
                res.status(404);
                res.end(JSON.stringify({ dbmgrErrorCode: ["2-2"] }));
                break;
            }
            case "parse": {
                await this.urlParseResolver(req, res);
                break;
            }
            case "stop": {
                res.status(200);
                res.end("stopped");
                if (this.server.listening) this.server.close(err => {
                    if (err) {
                        // 上手に止められなかっただけだけど、それ以上のことがない。
                    } else {
                        console.log("ミュージックライブラリは停止しました。");
                    }
                });
                break;
            }
            case "test": {
                res.status(200);
                res.end("Music Library v3");
                break;
            }
            case "list": {
                this.sourceListResolver(req, res, parseData);
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
     * 音声を返答する関数です。現在の実装ではStreamのpipeで突然エラーが発生すると通信に障害が発生する恐れがあります。
     * 
     * 部分取得に対応したり、ヘッダーを正しく送信したりする処理を含みます。
     */
    private async audioResponse(req: express.Request, res: express.Response, type: string, sourceInfo?: SourceInfo | null, errorCode?: string[]) {
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
        const range = this.parseRange(req.headers.range, length);
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

    /**
     * header内のrange要求を正しいrange範囲に変換します。
     */
    parseRange(rangeHeader: string | undefined, fileSize: number) {
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
    /**
     * Getリクエストの内容が正しいかのチェックを行い、正しい場合はリクエストされたデータについてを返します。
     */
    private validGetRequestParse(req: express.Request, res: express.Response) {
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
        if (!url) {
            console.log("URLとして判定されないURLがGETから送られました。", req.originalUrl)
            return error400();
        }
        const params = url.searchParams;
        const splitedPath: (string | undefined)[] = url.pathname.split("/");
        const servicetype = splitedPath[1];
        switch (servicetype) {
            case "test": return { servicetype }
            case "stop": return { servicetype }
        }
        const id = splitedPath[2] || "";
        const datatype = splitedPath[3] as "audio" | "json";
        if (!(datatype === "audio" || datatype === "json")) {
            console.log("データタイプ要求が音声でもJSONでもありません。:", datatype, splitedPath);
            return error400();
        }
        if (datatype === "audio" && req.url.includes("?")) {
            console.log("音声を要求している場合、クエリは無効です。");
            return error400();
        }
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
            case "list":
            case "setting": {
                if (datatype === "audio") return error400();
                return { id, datatype, servicetype, params }
            }
            default: {
                console.log("どの機能でもないものにアクセスされました。", servicetype);
                return error400();
            }
        }
    }
    /**
     * リクエストから音声を返したりJSONを返したりといった処理を行います。すべての処理を担当できるようにするため柔軟な設計にしています。多めにコメントを添えておきます。
     */
    private async soundOrJsonResolver(
        req: express.Request,
        res: express.Response,
        /** parseDataの平均的な情報の中でも利用する予定のあるものだけ型定義しています。serviceTypeなどで判別したりしています。 */
        parseData: {
            id?: string;
            postId?: string;
            datatype: "audio" | "json";
            servicetype: string;
            itemNumber?: number;
        },
        option: {
            /** SourceManagerを使ってデータを取得するクラスの関数の場合に入力します。 */
            sourcemanagerFunc?: (
                (id: string, fast?: boolean | undefined, option?: {
                    errorGet?: ((errorCode: string) => void) | undefined;
                } | undefined) => Promise<{ info: { id: string; sourceInfo?: SourceInfo; sourceInfos?: (SourceInfo | null)[]; } } | undefined> // 実際はもっと複雑ですが、必要な情報のみ型定義しています。
            )
            /** JSONManagerを使ってデータを取得するクラスの関数の場合に入力します。 */
            jsonmanagerFunc?: (
                (id: string, option?: {
                    errorGet?: ((errorCode: string) => void) | undefined;
                } | undefined) => Promise<{ info: any } | undefined> // 実際に返すデータは結局すべてJSON.stringify()するため、anyで処理しています。最低限中にinfoが使われているならよし！というコードです。普通にコードを描く分には問題ないはずです。
            )
        }) {
        const id = parseData.id || parseData.postId;
        /** 返答タイプが曲の場合かつIDが渡されていて、SourceManagerの関数が用意されている場合に実行されます。 */
        if (parseData.datatype === "audio" && id && option.sourcemanagerFunc) {
            const errorCodes: string[] = [];
            const data = await option.sourcemanagerFunc(id, false, {
                errorGet(errorCode) {
                    errorCodes.push(errorCode);
                }
            });
            if (data) {
                if (data.info.sourceInfo) // SourceInfoが１つのみの場合に実行
                    await this.audioResponse(req, res, parseData.servicetype, data?.info.sourceInfo, errorCodes);
                else if (data.info.sourceInfos && parseData.itemNumber !== undefined && data.info) // もし複数のSourceInfoの場合、どのSourceInfoを使うかを選択する要素が追加されます。
                    await this.audioResponse(req, res, parseData.servicetype, data.info.sourceInfos.find(info => info?.filename.match(data.info.id + "-" + parseData.itemNumber)), errorCodes);
            }

        }
        /** 返答タイプがJSONの場合かつIDがある場合に実行されます。 */
        if (parseData.datatype === "json" && id) {
            const errorCodes: string[] = [];
            /** SourceManagerでもJSONManagerでも取得できるように無理やりコードを描いています。 */
            const data = option.sourcemanagerFunc ? await option.sourcemanagerFunc(id, false, {
                errorGet(errorCode) {
                    errorCodes.push(errorCode);
                }
            }) : option.jsonmanagerFunc ? option.jsonmanagerFunc(id, {
                errorGet(errorCode) {
                    errorCodes.push(errorCode);
                },
            }) : undefined;

            if (!data) { // 404
                const header = new Headers();
                header.set("content-type", "application/json");
                res.setHeaders(header);
                res.status(404);
                res.end(JSON.stringify({ dbmgrErrorCode: ["2-1", ...errorCodes] }));
                return;
            }
            // 正常返答処理
            const header = new Headers();
            header.set("content-type", "application/json");
            res.setHeaders(header);
            res.status(200);
            res.end(JSON.stringify(data));
        }
    }
    /**
     * ミュージックライブラリの情報を返すプログラムは少々独特なため別で関数を準備しました。
     */
    private async settingJsonResolver(
        req: express.Request,
        res: express.Response,
        parseData: {
            params: URLSearchParams;
            id: string;
        }) {
        const params = parseData.params;
        switch (params.get("type")) {
            case "server": { // Discord.jsのサーバーに関する情報を返す
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
                    recordedAudioFileSaveChannelTo: undefined,
                    updatetimems: Date.now()
                }
                const resData: { [key: string]: any } = {
                    guildId: guildId
                };
                const serverData = this.json.servers?.find(serverData => serverData.guildId === guildId) || initData;
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
    }
    /**
     * URLをパースするよう要求されたときに実行する関数は独自的なので、別で関数を準備しました。
     */
    private async urlParseResolver(req: express.Request, res: express.Response) {
        // リクエストは基本的にスラッシュで切ると`["", "parse", "id", "json", "https", ...]`のような配列が取得でき、最後に入力されるURLのみを抽出するため、無駄な要素を省きます。
        const url = req.url.split("/").slice(4).join("/");
        const result = await stringToServiceParser(url);
        if (result && result.body[0]) {
            const redirectUrl = "/" + result.type + "/" + result.body[0] + (result.type === "twitter" ? "-" + (result.selectSourceNumber ?? 1) : "") + "/audio";
            console.log(redirectUrl);
            res.redirect(redirectUrl);
        } else {
            const header = new Headers();
            header.set("content-type", "application/json");
            res.setHeaders(header);
            res.status(404);
            res.end(JSON.stringify({ dbmgrErrorCode: ["2-3"] }));
        }
    }
    /**
     * ソースリストを表示するよう要求されたときに実行する関数(ry)
     */
    private sourceListResolver(
        req: express.Request,
        res: express.Response,
        parseData: { id: string; }) {
        const header = new Headers();
        header.set("content-type", "application/json");
        res.setHeaders(header);
        res.status(200);
        /** オブジェクト配列のキーを取り出してJSONを文字列にし、ID一覧として送信します。string[]が送信されます。 */
        function parseAndEnd<InfoData>(id: InfoData[], map: (info: InfoData) => string) {
            res.end(JSON.stringify(id.map(info => map(info))));
        }
        switch (parseData.id) {
            case "youtube": parseAndEnd(this.json.youtube, info => info.id); break;
            case "niconico": parseAndEnd(this.json.niconico, info => info.id); break;
            case "twitter": parseAndEnd(this.json.twitter, info => info.id); break;
            case "soundcloud": parseAndEnd(this.json.soundcloud, info => info.id); break;
            case "server": parseAndEnd(this.json.servers, info => info.guildId); break;
            case "users": parseAndEnd(this.json.users, info => info.userId); break;
            case "mbrelease": parseAndEnd(this.json.musicBrainzReleaseInfo, info => info.uuid); break;
            case "mbrecording": parseAndEnd(this.json.musicBrainzRecordingInfo, info => info.uuid); break;
        }
    }
}
