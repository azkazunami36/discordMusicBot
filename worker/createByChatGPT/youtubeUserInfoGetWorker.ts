import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";
import yts from "yt-search";
import { google, youtube_v3 } from "googleapis";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// --- JSONL キャッシュ: ./cacheJSONs/youtubeUserInfoCache.jsonl ---
const CACHE_DIR = path.join(__dirname, "..", "..", "cacheJSONs");
const CACHE_FILE = path.join(CACHE_DIR, "youtubeUserInfoCache.jsonl");

// --- Alias JSONL キャッシュ: ./cacheJSONs/youtubeUserIdLink.jsonl ---
const ALIAS_FILE = path.join(CACHE_DIR, "youtubeUserIdLink.jsonl");

function ensureAliasFileSync() {
  try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(ALIAS_FILE)) fs.writeFileSync(ALIAS_FILE, ""); } catch {}
}

type AliasRow = { key: string; channelId: string; kind?: "handle" | "user" | "custom" | "url"; resolvedAt?: string };

function readAliasAllSync(): AliasRow[] {
  ensureAliasFileSync();
  try {
    const txt = String(fs.readFileSync(ALIAS_FILE));
    if (!txt) return [];
    const rows: AliasRow[] = [];
    for (const line of txt.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try { rows.push(JSON.parse(s) as AliasRow); } catch {}
    }
    return rows;
  } catch { return []; }
}

function findChannelIdByAliasKeySync(key: string): string | undefined {
  const rows = readAliasAllSync();
  for (let i = rows.length - 1; i >= 0; i--) { // 履歴優先（最後の行を優先）
    if (rows[i].key === key) return rows[i].channelId;
  }
  return undefined;
}

function appendAliasIfMissingSync(key: string, channelId: string, kind?: AliasRow["kind"]) {
  const rows = readAliasAllSync();
  const exists = rows.some(r => r.key === key && r.channelId === channelId);
  if (exists) return;
  try {
    const row: AliasRow = { key, channelId, kind, resolvedAt: new Date().toISOString() };
    fs.appendFileSync(ALIAS_FILE, JSON.stringify(row) + "\n");
  } catch {}
}

// 入力→エイリアスキー正規化
function normalizeAliasKey(input: string): { key?: string; kind?: AliasRow["kind"] } {
  // channelId そのものは対象外
  if (/^UC[0-9A-Za-z_-]+$/.test(input)) return { key: undefined };

  const raw = input.trim();
  // @@handle → @handle にし、小文字化
  if (/^@+/.test(raw)) {
    const key = "@" + raw.replace(/^@+/, "").toLowerCase();
    return { key, kind: "handle" };
  }

  // URL から user/c/handle をキー化
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.hostname.endsWith("youtube.com")) {
      if (parts[0] === "channel" && parts[1]) return { key: undefined }; // 直接UC…は別名不要
      if (parts[0] === "user" && parts[1]) return { key: `user:${parts[1].toLowerCase()}`, kind: "user" };
      if (parts[0] === "c" && parts[1])    return { key: `c:${parts[1].toLowerCase()}`,    kind: "custom" };
      const at = parts.find(p => p.startsWith("@"));
      if (at) return { key: "@" + at.replace(/^@+/, "").toLowerCase(), kind: "handle" };
    }
  } catch { /* not URL */ }
  return { key: undefined };
}

function ensureCacheFileSync() {
  try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, ""); } catch {}
}

function readAllCacheRowsSync(): any[] {
  ensureCacheFileSync();
  try {
    const txt = String(fs.readFileSync(CACHE_FILE));
    if (!txt) return [];
    const rows: any[] = [];
    for (const line of txt.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try { rows.push(JSON.parse(s) as any); } catch {}
    }
    return rows;
  } catch { return []; }
}

function lookupByChannelIdSync(channelId: string): any | undefined {
  const rows = readAllCacheRowsSync();
  return rows.find((r: any) => r?.id === channelId);
}

function appendIfMissingByChannelIdSync(row: any) {
  // 保存直前に必ず再読込し、同一 channelId があれば追記スキップ
  const rows = readAllCacheRowsSync();
  if (rows.some((r: any) => r?.id === (row as any)?.id)) return;
  try { fs.appendFileSync(CACHE_FILE, JSON.stringify(row) + "\n"); } catch {}
}

// ---- 入力の正規化/判定 ----
function normalizeUrlMaybe(input: string): string {
  if (/^(?:www\.)?youtube\.com\//i.test(input) || /^(?:www\.)?youtu\.be\//i.test(input)) {
    return `https://${input}`;
  }
  return input;
}

type ParsedUrlType =
  | { type: "channel" | "user" | "custom" | "handle"; idOrName: string }
  | null;

function parseChannelUrl(urlLike: string): ParsedUrlType {
  try {
    const parsedUrl = new URL(normalizeUrlMaybe(urlLike));
    const parts = parsedUrl.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0] === "channel" && parts[1]) return { type: "channel", idOrName: parts[1] };
    if (parts[0] === "user" && parts[1]) return { type: "user", idOrName: parts[1] };
    if (parts[0] === "c" && parts[1]) return { type: "custom", idOrName: parts[1] };
    const handle = parts.find((p) => p.startsWith("@")) || (parsedUrl.pathname.startsWith("/@") ? parts[0] : undefined);
    if (handle) return { type: "handle", idOrName: handle };
    return null;
  } catch { return null; }
}

async function resolveChannelIdFromPage(input: string): Promise<string | undefined> {
  try {
    let urlStr = input;
    if (!/^(?:https?:)?\/\//i.test(urlStr)) {
      if (urlStr.startsWith("@")) urlStr = `https://www.youtube.com/${urlStr}`;
      else if (/^UC[0-9A-Za-z_-]+$/.test(urlStr)) urlStr = `https://www.youtube.com/channel/${urlStr}`;
      else urlStr = `https://www.youtube.com/${urlStr}`;
    }
    urlStr = urlStr.replace(/^https?:\/\/youtube\.com\//i, "https://www.youtube.com/");
    const res = await fetch(urlStr as any, {
      headers: { "user-agent": "Mozilla/5.0", "accept-language": "ja,en;q=0.8" } as any,
      redirect: "follow" as any,
    } as any);
    if (!res.ok) return undefined;

    const finalUrl = (res as any).url as string | undefined;
    const html = await res.text();
    const m1 = html.match(/\\"channelId\\"\s*:\s*\\"(UC[0-9A-Za-z_-]+)\\"/);
    const m2 = html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[0-9A-Za-z_-]+)/);
    const m3 = html.match(/\\"externalId\\"\s*:\s*\\"(UC[0-9A-Za-z_-]+)\\"/);
    const mFinal = finalUrl ? finalUrl.match(/\/channel\/(UC[0-9A-Za-z_-]+)/) : null;

    if (m2?.[1] && m3?.[1] && m2[1] === m3[1]) return m2[1];
    if (mFinal?.[1]) return mFinal[1];
    if (m1?.[1]) return m1[1];
    if (m2?.[1]) return m2[1];
    if (m3?.[1]) return m3[1];
    return undefined;
  } catch { return undefined; }
}

async function resolveMinimalSnippetFromPageById(id: string): Promise<{ title?: string; thumbnail?: string; customUrl?: string } | undefined> {
  try {
    const url = `https://www.youtube.com/channel/${id}`;
    const res = await fetch(url as any, { headers: { "user-agent": "Mozilla/5.0", "accept-language": "ja,en;q=0.8" } as any } as any);
    if (!res.ok) return undefined;
    const html = await res.text();
    const mTitle =
      html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["'][^>]*>/i) ||
      html.match(/\"title\"\s*:\s*\"([^\"]+)\"/);
    const title = mTitle ? mTitle[1] : undefined;
    const mThumb = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["'][^>]*>/i);
    const thumbnail = mThumb ? mThumb[1] : undefined;
    const mCustom =
      html.match(/<meta\s+property=["']og:url["']\s+content=["']https?:\/\/www\.youtube\.com\/([^"']+)["'][^>]*>/i) ||
      html.match(/<link\s+rel=["']canonical["']\s+href=["']https?:\/\/www\.youtube\.com\/([^"']+)["'][^>]*>/i);
    const customUrl = mCustom ? mCustom[1] : undefined;
    return { title, thumbnail, customUrl };
  } catch { return undefined; }
}

type Payload = { inputs: string[]; start: number };
type SortedOut = { type: "youtubeUserInfo"; body: any }[];

async function fetchChannel(input: string): Promise<any | undefined> {
  ensureCacheFileSync();

  const apiKey = process.env.YOUTUBE_API_KEY;
  const youtube = google.youtube("v3");

  let channelId: string | undefined;

  // --- 0) 別名キャッシュ（handle/url→channelId）を先に確認 ---
  const alias = normalizeAliasKey(input);
  if (alias.key) {
    const idFromAlias = findChannelIdByAliasKeySync(alias.key);
    if (idFromAlias) {
      // キャッシュヒット：直接 channelId 確定
      const cached = lookupByChannelIdSync(idFromAlias);
      if (cached) return cached;
      // メインキャッシュに無ければ後段の API 取得で埋める
      // 後続処理で channelId として使う
      channelId = idFromAlias;
      // 以降の解決分岐をスキップするためにガード用フラグ
      // ↓ この後の既存ロジックの先頭にある channelId 判定に落ちる
    }
  }

  // 入力 → channelId 解決
  if (channelId) {
    // 既に alias で解決済み → 後段へ（API取得/キャッシュ保存）
  } else {
    const parsed = parseChannelUrl(input);

    if (parsed?.type === "channel") channelId = parsed.idOrName;
    else if (/^UC[0-9A-Za-z_-]+$/.test(input)) channelId = input;
    else if (parsed?.type === "handle") channelId = await resolveChannelIdFromPage(parsed.idOrName);
    else if (parsed?.type === "custom" || parsed?.type === "user") {
      channelId = await resolveChannelIdFromPage(parsed.type === "custom" ? `c/${parsed.idOrName}` : `user/${parsed.idOrName}`);
      if (!channelId && apiKey) {
        try {
          const q = parsed.idOrName.replace(/^@/, "");
          const res = await youtube.search.list({ key: apiKey, q, type: ["channel"], part: ["snippet"], maxResults: 1 });
          channelId = res.data.items?.[0]?.snippet?.channelId || undefined;
        } catch {}
      }
      if (!channelId) {
        try {
          const r: any = await yts({ query: parsed.idOrName, hl: "ja", gl: "JP" });
          const ch = r?.channels?.[0];
          if (ch?.channelId) channelId = ch.channelId;
          else {
            const v = r?.videos?.[0];
            if (v?.author?.channelID) channelId = v.author.channelID;
          }
        } catch {}
      }
    } else if (/^@/.test(input) || /^(?:https?:)?\/\//i.test(input)) {
      channelId = await resolveChannelIdFromPage(input);
    } else {
      if (apiKey) {
        try {
          const res = await youtube.search.list({ key: apiKey, q: input, type: ["channel"], part: ["snippet"], maxResults: 1 });
          channelId = res.data.items?.[0]?.snippet?.channelId || undefined;
        } catch {}
      }
      if (!channelId) {
        try {
          const r: any = await yts({ query: input, hl: "ja", gl: "JP" });
          const ch = r?.channels?.[0];
          if (ch?.channelId) channelId = ch.channelId;
          else {
            const v = r?.videos?.[0];
            if (v?.author?.channelID) channelId = v.author.channelID;
          }
        } catch {}
      }
    }
  }

  if (!channelId) return undefined;

  // --- 0.5) 解決に成功したらエイリアスを学習（直前再読込・重複スキップ） ---
  if (alias.key) appendAliasIfMissingSync(alias.key, channelId);

  // キャッシュヒット
  const cached = lookupByChannelIdSync(channelId);
  if (cached) return cached;

  // 取得：API優先 → 失敗ならページ最小情報
  let data: any | undefined;

  if (apiKey) {
    try {
      const res = await youtube.channels.list({
        key: apiKey,
        id: [channelId],
        part: ["snippet", "statistics"],
        hl: "ja",
      });
      if (res.data.items && res.data.items.length > 0) {
        const ch = res.data.items[0];
        if (ch?.id === channelId) data = ch;
      }
    } catch {}
  }

  if (!data) {
    const meta = await resolveMinimalSnippetFromPageById(channelId);
    if (meta) {
      data = {
        kind: "youtube#channel",
        id: channelId,
        snippet: {
          title: meta.title,
          customUrl: meta.customUrl,
          thumbnails: meta.thumbnail
            ? {
                default: { url: meta.thumbnail },
                high: { url: meta.thumbnail },
              }
            : undefined,
        },
      } as any;
    }
  }

  if (!data) return undefined;

  // 保存（直前に再読込→重複スキップ）
  appendIfMissingByChannelIdSync(data);

  return data;
}

async function processSlice(data: Payload): Promise<SortedOut> {
  const { inputs, start } = data;

  const settled = await Promise.allSettled(
    (inputs || []).filter(Boolean).map((raw, idx) =>
      fetchChannel(raw).then((info) => ({ num: start + idx, info }))
    )
  );

  const sorted: SortedOut = settled
    .filter((r): r is PromiseFulfilledResult<{ num: number; info: any | undefined }> =>
      r.status === "fulfilled" && !!r.value?.info
    )
    .map((r) => r.value as { num: number; info: any })
    .sort((a, b) => a.num - b.num)
    .map(({ info }) => ({ type: "youtubeUserInfo", body: info }));

  return sorted;
}

processSlice(workerData as Payload).then(
  (res) => parentPort?.postMessage({ ok: true, data: res }),
  (err) => parentPort?.postMessage({ ok: false, error: String(err) })
);
