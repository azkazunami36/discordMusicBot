import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";
import * as youtubei from "youtubei.js";
import { getCookiesPromised } from "chrome-cookies-secure";

type Payload = { inputs: string[]; start: number };
type ThumbRow = { videoId: string; thumbnailUrl: string };
type SortedOut = { type: "youtubeThumbnail"; body: ThumbRow }[];

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// --- JSONL キャッシュ: ./cacheJSONs/youtubeThumbnailLinkCache.jsonl ---
const CACHE_DIR = path.join(__dirname, "..", "cacheJSONs");
const CACHE_FILE = path.join(CACHE_DIR, "youtubeThumbnailLinkCache.jsonl");

function ensureCacheFileSync() {
  try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, ""); } catch {}
}

function readAllCacheRowsSync(): ThumbRow[] {
  ensureCacheFileSync();
  try {
    const txt = String(fs.readFileSync(CACHE_FILE));
    if (!txt) return [];
    const rows: ThumbRow[] = [];
    for (const line of txt.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try { rows.push(JSON.parse(s) as ThumbRow); } catch {}
    }
    return rows;
  } catch { return []; }
}

function lookupByVideoIdSync(videoId: string): ThumbRow | undefined {
  const rows = readAllCacheRowsSync();
  return rows.find((r) => r?.videoId === videoId);
}

function appendIfMissingByVideoIdSync(row: ThumbRow) {
  // 保存直前に再読込 → 同一 videoId があれば追記スキップ
  const rows = readAllCacheRowsSync();
  if (rows.some((r) => r?.videoId === row.videoId)) return;
  try { fs.appendFileSync(CACHE_FILE, JSON.stringify(row) + "\n"); } catch {}
}

// 入力から YouTube の videoId を抽出（URL/ID 両対応）
function extractYouTubeId(input: string): string | undefined {
  // すでに ID の可能性（緩め：6文字以上のBase64URL風）
  if (/^[A-Za-z0-9_-]{10,}$/.test(input)) return input;
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    const host = u.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : undefined;
    }
    if (host.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{6,}$/.test(v)) return v;
      // /shorts/<id>, /embed/<id>, /v/<id>, /live/<id> 等
      const parts = u.pathname.split("/").filter(Boolean);
      const cand = parts.length >= 2 ? parts[1] : parts[0];
      if (cand && /^[A-Za-z0-9_-]{6,}$/.test(cand)) return cand;
    }
  } catch { /* not a URL */ }
  return undefined;
}

// Chrome Cookie → header 生成（任意・取得できなければ空文字）
async function buildCookieHeader(): Promise<string> {
  try {
    const profile =
      process.env.CHROME_USER_PROFILE_PATH?.trim() ||
      (process.platform === "darwin"
        ? `${process.env.HOME}/Library/Application Support/Google/Chrome/Default`
        : process.platform === "win32"
          ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data\\Default`
          : `${process.env.HOME}/.config/google-chrome/Default`);

    const obj = await getCookiesPromised("https://www.youtube.com", "object", profile);
    const objMusic = await getCookiesPromised("https://music.youtube.com", "object", profile);
    const merged: Record<string, string> = { ...obj, ...objMusic };
    const header = Object.entries(merged)
      .filter(([k, v]) => k && typeof v === "string" && v.length > 0)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    return header || "";
  } catch { return ""; }
}

// 任意オブジェクトから thumbnail URL 群を根こそぎ回収
function collectThumbnailsDeep(root: any): { url: string; w?: number; h?: number }[] {
  const out: { url: string; w?: number; h?: number }[] = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    // { thumbnails: [{url,width,height}, ...] }
    if (Array.isArray((cur as any).thumbnails)) {
      for (const t of (cur as any).thumbnails) {
        if (t?.url) out.push({ url: t.url, w: t.width, h: t.height });
      }
    }
    // { thumbnail: { thumbnails: [...] } }
    if ((cur as any).thumbnail?.thumbnails) {
      for (const t of (cur as any).thumbnail.thumbnails) {
        if (t?.url) out.push({ url: t.url, w: t.width, h: t.height });
      }
    }
    // 直置き { url, width, height }
    if ((cur as any).url && typeof (cur as any).url === "string") {
      out.push({ url: (cur as any).url, w: (cur as any).width, h: (cur as any).height });
    }

    for (const k of Object.keys(cur)) {
      const v = (cur as any)[k];
      if (v && typeof v === "object") stack.push(v);
      if (Array.isArray(v)) for (const it of v) if (it && typeof it === "object") stack.push(it);
    }
  }
  // 重複URL排除
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.url) ? false : (seen.add(t.url), true)));
}

async function fetchThumbnail(input: string): Promise<ThumbRow | undefined> {
  ensureCacheFileSync();

  const videoId = extractYouTubeId(input) ?? input;
  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return undefined;

  // キャッシュヒット
  const cached = lookupByVideoIdSync(videoId);
  if (cached) return cached;

  // 1) youtubei.js で最大解像度を取得（Cookie が取れれば使用）
  try {
    const cookie = await buildCookieHeader().catch(() => "");
    const yt = await youtubei.Innertube.create(cookie ? { cookie } : {});
    // 環境により安定させたい場合の調整（任意）
    const accountIndex = Number(process.env.GOOGLE_ACCOUNT_INDEX ?? "0") || 0;
    if ((yt as any).session?.context) {
      (yt as any).session.context = {
        ...(yt as any).session.context,
        client: { ...(yt as any).session.context?.client, hl: "ja", gl: "JP" },
        headers: {
          ...(yt as any).session.context?.headers,
          "X-Goog-AuthUser": String(accountIndex),
        },
      };
    }

    const info: any = await (yt as any).getInfo(videoId);
    const thumbs = [
      ...collectThumbnailsDeep(info?.basic_info),
      ...collectThumbnailsDeep(info?.video_details),
      ...collectThumbnailsDeep(info?.microformat),
      ...collectThumbnailsDeep(info),
    ];

    if (thumbs.length) {
      thumbs.sort((a, b) => ((b.w || 0) * (b.h || 0)) - ((a.w || 0) * (a.h || 0)));
      const best = thumbs[0].url;
      const row: ThumbRow = { videoId, thumbnailUrl: best };
      appendIfMissingByVideoIdSync(row); // 保存直前再読込→重複回避
      return row;
    }
  } catch {
    // youtubei 失敗 → フォールバックへ
  }

  // 2) フォールバック：i.ytimg.com の既知パス（存在チェックはしない）
  const candidates = [
    // webp
    `https://i.ytimg.com/vi_webp/${videoId}/maxresdefault.webp`,
    `https://i.ytimg.com/vi_webp/${videoId}/sddefault.webp`,
    `https://i.ytimg.com/vi_webp/${videoId}/hqdefault.webp`,
    `https://i.ytimg.com/vi_webp/${videoId}/mqdefault.webp`,
    // jpg
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/default.jpg`,
    // frame0
    `https://i.ytimg.com/vi/${videoId}/0.jpg`,
  ];

  const row: ThumbRow = { videoId, thumbnailUrl: candidates[0] };
  appendIfMissingByVideoIdSync(row); // 保存直前再読込→重複回避
  return row;
}

async function processSlice(data: Payload): Promise<SortedOut> {
  const { inputs, start } = data;

  const settled = await Promise.allSettled(
    (inputs || []).filter(Boolean).map((raw, idx) =>
      fetchThumbnail(raw).then((info) => ({ num: start + idx, info }))
    )
  );

  const sorted: SortedOut = settled
    .filter((r): r is PromiseFulfilledResult<{ num: number; info: ThumbRow | undefined }> =>
      r.status === "fulfilled" && !!r.value?.info
    )
    .map((r) => r.value as { num: number; info: ThumbRow })
    .sort((a, b) => a.num - b.num)
    .map(({ info }) => ({ type: "youtubeThumbnail", body: info }));

  return sorted;
}

// 起動即実行して結果を返す
processSlice(workerData as Payload).then(
  (res) => parentPort?.postMessage({ ok: true, data: res }),
  (err) => parentPort?.postMessage({ ok: false, error: String(err) })
);
