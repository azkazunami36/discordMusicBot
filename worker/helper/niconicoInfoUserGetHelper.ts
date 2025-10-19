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
  const workerPath = path.join(__dirname, "..", "niconicoInfoUserGetWorker.js"); // ビルド後 .js を参照
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
