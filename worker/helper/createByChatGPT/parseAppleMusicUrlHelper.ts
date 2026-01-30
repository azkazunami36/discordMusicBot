import { Worker } from "worker_threads";
import path from "path";
import url from "url";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

type WorkerResp =
  | { ok: true; data: string[] | undefined }
  | { ok: false; error: string };

/**
 * 入力URLを受け取り、worker で解析した「曲URL配列 or undefined」を返します。
 * ここでは処理を一切持たず、ワーカー起動の橋渡しのみを行います。
 */
export async function parseAppleMusicUrl(urlStr: string): Promise<string[] | undefined> {
  const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "parseAppleMusicUrlWorker.ts"); // ビルド後の .js を参照
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
