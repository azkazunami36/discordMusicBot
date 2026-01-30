import { Worker } from "worker_threads";
import path from "path";
import url from "url";
import type { VideoMetadataResult } from "yt-search";

type Payload = { videoIds: string[]; start: number };
type WorkerResp =
  | { ok: true; data: { type: "youtubeInfo"; body: VideoMetadataResult }[] }
  | { ok: false; error: string };

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** 単発（1件） */
export async function youtubeInfoGet(videoIdOrUrl: string): Promise<VideoMetadataResult | undefined> {
  const arr = await youtubeInfoGetBatch([videoIdOrUrl], 0);
  return arr[0];
}

/** バッチ（複数件） */
async function youtubeInfoGetBatch(
  videoIds: string[],
  start = 0
): Promise<(VideoMetadataResult | undefined)[]> {
  const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "youtubeInfoGetWorker.ts"); // ビルド後に .js を参照
  const payload: Payload = { videoIds, start };

  const result: WorkerResp = await new Promise((resolve) => {
    const worker = new Worker(workerPath, { workerData: payload });
    worker.on("message", (msg) => resolve(msg as WorkerResp));
    worker.on("error", (err) => resolve({ ok: false, error: String(err) }));
    worker.on("exit", (code) => {
      if (code !== 0) resolve({ ok: false, error: `Worker stopped with exit code ${code}` });
    });
  });

  if (!result.ok) return new Array(videoIds.length).fill(undefined);
  const bodies = result.data.map((d) => d.body);
  return bodies;
}
