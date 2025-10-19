import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// ========== Types (最小限) ==========
export interface MusicBrainzRelease {
  id: string;
  title: string;
  country?: string;
  date?: string;
  ["release-events"]?: any[];
  ["cover-art-archive"]?: any;
  barcode?: string | null;
  status?: string;
  ["status-id"]?: string;
  packaging?: string | null;
  ["packaging-id"]?: string | null;
  quality?: string;
  ["text-representation"]?: any;
  disambiguation?: string;
  asin?: string | null;
  ["artist-credit"]?: any[];
}

export interface MusicBrainzRecording {
  id: string;
  title: string;
  length?: number;
  ["first-release-date"]?: string;
  video?: boolean;
  disambiguation?: string;
  releases?: any[];
}

export interface MusicBrainzArtist {
  id: string;
  name: string;
  ["sort-name"]: string;
  type?: string;
  ["type-id"]?: string;
  gender?: string;
  ["gender-id"]?: string;
  country?: string;
  disambiguation?: string;
  isnis?: string[];
  ["begin-area"]?: any;
  area?: any;
  ["life-span"]?: any;
  ipis?: string[];
  ["end-area"]?: any;
}

type Kind = "artist" | "release" | "recording";

type Payload =
  | { kind: "artist"; mbid: string; lastNetAt?: number }
  | { kind: "release"; mbid: string; lastNetAt?: number }
  | { kind: "recording"; mbid: string; lastNetAt?: number };

// ========== Consts ==========
const CACHE_DIR = path.join(__dirname, "..", "..", "cacheJSONs");
const FILES = {
  artist: path.join(CACHE_DIR, "musicBrainzInfoArtist.jsonl"),
  release: path.join(CACHE_DIR, "musicBrainzInfoRelease.jsonl"),
  recording: path.join(CACHE_DIR, "musicBrainzInfoRecording.jsonl"),
};

// TTL 6 months (ms)
const CACHE_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ========== JSONL utilities ==========
function ensureCacheFileSync(kind: Kind) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {}
  try {
    const fp = FILES[kind];
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, "");
  } catch {}
}

function readAllRowsSync(kind: Kind): { mbid: string; fetchedAt: number; data: any }[] {
  ensureCacheFileSync(kind);
  try {
    const txt = String(fs.readFileSync(FILES[kind]));
    if (!txt) return [];
    const rows: { mbid: string; fetchedAt: number; data: any }[] = [];
    for (const line of txt.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try {
        const o = JSON.parse(s);
        if (o && typeof o === "object" && typeof o.mbid === "string") rows.push(o);
      } catch {
        // skip broken line
      }
    }
    return rows;
  } catch {
    return [];
  }
}

function lookupFreshSync<T = any>(kind: Kind, mbid: string): T | undefined {
  const rows = readAllRowsSync(kind);
  // 末尾の方が新しい前提で逆順検索しても良いが、ここでは単純に最新を選び直す
  let newest: { fetchedAt: number; data: T } | undefined;
  for (const r of rows) {
    if (r.mbid !== mbid) continue;
    if (!newest || r.fetchedAt > newest.fetchedAt) newest = { fetchedAt: r.fetchedAt, data: r.data };
  }
  if (newest && Date.now() - newest.fetchedAt < CACHE_TTL_MS) return newest.data;
  return undefined;
}

function appendIfMissingByMbidSync(kind: Kind, mbid: string, data: any) {
  // 保存直前に必ず再読込（別処理との整合性担保）
  const rows = readAllRowsSync(kind);
  const exists = rows.some((r) => r.mbid === mbid);
  if (exists) return; // 同一mbidが既にあるなら保存スキップ（要件準拠）
  try {
    fs.appendFileSync(FILES[kind], JSON.stringify({ mbid, fetchedAt: Date.now(), data }) + "\n");
  } catch {}
}

// ========== albumInfo.json / deep merge ==========
function loadAlbumInfo(): {
  release?: Record<string, Partial<MusicBrainzRelease>>;
  artist?: Record<string, Partial<MusicBrainzArtist>>;
  recording?: Record<string, Partial<MusicBrainzRecording>>;
} {
  try {
    const raw = String(fs.readFileSync("albumInfo.json"));
    const json = JSON.parse(raw);
    return json || {};
  } catch {
    return {};
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && Object.prototype.toString.call(v) === "[object Object]";
}

function deepMerge<T>(base: T, override?: Partial<T>): T {
  if (!override) return base;
  if (Array.isArray(base)) {
    return (Array.isArray(override) ? (override as unknown as T) : base) as T;
  }
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...(base as any) };
    for (const [k, v] of Object.entries(override)) {
      const cur = out[k];
      if (Array.isArray(v)) out[k] = v;
      else if (isPlainObject(v) && isPlainObject(cur)) out[k] = deepMerge(cur, v as any);
      else if (v !== undefined) out[k] = v;
    }
    return out as T;
  }
  return (override as unknown) !== undefined ? (override as T) : base;
}

// ========== fetch ==========
async function fetchJSON<T>(urlStr: string): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = 15000; // 15s timeout
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // up to 3 total tries on transient network errors
  const transientCodes = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ECONNREFUSED",
  ]);

  let lastErr: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(urlStr, {
        headers: {
          // MusicBrainz requires a descriptive UA with contact URL/email
          "User-Agent": "KazunamiDiscordBot/1.0 (https://github.com/azkazunami36/discordMusicBot; contact: azkazunami36)",
          "Accept": "application/json",
        } as any,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const detail = {
          status: res.status,
          statusText: res.statusText,
          url: urlStr,
          bodySnippet: text?.slice(0, 300),
        };
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${urlStr} body=${JSON.stringify(detail.bodySnippet)}`);
      }
      clearTimeout(timer);
      return (await res.json()) as T;
    } catch (e: any) {
      lastErr = e;
      // If aborted, wrap as timeout for clarity
      const code = e?.code || e?.cause?.code;
      const isAbort = e?.name === "AbortError";
      const transient = isAbort || transientCodes.has(code);
      if (attempt < 3 && transient) {
        // simple exponential backoff: 500ms, 1000ms
        const wait = 500 * attempt;
        await sleep(wait);
        continue;
      }
      break;
    }
  }

  // Re-throw with rich context
  const err = lastErr || new Error("Unknown fetch error");
  const info = {
    message: String(err?.message || err),
    name: err?.name,
    code: err?.code || err?.cause?.code,
    errno: err?.errno || err?.cause?.errno,
    syscall: err?.syscall || err?.cause?.syscall,
    hostname: err?.hostname || err?.cause?.hostname,
    url: urlStr,
    stack: typeof err?.stack === "string" ? err.stack.split("\n").slice(0, 5).join("\n") : undefined,
    timeoutMs,
  };
  throw new Error(`fetch failed: ${JSON.stringify(info)}`);
}

// ========== main resolver ==========
async function resolveMB(kind: Kind, mbid: string, lastNetAt?: number): Promise<{ data: any; netAt?: number }> {
  console.log(`[MusicBrainzWorker] resolving ${kind} ${mbid}`);
  // 1) fresh cache
  const cached = lookupFreshSync<any>(kind, mbid);
  if (cached) {
    console.log(`[MusicBrainzWorker] cache hit ${kind} ${mbid}`);
    return { data: cached, netAt: undefined };
  }

  // 2) (rate limit) wait only if network access will occur and lastNetAt provided
  if (typeof lastNetAt === "number" && Number.isFinite(lastNetAt)) {
    const elapsed = Date.now() - lastNetAt;
    const remain = 1000 - elapsed;
    if (remain > 0) await sleep(remain);
  }

  // 3) fetch
  let urlStr = "";
  if (kind === "artist") urlStr = `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json`;
  else if (kind === "release") urlStr = `https://musicbrainz.org/ws/2/release/${mbid}?fmt=json&inc=artist-credits`;
  else urlStr = `https://musicbrainz.org/ws/2/recording/${mbid}?fmt=json&inc=releases`;

  console.log(`[MusicBrainzWorker] fetching ${urlStr}`);

  const netAt = Date.now();
  const dataRaw = await fetchJSON<any>(urlStr);

  // 4) override merge
  const albumInfo = loadAlbumInfo();
  const overrideMap =
    kind === "artist" ? albumInfo.artist :
    kind === "release" ? albumInfo.release :
    albumInfo.recording;
  const merged = overrideMap && overrideMap[mbid] ? deepMerge<any>(dataRaw, overrideMap[mbid] as any) : dataRaw;

  console.log(`[MusicBrainzWorker] fetched ${kind} ${mbid} ok`);

  // 5) append-if-missing
  appendIfMissingByMbidSync(kind, mbid, merged);

  return { data: merged, netAt };
}

// ========== worker entry ==========
(async () => {
  try {
    const payload = workerData as Payload;
    if (!payload || !payload.kind || !payload.mbid) throw new Error("invalid payload");
    ensureCacheFileSync(payload.kind);
    const { data, netAt } = await resolveMB(payload.kind, payload.mbid, (payload as any).lastNetAt);
    parentPort?.postMessage({ ok: true, data, netAt });
  } catch (e: any) {
    const payload = (workerData as any) || {};
    console.error(`[MusicBrainzWorker] Error for ${payload?.kind ?? '?'} ${payload?.mbid ?? '?'}:`, e);
    const errInfo = {
      message: String(e?.message || e),
      name: e?.name,
      code: e?.code || e?.cause?.code,
      errno: e?.errno || e?.cause?.errno,
      syscall: e?.syscall || e?.cause?.syscall,
      hostname: e?.hostname || e?.cause?.hostname,
      kind: payload?.kind,
      mbid: payload?.mbid,
      stack: typeof e?.stack === "string" ? e.stack.split("\n").slice(0, 6).join("\n") : undefined,
    };
    parentPort?.postMessage({ ok: false, error: JSON.stringify(errInfo) });
  }
})();
