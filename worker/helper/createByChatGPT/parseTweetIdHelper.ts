import path from "path";
import url from "url";
import { Worker } from "worker_threads";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * ワーカーを呼び出してツイートのIDと（あれば）メディアインデックスを返す。
 * - 戻り値: { id: string; index?: number } | undefined
 * - エラーは throw で伝播
 * - ネットワークアクセスなし（ワーカー側で完結）
 */
export async function parseTweetId(
  input: string
): Promise<{ id: string; index?: number } | undefined> {
  const workerPath = path.join(
    __dirname,
    "..",
    "..",
    "createByChatGPT",
    "parseTweetIdWorker.ts"
  );

  const result = await runWorker<
    { input: string },
    { ok: boolean; data?: { id: string; index?: number } | undefined; error?: string }
  >(
    workerPath,
    { input }
  );

  if (!result.ok) throw new Error(result.error || "parseTweetIdWorker failed");
  return result.data; // { id: string; index?: number } | undefined
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
