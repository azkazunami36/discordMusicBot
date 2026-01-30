import { Worker } from "worker_threads";
import path from "path";
import url from "url";
import fs from "fs";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** env 側と整合するローカル型（import はしない） */
export interface NicoChannelInfo {
  id: string;
  url: string;
  name: string;
  iconUrl: string;
  source?: "og";
  raw?: any;
}

type Payload = { inputs: string[]; start: number };
type WorkerResp =
  | { ok: true; data: { type: "niconicoChannelInfo"; body: NicoChannelInfo }[] }
  | { ok: false; error: string };

/** 単発（1件） */
export async function niconicoChannelInfoGet(input: string): Promise<NicoChannelInfo | undefined> {
  const arr = await niconicoChannelInfoGetBatch([input], 0);
  return arr[0];
}

/** バッチ（複数件） */
export async function niconicoChannelInfoGetBatch(
  inputs: string[],
  start = 0
): Promise<(NicoChannelInfo | undefined)[]> {
  const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "niconicoChannelInfoGetWorker.ts"); // ビルド後 .js を参照

  if (!Array.isArray(inputs)) {
    throw new Error("[niconicoChannelInfoGetBatch] inputs must be an array");
  }
  if (!fs.existsSync(workerPath)) {
    throw new Error(`[niconicoChannelInfoGetBatch] worker not found: ${workerPath}`);
  }

  const payload: Payload = { inputs, start };

  const result: WorkerResp = await new Promise((resolve) => {
    const worker = new Worker(workerPath, { workerData: payload });
    worker.on("message", (msg) => resolve(msg as WorkerResp));
    worker.on("error", (err) => resolve({ ok: false, error: String(err) }));
    worker.on("exit", (code) => {
      if (code !== 0) resolve({ ok: false, error: `Worker stopped with exit code ${code}` });
    });
  });

  if (!result || result.ok !== true) {
    const errMsg = (result && (result as any).error) || "unknown error";
    throw new Error(`[niconicoChannelInfoGetBatch] worker failed: ${errMsg}`);
  }

  const dataArr = result.data;
  if (!Array.isArray(dataArr)) {
    throw new Error("[niconicoChannelInfoGetBatch] invalid worker payload: data is not an array");
  }

  const bodies = dataArr.map((d, i) => {
    const body = d && (d as any).body as NicoChannelInfo | undefined;
    if (!body) {
      throw new Error(`[niconicoChannelInfoGetBatch] empty body at index ${i}`);
    }
    return body;
  });

  return bodies;
}
