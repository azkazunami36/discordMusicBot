const LOG_PREFIX = "[twitterInfoGetWorker]";
import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";
import { parseTweetId } from "../helper/createByChatGPT/parseTweetIdHelper.js";
import { searchTweet } from "../helper/createByChatGPT/searchTweetHelper.js";

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
type SortedOut = { type: "twitterInfo"; body: XPostInfo }[];

// --- JSONL キャッシュ: ./cacheJSONs/twitterInfoCache.jsonl ---
const CACHE_DIR = path.join(__dirname, "..", "..", "cacheJSONs");
const CACHE_FILE = path.join(CACHE_DIR, "twitterInfoCache.jsonl");

function ensureCacheFileSync() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      console.log(`${LOG_PREFIX} ensureCacheFileSync: creating cache dir -> ${CACHE_DIR}`);
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} ensureCacheFileSync: failed to create cache dir`, e);
  }
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      console.log(`${LOG_PREFIX} ensureCacheFileSync: creating cache file -> ${CACHE_FILE}`);
      fs.writeFileSync(CACHE_FILE, "");
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} ensureCacheFileSync: failed to touch cache file`, e);
  }
}

function readAllCacheRowsSync(): XPostInfo[] {
  ensureCacheFileSync();
  try {
    const txt = String(fs.readFileSync(CACHE_FILE));
    if (!txt) return [];
    const rows: XPostInfo[] = [];
    const lines = txt.split("\n");
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try {
        rows.push(JSON.parse(s) as XPostInfo);
      } catch (e) {
        console.log(`${LOG_PREFIX} readAllCacheRowsSync: skip broken JSON line`);
      }
    }
    console.log(`${LOG_PREFIX} readAllCacheRowsSync: loaded ${rows.length} rows (lines=${lines.length})`);
    return rows;
  } catch (e) {
    console.error(`${LOG_PREFIX} readAllCacheRowsSync: failed to read cache`, e);
    return [];
  }
}

function lookupByIdSync(id: string): XPostInfo | undefined {
  const rows = readAllCacheRowsSync();
  const hit = rows.find((r: any) => r?.id === id);
  console.log(`${LOG_PREFIX} lookupByIdSync: id=${id} -> ${hit ? "HIT" : "MISS"}`);
  return hit;
}

function appendIfMissingByIdSync(row: XPostInfo) {
  const rows = readAllCacheRowsSync();
  if (rows.some((r: any) => r?.id === (row as any)?.id)) {
    console.log(`${LOG_PREFIX} appendIfMissingByIdSync: skip duplicate id=${(row as any)?.id}`);
    return;
  }
  try {
    fs.appendFileSync(CACHE_FILE, JSON.stringify(row) + "\n");
    console.log(`${LOG_PREFIX} appendIfMissingByIdSync: appended id=${(row as any)?.id}`);
  } catch (e) {
    console.error(`${LOG_PREFIX} appendIfMissingByIdSync: failed to append id=${(row as any)?.id}`, e);
  }
}

async function fetchTweet(input: string): Promise<XPostInfo | undefined> {
  ensureCacheFileSync();

  console.log(`${LOG_PREFIX} fetchTweet: input=${input}`);
  let tweetId: string | undefined;
  try {
    const parsed = await parseTweetId(input);
    console.log(`${LOG_PREFIX} fetchTweet: parseTweetId ->`, parsed);
    // 優先順: parsed.id -> URLから抽出 -> 入力が純数字ならそれをIDとして採用
    const directId = (parsed as any)?.id && /^\d{6,}$/.test(String((parsed as any).id)) ? String((parsed as any).id) : undefined;
    const urlId = parsed?.id?.match(/\/status\/(\d{6,})$/)?.[1];
    const numericInput = /^\d{6,}$/.test(String(input).trim()) ? String(input).trim() : undefined;
    tweetId = directId || urlId || numericInput;
    console.log(`${LOG_PREFIX} fetchTweet: extracted tweetId=${tweetId ?? "(none)"} (directId=${!!directId} urlId=${!!urlId} numericInput=${!!numericInput})`);
  } catch (e) {
    console.log(`${LOG_PREFIX} fetchTweet: parseTweetId threw`, e);
    // 解析が失敗しても、入力が数値IDだけなら拾う
    const numericInput = /^\d{6,}$/.test(String(input).trim()) ? String(input).trim() : undefined;
    if (numericInput) {
      tweetId = numericInput;
      console.log(`${LOG_PREFIX} fetchTweet: fallback numeric input -> tweetId=${tweetId}`);
    }
  }
  if (!tweetId) {
    console.log(`${LOG_PREFIX} fetchTweet: no tweetId -> skip`);
    return undefined;
  }

  const cached = lookupByIdSync(tweetId);
  if (cached) {
    console.log(`${LOG_PREFIX} fetchTweet: cache hit id=${tweetId}`);
    return cached;
  }

  let post: XPostInfo | undefined;
  try {
    console.log(`${LOG_PREFIX} fetchTweet: request -> searchTweet(${tweetId}, true)`);
    post = await searchTweet(tweetId, true);
    console.log(`${LOG_PREFIX} fetchTweet: response id=${(post as any)?.id ?? "(none)"} media=${(post as any)?.media?.length ?? 0}`);
  } catch (e) {
    console.log(`${LOG_PREFIX} fetchTweet: searchTweet failed id=${tweetId}`, e);
    post = undefined;
  }
  if (!post || !(post as any)?.id) {
    console.log(`${LOG_PREFIX} fetchTweet: not found id=${tweetId}`);
    return undefined;
  }

  appendIfMissingByIdSync(post);
  return post;
}

async function processSlice(data: Payload): Promise<SortedOut> {
  const { inputs, start } = data;
  console.log(`${LOG_PREFIX} processSlice: start=${start} count=${(inputs || []).length}`);

  const settled = await Promise.allSettled(
    (inputs || [])
      .filter(Boolean)
      .map((raw, idx) => fetchTweet(raw).then((info) => ({ num: start + idx, info })))
  );

  const rejected = settled.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (rejected.length) {
    console.log(`${LOG_PREFIX} processSlice: rejected count=${rejected.length}`);
  }

  const sorted: SortedOut = settled
    .filter((r): r is PromiseFulfilledResult<{ num: number; info: XPostInfo | undefined }> =>
      r.status === "fulfilled" && !!r.value?.info
    )
    .map((r) => r.value as { num: number; info: XPostInfo })
    .sort((a, b) => a.num - b.num)
    .map(({ info }) => ({ type: "twitterInfo", body: info }));

  console.log(`${LOG_PREFIX} processSlice: fulfilled with info=${sorted.length}`);
  return sorted;
}

// 起動即実行して結果を返す
console.log(`${LOG_PREFIX} boot: workerData=`, workerData);
processSlice(workerData as Payload).then(
  (res) => {
    console.log(`${LOG_PREFIX} done: ok data.length=${res.length}`);
    if (!parentPort) {
      console.error(`${LOG_PREFIX} fatal: parentPort is undefined (cannot postMessage)`);
      return;
      }
    parentPort.postMessage({ ok: true, data: res });
  },
  (err) => {
    console.error(`${LOG_PREFIX} fatal: processSlice threw`, err);
    if (parentPort) parentPort.postMessage({ ok: false, error: String(err) });
  }
);
