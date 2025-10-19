import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";
import { searchTweet, XPostInfo } from "../twitter.js";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

type Payload = { inputs: string[]; start: number };
type SortedOut = { type: "twitterInfo"; body: XPostInfo }[];

// --- JSONL キャッシュ: ./cacheJSONs/twitterInfoCache.jsonl ---
const CACHE_DIR = path.join(__dirname, "..", "cacheJSONs");
const CACHE_FILE = path.join(CACHE_DIR, "twitterInfoCache.jsonl");

function ensureCacheFileSync() {
  try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, ""); } catch {}
}

function readAllCacheRowsSync(): XPostInfo[] {
  ensureCacheFileSync();
  try {
    const txt = String(fs.readFileSync(CACHE_FILE));
    if (!txt) return [];
    const rows: XPostInfo[] = [];
    for (const line of txt.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try { rows.push(JSON.parse(s) as XPostInfo); } catch {}
    }
    return rows;
  } catch { return []; }
}

function lookupByIdSync(id: string): XPostInfo | undefined {
  const rows = readAllCacheRowsSync();
  return rows.find((r: any) => r?.id === id);
}

function appendIfMissingByIdSync(row: XPostInfo) {
  // 保存直前に必ず再読込 → 同一 id があれば追記スキップ
  const rows = readAllCacheRowsSync();
  if (rows.some((r: any) => r?.id === (row as any)?.id)) return;
  try { fs.appendFileSync(CACHE_FILE, JSON.stringify(row) + "\n"); } catch {}
}

// URL/ID から tweetId を抽出（x.com / twitter.com / mobile / fxtwitter など広めに対応）
function extractTweetId(input: string): string | undefined {
  // 素の数字
  if (/^\d{6,}$/.test(input)) return input;

  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    const host = u.hostname.toLowerCase();
    if (/(^|\.)(twitter|x)\.com$/.test(host) || /(^|\.)fxtwitter\.com$/.test(host)) {
      // /<user>/status/<id> or /<user>/statuses/<id>
      const m = u.pathname.match(/\/status(?:es)?\/(\d{6,})/i);
      if (m?.[1]) return m[1];
    }
    // t.co の場合はクライアント側で展開されているはずなので対象外
  } catch {
    /* not a URL */
  }
  return undefined;
}

async function fetchTweet(input: string): Promise<XPostInfo | undefined> {
  ensureCacheFileSync();

  const tweetId = extractTweetId(input);
  if (!tweetId) return undefined;

  // キャッシュヒット
  const cached = lookupByIdSync(tweetId);
  if (cached) return cached;

  // 取得（searchTweet は第二引数に true を渡す実装に合わせる）
  let post: XPostInfo | undefined;
  try {
    post = await searchTweet(tweetId, true);
  } catch {
    post = undefined;
  }
  if (!post || !(post as any)?.id) return undefined;

  // 保存（直前に再読込 → 重複スキップ）
  appendIfMissingByIdSync(post);

  return post;
}

async function processSlice(data: Payload): Promise<SortedOut> {
  const { inputs, start } = data;

  const settled = await Promise.allSettled(
    (inputs || [])
      .filter(Boolean)
      .map((raw, idx) => fetchTweet(raw).then((info) => ({ num: start + idx, info })))
  );

  const sorted: SortedOut = settled
    .filter((r): r is PromiseFulfilledResult<{ num: number; info: XPostInfo | undefined }> =>
      r.status === "fulfilled" && !!r.value?.info
    )
    .map((r) => r.value as { num: number; info: XPostInfo })
    .sort((a, b) => a.num - b.num)
    .map(({ info }) => ({ type: "twitterInfo", body: info }));

  return sorted;
}

// 起動即実行して結果を返す
processSlice(workerData as Payload).then(
  (res) => parentPort?.postMessage({ ok: true, data: res }),
  (err) => parentPort?.postMessage({ ok: false, error: String(err) })
);
