import { Worker } from "worker_threads";
import path from "path";
import url from "url";

interface XPostInfo {
  id: string;
  text?: string;
  created_at?: string;
  author?: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
    verified?: boolean;
  };
  media?: Array<{
    media_key: string;
    type: "photo" | "video" | "animated_gif";
    url?: string;
    preview_image_url?: string;
    duration_ms?: number;
    variants?: Array<{
      bitrate?: number;
      content_type: string;
      url: string;
    }>;
  }>;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    view_count?: number; // 一部レベルでのみ返る
  };
  raw: any; // フルレスポンスをそのまま保持（将来の拡張用）
}

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
  const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "twitterInfoGetWorker.ts"); // ビルド後 .js を参照
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
