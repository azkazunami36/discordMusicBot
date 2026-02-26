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
export async function fetchPlaylistVideoIdsFromUrl(urlStr: string): Promise<{ playlistId: string; videoIds: string[] } | undefined> {
  const workerPath = path.join(__dirname, "youtubePlaylistToVideoIdsWorker.js"); // ビルド後 .js を参照
  const payload = { url: urlStr };

  const result: WorkerResp = await new Promise((resolve) => {
    const worker = new Worker(workerPath, { workerData: payload });
    worker.on("message", (msg) => resolve(msg as WorkerResp));
    worker.on("error", (err) => resolve({ ok: false, error: String(err) }));
    worker.on("exit", (code) => {
      if (code !== 0) resolve({ ok: false, error: `Worker stopped with exit code ${code}` });
    });
  });

  if (!result.ok) return undefined;
  return result.data;
}
