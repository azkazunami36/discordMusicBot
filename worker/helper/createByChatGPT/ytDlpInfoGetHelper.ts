/**
 * Helper：Worker を呼び出すだけ。
 * 引数 Playlist を Worker に渡し、YtDlpInfo[] を返す。
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Playlist } from "../../../class/envJSON.js";
import { Picture } from "../../../class/sourcePathManager.js";
import { YtDlpInfo } from "../../../createByChatGPT/ytDlp.js";

/** Worker スクリプト（.ts → .js へビルド後の相対位置を想定） */
const workerPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../createByChatGPT/ytDlpInfoGetWorker.js"
);

type WorkerReply =
  | { ok: true; data: YtDlpInfo[]; stderr?: string }
  | { ok: false; error: string; stderr?: string };

/** 外部公開：プレイリストを渡して YtDlpInfo[] を取得 */
export function ytDlpInfoGet(playlist: Playlist | Picture): Promise<YtDlpInfo[]> {
  return new Promise<YtDlpInfo[]>((resolvePromise, rejectPromise) => {
    const worker = new Worker(workerPath, {
      workerData: { playlist }
    });

    let settled = false;

    worker.once("message", (msg: WorkerReply) => {
      settled = true;
      worker.terminate().catch(() => void 0);

      if (msg.ok) {
        resolvePromise(msg.data);
      } else {
        const e = new Error(msg.error || "yt-dlp worker failed");
        (e as any).stderr = msg.stderr;
        rejectPromise(e);
      }
    });

    worker.once("error", (err) => {
      if (!settled) {
        settled = true;
        worker.terminate().catch(() => void 0);
        rejectPromise(err);
      }
    });

    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        settled = true;
        rejectPromise(new Error(`yt-dlp worker exited with code ${code}`));
      }
    });
  });
}
