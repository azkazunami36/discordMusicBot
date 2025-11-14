// processSliceInWorker.ts (ESM/TS)
import { Worker } from "worker_threads";

export type PlaylistData = { type: "videoId"; body: string };

export function appleChunkHelper(
  urls: string[],
  start: number
): Promise<PlaylistData[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../createByChatGPT/appleChunkWorker.ts", import.meta.url), // ←ビルド後のJSを指す
      {
        type: "module", // ESMの場合
        workerData: { urls, start },
      } as any
    );

    worker.once("message", (msg: any) => {
      if (msg?.ok) resolve(msg.data as PlaylistData[]);
      else reject(new Error(msg?.error ?? "worker failed"));
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}
