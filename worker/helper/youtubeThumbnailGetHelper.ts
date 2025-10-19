import { Worker } from "worker_threads";
import path from "path";
import url from "url";

type ThumbRow = { videoId: string; thumbnailUrl: string };

type Payload = { inputs: string[]; start: number };
type WorkerResp =
  | { ok: true; data: { type: "youtubeThumbnail"; body: ThumbRow }[] }
  | { ok: false; error: string };

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** 単発（1件） */
export async function youtubeThumbnailGet(input: string): Promise<string | undefined> {
  const arr = await youtubeThumbnailGetBatch([input], 0);
  return arr[0]?.thumbnailUrl;
}

/** バッチ（複数件） */
export async function youtubeThumbnailGetBatch(
  inputs: string[],
  start = 0
): Promise<(ThumbRow | undefined)[]> {
  const workerPath = path.join(__dirname, "..", "youtubeThumbnailGetWorker.js"); // ビルド後 .js を参照
  const payload: Payload = { inputs, start };

  const result: WorkerResp = await new Promise((resolve) => {
    const worker = new Worker(workerPath, { workerData: payload });
    worker.on("message", (msg) => resolve(msg as WorkerResp));
    worker.on("error", (err) => resolve({ ok: false, error: String(err) }));
    worker.on("exit", (code) => {
      if (code !== 0) resolve({ ok: false, error: `Worker stopped with exit code ${code}` });
    });
  });

  if (!result.ok) return new Array(inputs.length).fill(undefined);
  const bodies = result.data.map((d) => d.body);
  return bodies;
}
