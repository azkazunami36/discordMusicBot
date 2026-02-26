/**
 * このファイルは`npm start`を実行したらすぐに立ち上がるスクリプトです。
 */
import { envGet, envSet } from "./class/envManager.js";
import { SumLog } from "./class/sumLog.js";
import "dotenv/config";

process.on("uncaughtException", (err) => {
    console.error("キャッチされずグローバルで発生した例外:", err);
    SumLog.error("グローバルでエラーが発生しました。ログを確認してください。", { functionName: "process.on" });
});

process.on("unhandledRejection", (reason) => {
    console.error("未処理の拒否:", reason);
    SumLog.error("よくわからないけどunhandledRejectionっていうやつが発生しました。ログを見てください。", { functionName: "process.on" });
});

