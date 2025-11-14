import { Worker } from "worker_threads";
import path from "path";
import url from "url";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

type WorkerResp =
  | { ok: true; data: { playlistId: string; videoIds: string[] } | undefined }
  | { ok: false; error: string };

/**
 * 与えられたプレイリストURLから { playlistId, videoIds[] } を取得。
 * ここではワーカー起動の橋渡しのみを行い、処理は一切持ちません。
 */
export async function fetchPlaylistVideoIdsFromUrl(urlStr: string) {
  const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "youtubePlaylistToVideoIdsWorker.ts");
  const payload = { url: urlStr };

  const result: WorkerResp = await new Promise((resolve) => {
    const worker = new Worker(workerPath, { workerData: payload });

    worker.on("message", (msg) => {
      if (msg.log) {
        // ここで警告とエラーを主スレッドに表示
        if (msg.log.type === "warn") console.warn("[Worker warn]", msg.log.msg);
        if (msg.log.type === "error") console.error("[Worker error]", msg.log.msg);
        return;
      }

      resolve(msg as WorkerResp);
    });

    worker.on("error", (err) => {
      console.error("[Worker crashed]", err);
      resolve({ ok: false, error: String(err) });
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error("[Worker exited]", code);
        resolve({ ok: false, error: `Worker exited with ${code}` });
      }
    });
  });

  if (!result.ok) return undefined;
  return result.data;
}
