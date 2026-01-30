import { Worker } from "worker_threads";
import path from "path";
import url from "url";
import fs from "fs";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

type WorkerResp =
    | { ok: true; data: any[] }
    | { ok: false; error: string };

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

/**
 * ニコニコ動画を Snapshot API で検索します（橋渡しのみ）
 * - 入力: query (string)
 * - 返り値: NicoSnapshotItem[] | undefined
 */
export async function searchNicoVideo(query: string): Promise<NicoSnapshotItem[] | undefined> {
    if (typeof query !== "string" || !query.trim()) {
        throw new Error("[searchNicoVideo] query must be a non-empty string");
    }

    const workerPath = path.join(__dirname, "..", "..", "createByChatGPT", "searchNicoVideoWorker.js"); // ビルド後 .js を参照

    if (!fs.existsSync(workerPath)) {
        throw new Error(`[searchNicoVideo] worker not found: ${workerPath}`);
    }

    const result: WorkerResp = await new Promise((resolve) => {
        const worker = new Worker(workerPath, { workerData: query });
        worker.on("message", (msg) => resolve(msg as WorkerResp));
        worker.on("error", (err) => resolve({ ok: false, error: String(err) }));
        worker.on("exit", (code) => {
            if (code !== 0) resolve({ ok: false, error: `Worker stopped with exit code ${code}` });
        });
    });

    if (!result || result.ok !== true) {
        const errMsg = (result && (result as any).error) || "unknown error";
        throw new Error(`[searchNicoVideo] worker failed: ${errMsg}`);
    }

    const data = (result as any).data;
    if (!Array.isArray(data)) {
        throw new Error("[searchNicoVideo] invalid worker payload: data is not an array");
    }

    return data as NicoSnapshotItem[];
}
