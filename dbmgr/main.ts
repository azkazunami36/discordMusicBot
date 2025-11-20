import MongoDB from "mongodb";
import express from "express";
import http from "http";
import { PathLike } from "fs";
import { readFile } from "fs/promises";

import { envGet } from "../class/envManager.js";
import { Readable } from "stream";
import mime from "mime";
import path from "path";

/**
 * ファイル情報です。
 */
interface File {
    _id: string;
    /** このファイルのパスです。 */
    path: string;
    /** フォルダの時に使います。ファイルの場合はundefinedです。ファイル名のリストです。`{path}/{paths[x]}で実際のパスに変換できます。 */
    paths?: string[];
    /** 
     * ファイルの時に使います。フォルダの場合はundefinedです。
     * 
     * チャンクリストです。書き込みたい範囲をチャンクを使って書き込みます。
     * 
     * このチャンクリストは飛び飛びで書き込まれている場合もあります。0-600と800-2010がチャンクリストに含まれている場合、601-799は空です。単位はbyteです。
     * 
     * チャンクの最大は4MBです。もしファイルサイズが4MBでチャンクが500KBなどがある場合、最適化することをおすすめします。
     */
    chunkIds?: {
        /** チャンクIDです。 */
        chunkId: string;
        /** 保存年です。チャンクの保存先が変わります。 */
        year: number;
        /** 開始範囲です。 */
        start: number;
        /** 終了範囲です。 */
        end: number;
    }[];
    /** 最後にアクセスされた時間です。全てのアクセスが含まれます。 */
    atimeMs: number;
    /** 最後に変更された時間です。書き込みのみが含まれます。 */
    mtimeMs: number;
    /** 最後に状態が変更された時間です。renameや属性変更が含まれます。 */
    ctimeMs: number;
    /** 作成された時間です。 */
    birthtimeMs: number;
    /** サイズです。実体サイズであるとは限りません。 */
    size: number;
    /** 読み込み中かどうかです。クラス内部でのフラグとはまた別です。*/
    reading: boolean;
    /** 書き込み中かどうかです。クラス内部でのフラグとはまた別です。*/
    writing: boolean;
}
/**
 * チャンクデータです。
 */
interface Chunk {
    _id: string;
    /** チャンクIDです。 */
    chunkId: string;
    /** 実データです。4MBあることがあります。 */
    binary: MongoDB.BSON.Binary;
}

/**
 * MongoDBにファイルを書き込んだり読み込んだりする処理を中心的に行います。
 * 
 * ポートを解放する側(サーバー)です。
 * 
 * できることは以下です。
 * - getでファイルを取得(接続中は書き込みをブロック)
 * - postでファイルを書き込み(接続中は読み込みをブロック)
 * - postでフォルダ作成
 * - getでフォルダリスト取得
 * 
 * 仕様
 * - ファイルの取得(GET): `/path/to/file` rangeで範囲を指定して読み込みができます。ファイルがないと404。ロック中の場合423が返ります。また、フォルダの場合はJSONが返ります。強制的にすると存在しないエリアを0で返します。
 * - ファイルの書き込み(POST): `/path/to/file` rangeで範囲を指定して書き込みができます。ロック中の場合423が返ります。強制的に行う場合、秩序の乱れる上書きが行われます。
 * - フォルダの作成(POST): `/path/to/folder` 親フォルダがないかファイルが存在する場合400が返ります。強制的に行う場合、存在しないフォルダを一気に作成します。
 * - ファイル一覧の取得(GET): `/path/to/file` ファイルの場合はデータが返ります。存在しないと404。ロック中の場合があり、423が返ります。強制的に行う場合、0が返ります。JSONは返りません。
 * - ファイルの削除(POST): `/path/to/file?fileDelete=true` ファイルがないと404。フォルダだと400。ロック中の場合423が返ります。強制的に行う場合、何も行われないか無秩序に削除されます。
 * - フォルダの削除(POST): `/path/to/folder?folderDelete=true` フォルダがないと404。ファイルだと400。ロック中の場合423が返ります。強制的に行う場合、何も行われないか無秩序に削除されます。
 * - パスの削除(POST): `/path/to/file?delete=true` 元がないと404。ロック中の場合423が返ります。強制的に行う場合、何も行われないか無秩序に削除されます。
 * - 移動(POST): `/path/to/file?move=true` 移動先をテキストデータで送信します。元がないと404。ロック中の場合423。移動先に何かがあると400が返ります。強制的に行う場合、上書きされたり予期しない動作が行われます。
 * 
 * 様々な処理はクエリに`force=true`を入れることで強制的に操作を行うことができます。たいていのエラーをスキップします。しかし、正しいデータが返るわけではありません。また、状態が悪くなる可能性もあります。
 */
export class MongoDBFileManagerServer {
    mongoClient: MongoDB.MongoClient;
    express: express.Express;
    MONGO_DB_NAME: string;
    constructor() {
        const env = envGet();
        if (!env.MONGO_DB_USERNAME || !env.MONGO_DB_PASSWORD || !env.MONGO_DB_URL || !env.MONGO_DB_AUTH_MECHANISM || !env.MONGO_DB_NAME) throw new Error("不完全な.env。");
        this.MONGO_DB_NAME = env.MONGO_DB_NAME
        const uri = "mongodb://" + encodeURIComponent(env.MONGO_DB_USERNAME) + ":" + encodeURIComponent(env.MONGO_DB_PASSWORD) + "@" + env.MONGO_DB_URL + "/?authMechanism=" + env.MONGO_DB_AUTH_MECHANISM;
        this.mongoClient = new MongoDB.MongoClient(uri);
        this.express = express();
        const client = this.mongoClient;
        const app = this.express;
        app.get("*", async (req, res) => {
            const query = req.query;
            const force = query.force === "true" ? true : false;
            /**
             * 配列の末尾はファイル名です。
             */
            const filepath = req.path.split("/").filter(Boolean);
            const db = client.db(this.MONGO_DB_NAME);
            const files = db.collection("files");
            const file = await files.findOne({ path: "/" + filepath.join("/") }) as File | null;
            if (file !== null) {
                if (file.chunkIds) {
                    const headers: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] = { "Accept-Ranges": "bytes" };
                    const length = file.size;
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
                    const range = parseRange(req.headers.range, length);
                    headers["content-length"] = String(range.end - range.start + 1);
                    const contentType = mime.getType(path.extname(filepath.join("/")).replace(".", ""));
                    headers["content-type"] = contentType ?? "application/octet-stream";
                    if (req.headers.range) headers["content-range"] = "bytes " + range.start + "-" + (range.end === 0 ? 0 : range.end - 1) + "/" + length;
                    const stream = this.#getDataStream(file, range);
                    if (!stream) {
                        if (!force) {
                            res.status(400);
                            res.end();
                        }
                        return;
                    }
                    stream.pipe(res);
                } else if (file.paths) {
                    const headers: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] = {};
                    const contentType = mime.getType(path.extname(filepath.join("/")).replace(".", ""));
                    headers["content-type"] = contentType ?? "application/octet-stream";
                    res.status(200);
                    return res.end(JSON.stringify(file.paths));
                } else {
                    res.status(500);
                    return res.end();
                }
            } else {
                if (!force) {
                    res.status(404);
                    res.end(await readFile("./404error.html"));
                    return;
                }
            }
        });
        app.post("*", async (req, res) => {
            const query = req.query as {
                start?: string;
                force?: string;
            };
            const force = query.force === "true" ? true : false;
            /**
             * 配列の末尾はファイル名です。
             */
            const filepath = req.path.split("/").filter(Boolean);
            const db = client.db(this.MONGO_DB_NAME);
            const files = db.collection("files");
            const folderpath = filepath.slice(0, filepath.length - 2);
            const folder = await files.findOne({ path: folderpath.join("/") }) as File | null;
            if (folder !== null) {
                const file = await files.findOne({ path: folderpath.join("/") }) as File | null;
                if (file && file.chunkIds) throw new Error("このエラーは出るべきではありませんが、このエラーがでたということはフォルダに書きこもうとした場合です。通常resに500などを出すか検討するべきです。");
                const rangeStart = Number(query.start) ?? 0;
                const validChunkId = file?.chunkIds?.filter(chunkData => rangeStart < chunkData.end).sort((a, b) => a.start - b.start) ?? [];
                let readedChunkPosition = rangeStart;
                let readingChunk: {
                    file: File;
                    chunk: Chunk;
                }
                async function getChunk(chunkId: string, year: number) {
                    const chunks = db.collection("chunk." + year);
                    const chunk = await chunks.findOne({ chunkId }) as Chunk | null;
                    if (chunk) return chunk.binary;
                }
                
            }
        });
    }
    /**
     * データ取得をするストリームを返します。
     * 
     * 試しに日本語で記述してみました。
     */
    #getDataStream(file: File, range: { start: number, end: number }) {
        if (range.start < 0 || range.end < 0 || range.end < range.start) return undefined;
        if (!file.chunkIds) return undefined;
        const チャンクIDのリスト = file.chunkIds.filter(data => data.start <= range.end && data.end >= range.start).sort((a, b) => a.start - b.start);
        const 読み込みストリーム = new Readable();
        const 利用するデータベース = this.mongoClient.db(this.MONGO_DB_NAME);
        (async () => {
            /** 書き込み済みのチャンクエンド番号です。もし`chunk.start - readedEndChunk - 1`が0以上ならそのバイト数を送信します。 */
            let さっき送信したチャンクの最後の番号 = 0;
            let 待機回数 = 1;
            for (const チャンクIDのデータ of チャンクIDのリスト) {
                if (待機回数 > 16) {
                    読み込みストリーム.destroy(new Error("書き込み作業中でしたが、待機時間が長すぎます。"));
                    return;
                }
                const ファイルデータ = 利用するデータベース.collection("chunks." + チャンクIDのデータ.year);
                const チャンクID = チャンクIDのデータ.chunkId;
                const チャンク情報 = await ファイルデータ.findOne({ chunkId: チャンクID }) as Chunk | null;
                if (チャンク情報 === null) {
                    console.warn("取得できないチャンクが存在します。パス: " + file.path);
                    continue;
                }
                /** 送る必要のあるチャンク開始位置です。もし負の値の場合、送る予定のデータの最初側を切り取る必要があります。切り取ってもマイナスである場合は引き継ぎます。 */
                const 送信するチャンクの開始位置 = チャンクIDのデータ.start - さっき送信したチャンクの最後の番号 - 1;
                /** チャンクデータです。 */
                const チャンクデータ = チャンク情報.binary.buffer;
                /** チャンクの開始位置です。正の場合、rangeより後ろ側にあり、負の場合、rangeの内側です。 */
                const チャンクデータの始め側の切り取り位置 = -送信するチャンクの開始位置;
                /** チャンクの終了位置です。正の場合、rangeより先の場所にあり、負の場合、rangeの内側です。 */
                const チャンクデータの終わり側の切り取り位置 = チャンクIDのデータ.end - range.end;
                /** 書き込むデータです。 */
                const 書き込むトリミング済みデータ = チャンクデータ.subarray(
                    チャンクデータの始め側の切り取り位置 > 0 ? チャンクデータの始め側の切り取り位置 : 0,
                    (チャンクIDのデータ.end - チャンクIDのデータ.start + 1) - (チャンクデータの終わり側の切り取り位置 >= 0 ? チャンクデータの終わり側の切り取り位置 : 0));
                if (チャンクデータの始め側の切り取り位置 > 0) {
                    if (読み込みストリーム.destroyed === true) break;
                    const 送信結果 = 読み込みストリーム.push(new Uint8Array(チャンクデータの始め側の切り取り位置));
                    if (送信結果 === false) {
                        await new Promise<void>(resolve => setTimeout(() => { resolve() }, 2 ** 待機回数));
                        待機回数++;
                    }
                    if (送信結果 === true) 待機回数 = 1;
                }
                if (読み込みストリーム.destroyed === true) break;
                const 送信結果 = 読み込みストリーム.push(書き込むトリミング済みデータ);
                if (送信結果 === false) {
                    await new Promise<void>(resolve => setTimeout(() => { resolve() }, 2 ** 待機回数));
                    待機回数++;
                }
                if (送信結果 === true) 待機回数 = 1;
                さっき送信したチャンクの最後の番号 = チャンクIDのデータ.end;
            }
            if (読み込みストリーム.destroyed === true) return;
            読み込みストリーム.push(null);
        })();
        return 読み込みストリーム;
    }
}

/**
 * # ファイルマネージャー(with MongoDB)
 * このクラスはfs/promisesを真似て作られた、MongoDBにデータを保存できるツールです。
 * 
 * このクラスでは次のような特徴があります。
 * - 読み込み・書き込みができる
 * - フォルダ作成ができる
 * - ファイル名の変更ができる(それによってデータの移動なども可能)
 * - 読み込み中は書き込み不可、書き込み中は読み込み不可などの機能あり(フォルダの削除も不可能になる)
 * - ファイルに対して追加情報(タグ)を書き込むと「._ファイル名.json」として保存される(そのため._*.jsonの作成・操作は不可能です。)
 * 
 * このクラスを利用するときに、fsとしてインポートすると、fsのように利用ができます。
 * 
 * 利用できる関数は以下です。
 * ```ts
 * // fs/promisesを参考
 * fs.mkdir(); // フォルダを作成
 * fs.readFile(); // ファイルを読み込む
 * fs.readdir(); // フォルダを読み込む
 * fs.rename(); // 名前を変更する(パスを変更する=移動)
 * fs.rm(); // ファイルを削除
 * fs.rmdir(); // フォルダを削除
 * fs.unlink(); // パスを削除(フォルダまたはファイルが削除)
 * fs.writeFile(); // ファイルを書き込む
 * 
 * // fsを参考
 * fs.createReadStream(); // 読み込みストリームを作成
 * fs.createWriteStream(); // 書き込みストリームを作成
 * 
 * // オリジナル
 * fs.readmeta(); // メタデータを読み込む
 * fs.writemeta(); // メタデータを書き込む
 * fs.mkmeta(); // メタデータを追記する
 * fs.rmmeta(); // メタデータを削除する
 * 
 * // 断片的に実装済み
 * fs.stat();
 * 
 * // アレンジ的実装
 * fs.exists(); // 存在を確認する
 * ```
 * これらの関数は互換性のために同じ名前にしていますが、ごく稀にfsと違う部分があるかと思います。その点は気づき次第修正します。
 * 
 * # 注意点
 * 1. fsとは違って**全ての階層を「/」で管理します。**全ての文字列をパスとして認識します。またcwdも「/」で統一されていると思ってください。tsファイルが階層の内側だからその位置の相対パスを使えば被らないとは思ってはなりません。
 * 2. フォルダの概念があるため、**フォルダがない場所にアクセスすることはできません。**`exist`や`stat`を利用して状態を確認してください。
 * 3. 関数単位で接続を確立しているため、接続に失敗するとエラーとなります。サーバーのURIを正しく設定することが重要です。しかし、それもできない場合があるかと思うので、全ての関数において、エラーをキャッチする仕組みを設計してください。
 */
export class MongoDBFileManager {
    /** アクセスするファイルマネージャーが起動したURLとポートです。フルで入力してください。 */
    uri: string = "http://localhost:6800";
    /**
     * パスの存在を確認します。
     * 
     * 例え親フォルダが存在しなくてもエラーになりません。
     */
    async exist(path: PathLike): Promise<boolean> {
        return false;
    }
    /**
     * パスの統計を返します。
     * 
     * 存在しない場合エラーが返ります。
     */
    async stat(path: PathLike): Promise<Stat> {
        return "" as any;
    }
}

/** パスの統計です。 */
export interface Stat {
    /**
     * 最後にアクセスされた時間です。全てのアクセスが含まれます。
     */
    atime: Date;
    /**
     * 最後にアクセスされた時間です。全てのアクセスが含まれます。
     */
    atimeMs: number;
    /** 
     * 最後に変更された時間です。書き込みのみが含まれます。
     */
    mtime: Date;
    /** 
     * 最後に変更された時間です。書き込みのみが含まれます。
     */
    mtimeMs: number;
    /**
     * 最後に状態が変更された時間です。renameや属性変更が含まれます。
     */
    ctime: Date;
    /**
     * 最後に状態が変更された時間です。renameや属性変更が含まれます。
     */
    ctimeMs: number;
    /** 
     * 作成された時間です。
     */
    birthtime: Date;
    /** 
     * 作成された時間です。
     */
    birthtimeMs: number;
    /**
     * 利用されているファイルサイズです。
     */
    size: number;
    /**
     * ファイルであるかどうかです。
     */
    isFile: () => boolean;
    /**
     * フォルダであるかどうかです。
     */
    isDirectory: () => boolean;
}
