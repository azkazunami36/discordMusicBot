import { Worker } from "worker_threads";
import path from "path";
import url from "url";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

type WorkerResp =
  | { ok: true; data: string[] | undefined }
  | { ok: false; error: string };

/**
 * 橋渡しのみ（入出力は元関数と同一シグネチャ）
 */
export async function getNicoMylistIds(urlStr: string): Promise<string[] | undefined> {
  const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "getNicoMylistIdsWorker.js"); // ビルド後 .js を参照

  const result: WorkerResp = await new Promise((resolve) => {
    const worker = new Worker(workerPath, { workerData: urlStr });
    worker.on("message", (msg) => resolve(msg as WorkerResp));
    worker.on("error", (err) => resolve({ ok: false, error: String(err) }));
    worker.on("exit", (code) => {
      if (code !== 0) resolve({ ok: false, error: `Worker stopped with exit code ${code}` });
    });
  });

  if (!result.ok) return undefined;
  return result.data;
}
