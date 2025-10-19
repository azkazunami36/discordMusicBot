import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** env 側と整合するローカル型（import はしない） */
interface NicoChannelInfo {
  id: string;             // chNNNNNN 形式
  url: string;            // https://ch.nicovideo.jp/<id> （正規化URL）
  name: string;           // OGから取得（必須）
  iconUrl: string;        // OGから取得（必須）
  source?: "og";          // 取得元（将来拡張用）
  raw?: any;              // 予備（将来の解析用）
}

type Payload = { inputs: string[]; start: number };
type SortedOut = { type: "niconicoChannelInfo"; body: NicoChannelInfo }[];

// --- JSONL キャッシュ: ./cacheJSONs/niconicoChannelInfoCache.jsonl ---
const CACHE_DIR = path.join(__dirname, "..", "cacheJSONs");
const CACHE_FILE = path.join(CACHE_DIR, "niconicoChannelInfoCache.jsonl");

function ensureCacheFileSync() {
  try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, ""); } catch {}
}

function readAllCacheRowsSync(): NicoChannelInfo[] {
  ensureCacheFileSync();
  try {
    const txt = String(fs.readFileSync(CACHE_FILE));
    if (!txt) return [];
    const rows: NicoChannelInfo[] = [];
    for (const line of txt.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try { rows.push(JSON.parse(s) as NicoChannelInfo); } catch {}
    }
    return rows;
  } catch { return []; }
}

function lookupByChannelIdSync(id: string): NicoChannelInfo | undefined {
  const rows = readAllCacheRowsSync();
  return rows.find((r: any) => r?.id?.toLowerCase?.() === id.toLowerCase());
}

function appendIfMissingByIdSync(row: NicoChannelInfo) {
  // 保存直前に再読込 → 同一 id があれば追記スキップ
  const rows = readAllCacheRowsSync();
  if (rows.some((r: any) => r?.id?.toLowerCase?.() === (row as any)?.id?.toLowerCase?.())) return;
  try { fs.appendFileSync(CACHE_FILE, JSON.stringify(row) + "\n"); } catch {}
}

// 入力から chNNNNNN を抽出（URL/ID両対応）
function extractNicoChannelId(input: string): string | undefined {
  const ID_RE = /^ch\d+$/i;
  if (ID_RE.test(input)) return input;

  try {
    const u = new URL(input);
    // 例: https://ch.nicovideo.jp/ch123456
    const m1 = u.pathname.match(/\/(ch\d+)$/i);
    if (m1) return m1[1];
    // 例: https://ch.nicovideo.jp/channel/ch123456
    const m2 = u.pathname.match(/\/channel\/(ch\d+)/i);
    if (m2) return m2[1];
  } catch {
    if (ID_RE.test(input)) return input;
  }
  return undefined;
}

async function fetchChannel(input: string): Promise<NicoChannelInfo | undefined> {
  ensureCacheFileSync();

  const channelId = extractNicoChannelId(input);
  if (!channelId) return undefined;

  // キャッシュヒット
  const cached = lookupByChannelIdSync(channelId);
  if (cached) return cached;

  // 取得（OGメタ）
  const primaryUrl = `https://ch.nicovideo.jp/${channelId}`;
  const altUrl = `https://ch.nicovideo.jp/channel/${channelId}`;

  let html: string | undefined;
  try {
    let res = await fetch(primaryUrl as any);
    if (!res.ok) {
      const alt = await fetch(altUrl as any);
      if (!alt.ok) return undefined;
      res = alt as any;
    }
    html = await (res as any).text();
  } catch {
    return undefined;
  }
  if (!html) return undefined;

  // name
  let name: string | undefined;
  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["'][^>]*>/i);
  if (ogTitle) name = ogTitle[1].trim();
  if (!name) {
    const t = html.match(/<title>([^<]+)<\/title>/i);
    if (t) name = t[1].trim();
  }

  // icon
  let iconUrl: string | undefined;
  const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["'][^>]*>/i);
  if (ogImage) iconUrl = ogImage[1].trim();

  if (!name || !iconUrl) return undefined;

  const info: NicoChannelInfo = {
    id: channelId,
    url: primaryUrl,
    name,
    iconUrl,
    source: "og",
    raw: { from: "og" }
  };

  // 保存（直前に再読込 → 重複ならスキップ）
  appendIfMissingByIdSync(info);

  return info;
}

async function processSlice(data: Payload): Promise<SortedOut> {
  const { inputs, start } = data;

  const settled = await Promise.allSettled(
    (inputs || [])
      .filter(Boolean)
      .map((raw, idx) => fetchChannel(raw).then((info) => ({ num: start + idx, info })))
  );

  const sorted: SortedOut = settled
    .filter((r): r is PromiseFulfilledResult<{ num: number; info: NicoChannelInfo | undefined }> =>
      r.status === "fulfilled" && !!r.value?.info
    )
    .map((r) => r.value as { num: number; info: NicoChannelInfo })
    .sort((a, b) => a.num - b.num)
    .map(({ info }) => ({ type: "niconicoChannelInfo", body: info }));

  return sorted;
}

// 起動即実行して結果を返す
processSlice(workerData as Payload).then(
  (res) => parentPort?.postMessage({ ok: true, data: res }),
  (err) => parentPort?.postMessage({ ok: false, error: String(err) })
);
