import express from "express";
import * as ws from "ws";

/** 起動時に使用するもの */
import { getOldData } from "../func/getOldData.js";
import { databaseCheck } from "../func/databaseCheck.js";
import { migrateDatabase } from "../func/migrateDatabase.js";
import { ReadyJSONFuncs } from "./class/readyJSONFuncs.js";

/** 常用機能 */
import { GetFuncs } from "./class/getFuncs.js";
import { post } from "./class/postFuncs.js";
import { SourceManager } from "./class/sourceManager.js";

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
    console.log("このプロセスのCWD: " + process.cwd());
    console.log("このメインプロセスファイルが置いてあるパス: " + new URL("./", import.meta.url).pathname);
    const rjsonf = new ReadyJSONFuncs();
    /**
     * JSONの取得です。このプログラムのすべてのデータが保存されています。
     * 
     * 取得に失敗するとプログラムがこの場所で終了します。
     */
    const json = rjsonf.getJSON();
    console.log("ミュージックライブラリ用JSONの初期化(読み込み)が完了しました。");
    if (false) { // 以前の音楽bot(v2)がある場合、そこのパスを指定すると読み込みます。すべてのJSONをチェックするという工程があるため、オフにすると起動が速くなります。
        await getOldData(new URL("../../discordMusicBot", import.meta.url).pathname, json);
        await rjsonf.saveJSON(json);
    }
    if (false) { // 同じバージョンの音楽bot(v3を想定)がある場合、そこのURLを指定すると安全に読み込みます。リストを取得するAPIが発行されますが、そのAPIの応答速度によっては、起動に支障をきたしません。
        await migrateDatabase("http://localhost:81", json);
        await rjsonf.saveJSON(json);
    }
    if (true) { // ミュージックライブラリの整合性チェックを行います。オフにすると起動が速くなります。
        await databaseCheck(new URL("../", import.meta.url).pathname, json);
        await rjsonf.saveJSON(json);
    }
    /**
     * YouTubeなどの動画情報と音声データを管理するクラスです。ダウンロードを並列で実行したり、複数の同じ要求が来ても重複しないで丁寧に実行してくれる賢い関数です。
     */
    const sourcemanager = new SourceManager(json, rjsonf);
    const app = express();
    const server = app.listen("81", () => { console.log("ミュージックライブラリのREST APIホストが0.0.0.0:81で開始しました。"); });
    /**
     * データの取得をするルーティングです。JSONからバイナリまで担当します。
     */
    const getter = new GetFuncs(json, sourcemanager, server);
    app.get("/*splat", async (req, res) => getter.main(req, res));
    app.post("/*splat", (req, res) => post(req, res, json, sourcemanager, server));

    // テスト
    const wsserver = new ws.WebSocketServer({ port: 82 }, () => { console.log("ミュージックライブラリのWebSocketホストが0.0.0.0:82で開始しました。") });
    wsserver.on("connection", (ws, req) => {
        ws.on("message", (data, isBinary) => { });
        ws.close();
    })
}

main();
