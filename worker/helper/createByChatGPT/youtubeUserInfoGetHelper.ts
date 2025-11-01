import { Worker } from "worker_threads";
import path from "path";
import url from "url";
import type { youtube_v3 } from "googleapis";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

type Payload = { inputs: string[]; start: number };
type WorkerResp =
  | { ok: true; data: { type: "youtubeUserInfo"; body: any }[] }
  | { ok: false; error: string };

/**
 * 単発取得：入力ひとつ → Schema$Channel | undefined
 * - こちらは簡便用。内部で配列版を呼びます。
 */
export async function youtubeUserInfoGet(input: string): Promise<youtube_v3.Schema$Channel | undefined> {
  const res = await youtubeUserInfoGetBatch([input], 0);
  return res[0];
}

/**
 * バッチ取得：複数入力をワーカーに投げ、順序を保持した配列で返却。
 * - ワーカーが中心処理。ヘルパーはワーカーを起動して結果を渡すだけ。
 */
async function youtubeUserInfoGetBatch(inputs: string[], start = 0): Promise<(youtube_v3.Schema$Channel | undefined)[]> {
  const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "youtubeUserInfoGetWorker.js"); // ビルド後 .js を参照
  const payload: Payload = { inputs, start };

  const result: WorkerResp = await new Promise((resolve) => {
    const worker = new Worker(workerPath, { workerData: payload });
    worker.on("message", (msg) => resolve(msg as WorkerResp));
    worker.on("error", (err) => resolve({ ok: false, error: String(err) }));
    worker.on("exit", (code) => {
      if (code !== 0) resolve({ ok: false, error: `Worker stopped with exit code ${code}` });
    });
  });

  if (!result.ok) {
    throw new Error(`[youtubeUserInfoGetBatch] worker failed: ${result.error || "unknown error"}`);
  }
  if (!Array.isArray(result.data)) {
    throw new Error(`[youtubeUserInfoGetBatch] invalid worker payload: data is not an array`);
  }
  if (result.data.length !== inputs.length) {
    throw new Error(`[youtubeUserInfoGetBatch] result length mismatch: inputs=${inputs.length} results=${result.data.length}`);
  }
  const bodies = result.data.map((d, i) => {
    const body = (d && (d as any).body) as youtube_v3.Schema$Channel | undefined;
    if (!body) {
      throw new Error(`[youtubeUserInfoGetBatch] empty body at index ${i}`);
    }
    return body;
  });
  return bodies;
}
