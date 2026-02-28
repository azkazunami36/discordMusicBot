import { Worker } from "worker_threads";
import { MusicBrainzRecordingInfo, MusicBrainzReleaseInfo } from "./infoGetWorker.js";

export interface JSONAnalizerInfo {
    totalsize: number;
    numoffile: number;
}
/** 
 * dbmgr.jsonの内容を別スレッドで調査します。
 */
export function jsonAnalizer() {
    return new Promise<{
        youtube: JSONAnalizerInfo;
        niconico: JSONAnalizerInfo;
        twitter: JSONAnalizerInfo;
        soundcloud: JSONAnalizerInfo;
        totalsize: number;
        numoffile: number;
    }>((resolve, reject) => {
        const worker = new Worker(new URL("./jsonAnalyzerWorker.js", import.meta.url));
        let processDone = false;
        let errormsg = "";
        worker.on("message", async message => {
            if (message.errorText) {
                errormsg += message.errorText;
                return;
            }
            if (message.data !== undefined) {
                if (!processDone) {
                    processDone = true;
                    resolve(message.data);
                }
            }
        })
        worker.on("exit", code => {
            if (!processDone) {
                processDone = true;
                reject(new Error("意図しない理由でJSON分析関数は終了しました。終了コード: " + code + " 関数内エラー: " + errormsg));
            }
        })
        worker.on("error", err => {
            reject(new Error("エラーが発生しました。ワーカーのエラーと関数内のエラーを記載します。関数内エラー: " + errormsg + ", \nworker: " + err))
        })
    })
}
