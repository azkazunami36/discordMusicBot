// ./worker/helper/createByChatGPT/searchTweetHelper.ts
import path from "path";
import url from "url";
import { Worker } from "worker_threads";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export interface XPostInfo {
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
    view_count?: number;
  };
  raw: any;
}

/**
 * ワーカー（searchTweetWorker）を呼び出し、結果をそのまま返す。
 * - キャッシュなし
 * - ワーカー側でエラー → ここで throw
 */
export async function searchTweet(input: string, videoOnly = false): Promise<XPostInfo | undefined> {
  const workerPath = path.join(
    __dirname,
    "..",
    "..",
    "createByChatGPT",
    "searchTweetWorker.ts"
  );

  const result = await runWorker<
    { input: string; videoOnly?: boolean },
    { ok: boolean; data?: XPostInfo | undefined; error?: string }
  >(workerPath, { input, videoOnly });

  if (!result.ok) throw new Error(result.error || "searchTweetWorker failed");
  return result.data;
}

function runWorker<I, O>(filename: string, workerData: I): Promise<O> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(filename, { workerData });
    worker.once("message", (msg: O) => resolve(msg));
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}
