import { Worker } from "worker_threads";
import path from "path";
import url from "url";
import fs from "fs";
interface NicoSnapshotItem {
    // 基本
    contentId: string;
    title: string;
    description?: string;
    // カウンタ類
    viewCounter?: number;
    mylistCounter?: number;
    likeCounter?: number;
    commentCounter?: number;
    // 動画情報
    lengthSeconds?: number;
    startTime?: string;
    lastResBody?: string;
    // サムネ・ジャンル・タグ
    thumbnailUrl?: string;
    genre?: string;
    tags?: string;
    // ユーザー / チャンネル情報
    userId?: string;
    userNickname?: string;
    channelId?: string;
    channelName?: string;
    // その他（APIが追加で返す可能性のある項目をキャッチ）
    [key: string]: string | number | undefined;
}
type Payload = { contentIds: string[]; start: number };
type WorkerResp =
  | { ok: true; data: { type: "niconicoInfo"; body: NicoSnapshotItem }[] }
  | { ok: false; error: string };

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** 単発（1件） */
export async function niconicoInfoGet(input: string): Promise<NicoSnapshotItem | undefined> {
  const arr = await niconicoInfoGetBatch([input], 0);
  return arr[0];
}

/** バッチ（複数件） */
export async function niconicoInfoGetBatch(
  contentIds: string[],
  start = 0
): Promise<(NicoSnapshotItem | undefined)[]> {
  const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "niconicoInfoGetWorker.ts"); // ビルド後 .js を参照

  if (!Array.isArray(contentIds)) {
    throw new Error("[niconicoInfoGetBatch] contentIds must be an array");
  }
  if (!fs.existsSync(workerPath)) {
    throw new Error(`[niconicoInfoGetBatch] worker not found: ${workerPath}`);
  }

  const payload: Payload = { contentIds, start };

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
    throw new Error(`[niconicoInfoGetBatch] worker failed: ${errMsg}`);
  }

  if (!Array.isArray(result.data)) {
    throw new Error("[niconicoInfoGetBatch] invalid worker payload: data is not an array");
  }

  // それぞれの要素に body があるかを検証
  const bodies = result.data.map((d, i) => {
    const body = d && (d as any).body as NicoSnapshotItem | undefined;
    if (!body) {
      throw new Error(`[niconicoInfoGetBatch] empty body at index ${i}`);
    }
    return body;
  });

  return bodies;
}
