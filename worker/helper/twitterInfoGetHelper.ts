import { Worker } from "worker_threads";
import path from "path";
import url from "url";
import type { XPostInfo } from "../../twitter.js";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

type Payload = { inputs: string[]; start: number };
type WorkerResp =
  | { ok: true; data: { type: "twitterInfo"; body: XPostInfo }[] }
  | { ok: false; error: string };

/** 単発（1件） */
export async function twitterInfoGet(input: string): Promise<XPostInfo | undefined> {
  const arr = await twitterInfoGetBatch([input], 0);
  return arr[0];
}

/** バッチ（複数件） */
export async function twitterInfoGetBatch(
  inputs: string[],
  start = 0
): Promise<(XPostInfo | undefined)[]> {
  const workerPath = path.join(__dirname, "..", "twitterInfoGetWorker.js"); // ビルド後 .js を参照
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
