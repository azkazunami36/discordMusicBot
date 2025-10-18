import { parentPort, workerData } from "worker_threads";
import { VideoMetaCache } from "../envJSON.js";
// ワーカー内で利用する関数をimport（別プロセスで取得できる前提）

type Payload = { urls: string[]; start: number };
type SortedOut = { type: "videoId"; body: string }[];

const videoMetaCache = new VideoMetaCache();
async function processSlice(data: Payload): Promise<SortedOut> {
    const { urls, start } = data;

    const settled = await Promise.allSettled(
        urls
            .filter(Boolean)
            .map((url, idx) =>
                videoMetaCache.spotifyToYouTubeId(url).then((id) => ({
                    num: start + idx,
                    id,
                }))
            )
    );

    const sorted: SortedOut = settled
        .filter(
            (r): r is PromiseFulfilledResult<{ num: number; id: string }> =>
                r.status === "fulfilled" && !!r.value?.id
        )
        .map((r) => r.value)
        .sort((a, b) => a.num - b.num)
        .map(({ id }) => ({ type: "videoId", body: id }));

    return sorted;
}

// 起動即実行して結果を返すワーカー
processSlice(workerData as Payload).then(
    (res) => parentPort?.postMessage({ ok: true, data: res }),
    (err) => parentPort?.postMessage({ ok: false, error: String(err) })
);
