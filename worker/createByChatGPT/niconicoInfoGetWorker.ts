// --- Robust error logger ---
function logErr(ctx: string, err: unknown) {
  try {
    const msg = err instanceof Error ? (err.stack || err.message) : String(err);
    console.error(`[niconicoInfoGetWorker][${ctx}]`, msg);
  } catch {
    // as a last resort
    console.error(`[niconicoInfoGetWorker][${ctx}]`, err);
  }
}
import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";
import { searchNicoVideo } from "../helper/createByChatGPT/searchNicoVideoHelper.js";
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
type SortedOut = { type: "niconicoInfo"; body: NicoSnapshotItem }[];

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// --- JSONL キャッシュ: ./cacheJSONs/niconicoInfoCache.jsonl ---
const CACHE_DIR = path.join(__dirname, "..", "..", "cacheJSONs");
const CACHE_FILE = path.join(CACHE_DIR, "niconicoInfoCache.jsonl");

function ensureCacheFileSync() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (e) { logErr("ensureCacheFileSync:mkdir", e); }
  try {
    if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, "");
  } catch (e) { logErr("ensureCacheFileSync:touch", e); }
}

function readAllCacheRowsSync(): NicoSnapshotItem[] {
  ensureCacheFileSync();
  try {
    const txt = String(fs.readFileSync(CACHE_FILE));
    if (!txt) return [];
    const rows: NicoSnapshotItem[] = [];
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].trim();
      if (!s) continue;
      try {
        rows.push(JSON.parse(s) as NicoSnapshotItem);
      } catch (e) {
        logErr(`readAllCacheRowsSync:parse line=${i + 1}`, e);
      }
    }
    return rows;
  } catch (e) {
    logErr("readAllCacheRowsSync:read", e);
    return [];
  }
}

function lookupByContentIdSync(contentId: string): NicoSnapshotItem | undefined {
  const rows = readAllCacheRowsSync();
  return rows.find((r: any) => r?.contentId === contentId);
}

function appendIfMissingByContentIdSync(row: NicoSnapshotItem) {
  // 保存直前に再読込 → 同一 contentId があれば追記スキップ
  const rows = readAllCacheRowsSync();
  if (rows.some((r: any) => r?.contentId === (row as any)?.contentId)) return;
  try { fs.appendFileSync(CACHE_FILE, JSON.stringify(row) + "\n"); } catch {}
}

// 入力から sm/nm/so + 数字 の contentId を抽出（URL/ID両対応）
function extractNicoContentId(input: string): string | undefined {
  const ID_RE = /^(sm|nm|so)\d+$/i;
  if (ID_RE.test(input)) return input;

  try {
    const u = new URL(input);
    // 例: https://www.nicovideo.jp/watch/smXXXXXX
    const m = u.pathname.match(/\/watch\/((?:sm|nm|so)\d+)/i);
    if (m) return m[1];
    // 例: https://sp.nicovideo.jp/watch/smXXXXXX 等の派生にも対応
    const parts = u.pathname.split("/").filter(Boolean);
    const cand = parts.find((p) => ID_RE.test(p));
    if (cand) return cand;
  } catch {
    // URLでなければ ID フォーマット再確認
    if (ID_RE.test(input)) return input;
  }
  return undefined;
}

async function fetchSnapshot(input: string): Promise<NicoSnapshotItem | undefined> {
  ensureCacheFileSync();

  const contentId = extractNicoContentId(input);
  if (!contentId) {
    logErr("fetchSnapshot:invalidContentId", new Error(`Invalid input: ${input}`));
    console.warn(`[niconicoInfoGetWorker] Skipped invalid input: ${input}`);
    return undefined;
  }

  try {
    const cached = lookupByContentIdSync(contentId);
    if (cached) {
      console.log(`[niconicoInfoGetWorker] Cache hit for ${contentId}`);
      return cached;
    }
  } catch (e) {
    logErr("fetchSnapshot:cacheLookup", e);
    console.error(`[niconicoInfoGetWorker] Cache lookup failed for ${contentId}`);
  }

  try {
    const result = await searchNicoVideo(contentId);
    const hit: NicoSnapshotItem | undefined = Array.isArray(result) ? result[0] : undefined;
    if (!hit) {
      logErr("fetchSnapshot:noHit", new Error(`No result found for ${contentId}`));
      console.warn(`[niconicoInfoGetWorker] No search result for ${contentId}`);
      return undefined;
    }
    try {
      appendIfMissingByContentIdSync(hit);
      console.log(`[niconicoInfoGetWorker] Cached new item ${contentId}`);
    } catch (e) {
      logErr("fetchSnapshot:appendCache", e);
      console.error(`[niconicoInfoGetWorker] Failed to append cache for ${contentId}`);
    }
    return hit;
  } catch (e) {
    logErr("fetchSnapshot:search", e);
    console.error(`[niconicoInfoGetWorker] Search error for ${contentId}`);
    return undefined;
  }
}

async function processSlice(data: Payload): Promise<SortedOut> {
  const { contentIds, start } = data;

  const settled = await Promise.allSettled(
    (contentIds || [])
      .filter(Boolean)
      .map((raw, idx) => fetchSnapshot(raw).then((info) => ({ num: start + idx, info })))
  );

  // Log rejected promises with their reasons
  for (const r of settled) {
    if (r.status === "rejected") logErr("processSlice:rejected", r.reason);
  }

  const sorted: SortedOut = settled
    .filter(
      (r): r is PromiseFulfilledResult<{ num: number; info: NicoSnapshotItem | undefined }> =>
        r.status === "fulfilled" && !!r.value?.info
    )
    .map((r) => r.value as { num: number; info: NicoSnapshotItem })
    .sort((a, b) => a.num - b.num)
    .map(({ info }) => ({ type: "niconicoInfo", body: info }));

  if (sorted.length === 0) {
    console.error(`[niconicoInfoGetWorker] No valid results returned in processSlice, input count=${(contentIds||[]).length}`);
  }

  return sorted;
}

// 起動即実行して結果を返す
processSlice(workerData as Payload).then(
  (res) => {
    if (!Array.isArray(res) || res.length === 0) {
      console.error(`[niconicoInfoGetWorker] Worker completed but no valid data produced.`);
    }
    parentPort?.postMessage({ ok: true, data: res });
  },
  (err) => {
    logErr("workerEntry", err);
    parentPort?.postMessage({ ok: false, error: String(err) });
  }
);
