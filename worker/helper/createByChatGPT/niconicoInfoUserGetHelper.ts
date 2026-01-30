import fs from "fs";
import { Worker } from "worker_threads";
import path from "path";
import url from "url";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** envJSON.ts と整合するために同名の型を再掲（import はしない） */
export interface NicoUserInfo {
  id: string;
  url: string;
  name: string;
  iconUrl: string;
  source?: 'nvapi' | 'og';
  nickname?: string;
  description?: string;
  followerCount?: number;
  followingCount?: number;
  mylistCount?: number;
  videoCount?: number;
  createdAt?: string;
  userLevel?: number;
  isPremium?: boolean;
  isChannel?: boolean;
  coverImageUrl?: string;
  iconsNormal?: string;
  iconsLarge?: string;
  raw?: any;
}

type Payload = { inputs: string[]; start: number };
type WorkerResp =
  | { ok: true; data: { type: "niconicoUserInfo"; body: NicoUserInfo }[] }
  | { ok: false; error: string };

/** 単発（1件） */
export async function niconicoUserInfoGet(input: string): Promise<NicoUserInfo | undefined> {
  const arr = await niconicoUserInfoGetBatch([input], 0);
  return arr[0];
}

/** バッチ（複数件） */
export async function niconicoUserInfoGetBatch(
  inputs: string[],
  start = 0
): Promise<(NicoUserInfo | undefined)[]> {
  const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "niconicoInfoUserGetWorker.ts"); // ビルド後 .js を参照

  if (!Array.isArray(inputs)) {
    throw new Error("[niconicoUserInfoGetBatch] inputs must be an array");
  }
  if (!fs.existsSync(workerPath)) {
    throw new Error(`[niconicoUserInfoGetBatch] worker not found: ${workerPath}`);
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
    throw new Error(`[niconicoUserInfoGetBatch] worker failed: ${errMsg}`);
  }

  const dataArr = result.data;
  if (!Array.isArray(dataArr)) {
    throw new Error("[niconicoUserInfoGetBatch] invalid worker payload: data is not an array");
  }

  const bodies = dataArr.map((d, i) => {
    const body = d && (d as any).body as NicoUserInfo | undefined;
    if (!body) {
      throw new Error(`[niconicoUserInfoGetBatch] empty body at index ${i}`);
    }
    return body;
  });

  return bodies;
}
