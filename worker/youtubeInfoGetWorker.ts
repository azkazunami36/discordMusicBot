import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";
import yts, { VideoMetadataResult } from "yt-search";

type Payload = { videoIds: string[]; start: number };
type SortedOut = { type: "youtubeInfo"; body: VideoMetadataResult }[];

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// --- JSONL キャッシュ: ./cacheJSONs/youtubeInfoCache.jsonl ---
const CACHE_DIR = path.join(__dirname, "..", "cacheJSONs");
const CACHE_FILE = path.join(CACHE_DIR, "youtubeInfoCache.jsonl");

function ensureCacheFileSync() {
  try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, ""); } catch {}
}

function readAllCacheRowsSync(): VideoMetadataResult[] {
  ensureCacheFileSync();
  try {
    const txt = String(fs.readFileSync(CACHE_FILE));
    if (!txt) return [];
    const rows: VideoMetadataResult[] = [];
    for (const line of txt.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try { rows.push(JSON.parse(s) as VideoMetadataResult); } catch {}
    }
    return rows;
  } catch { return []; }
}

function lookupByVideoIdSync(videoId: string): VideoMetadataResult | undefined {
  const rows = readAllCacheRowsSync();
  return rows.find((r: any) => r?.videoId === videoId);
}

function appendIfMissingByVideoIdSync(row: VideoMetadataResult) {
  // 保存直前に再読込 → 同一 videoId があれば追記スキップ
  const rows = readAllCacheRowsSync();
  if (rows.some((r: any) => r?.videoId === (row as any)?.videoId)) return;
  try { fs.appendFileSync(CACHE_FILE, JSON.stringify(row) + "\n"); } catch {}
}

function extractYouTubeId(input: string): string | undefined {
  try {
    // すでにIDの可能性
    if (/^[a-zA-Z0-9_-]{10,}$/.test(input)) return input;

    const u = new URL(input);
    const host = u.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{6,}$/.test(id) ? id : undefined;
    }
    if (host.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{6,}$/.test(v)) return v;
      // /shorts/<id>, /embed/<id>, /v/<id>, /live/<id> などに対応
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.length >= 2 ? 1 : 0;
      const cand = parts[idx];
      if (cand && /^[a-zA-Z0-9_-]{6,}$/.test(cand)) return cand;
    }
    return undefined;
  } catch {
    // URL でない＆IDでもない場合
    return /^[a-zA-Z0-9_-]{10,}$/.test(input) ? input : undefined;
  }
}

async function fetchMeta(videoUrlOrId: string): Promise<VideoMetadataResult | undefined> {
  ensureCacheFileSync();

  const videoId = extractYouTubeId(videoUrlOrId);
  if (!videoId) return undefined;

  // キャッシュ確認
  const cached = lookupByVideoIdSync(videoId);
  if (cached) return cached;

  // yt-search で取得
  let meta: VideoMetadataResult | undefined;
  try {
    meta = (await yts({ videoId })) as unknown as VideoMetadataResult;
  } catch {
    meta = undefined;
  }
  if (!meta || !(meta as any)?.videoId) return undefined;

  // 保存（直前に再読込 → 重複ならスキップ）
  appendIfMissingByVideoIdSync(meta);

  return meta;
}

async function processSlice(data: Payload): Promise<SortedOut> {
  const { videoIds, start } = data;

  const settled = await Promise.allSettled(
    (videoIds || [])
      .filter(Boolean)
      .map((raw, idx) =>
        fetchMeta(raw).then((info) => ({ num: start + idx, info }))
      )
  );

  const sorted: SortedOut = settled
    .filter(
      (r): r is PromiseFulfilledResult<{ num: number; info: VideoMetadataResult | undefined }> =>
        r.status === "fulfilled" && !!r.value?.info
    )
    .map((r) => r.value as { num: number; info: VideoMetadataResult })
    .sort((a, b) => a.num - b.num)
    .map(({ info }) => ({ type: "youtubeInfo", body: info }));

  return sorted;
}

// 起動即実行して結果を返す
processSlice(workerData as Payload).then(
  (res) => parentPort?.postMessage({ ok: true, data: res }),
  (err) => parentPort?.postMessage({ ok: false, error: String(err) })
);
