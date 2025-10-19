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
  try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, ""); } catch {}
}

function readAllCacheRowsSync(): NicoSnapshotItem[] {
  ensureCacheFileSync();
  try {
    const txt = String(fs.readFileSync(CACHE_FILE));
    if (!txt) return [];
    const rows: NicoSnapshotItem[] = [];
    for (const line of txt.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try { rows.push(JSON.parse(s) as NicoSnapshotItem); } catch {}
    }
    return rows;
  } catch { return []; }
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
  if (!contentId) return undefined;

  // キャッシュ確認
  const cached = lookupByContentIdSync(contentId);
  if (cached) return cached;

  // 取得（searchNicoVideo は配列を返す想定）
  try {
    const result = await searchNicoVideo(contentId);
    const hit: NicoSnapshotItem | undefined = Array.isArray(result) ? result[0] : undefined;
    if (!hit) return undefined;

    // 保存（直前に再読込 → 重複ならスキップ）
    appendIfMissingByContentIdSync(hit);
    return hit;
  } catch {
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

  const sorted: SortedOut = settled
    .filter(
      (r): r is PromiseFulfilledResult<{ num: number; info: NicoSnapshotItem | undefined }> =>
        r.status === "fulfilled" && !!r.value?.info
    )
    .map((r) => r.value as { num: number; info: NicoSnapshotItem })
    .sort((a, b) => a.num - b.num)
    .map(({ info }) => ({ type: "niconicoInfo", body: info }));

  return sorted;
}

// 起動即実行して結果を返す
processSlice(workerData as Payload).then(
  (res) => parentPort?.postMessage({ ok: true, data: res }),
  (err) => parentPort?.postMessage({ ok: false, error: String(err) })
);
