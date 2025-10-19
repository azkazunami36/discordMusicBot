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
  | { kind: "artist"; mbid: string }
  | { kind: "release"; mbid: string }
  | { kind: "recording"; mbid: string };

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };

// ========== Consts ==========
const CACHE_DIR = path.join(__dirname, "..", "..", "cacheJSONs");
const FILES = {
  artist: path.join(CACHE_DIR, "musicBrainzInfoArtist.jsonl"),
  release: path.join(CACHE_DIR, "musicBrainzInfoRelease.jsonl"),
  recording: path.join(CACHE_DIR, "musicBrainzInfoRecording.jsonl"),
};

// TTL 6 months (ms)
const CACHE_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000;

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
  const res = await fetch(urlStr, {
    headers: {
      "User-Agent": "KazunamiDiscordBot/1.0 (+https://example.com/contact)",
      "Accept": "application/json",
    } as any,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${urlStr}\n${text}`);
  }
  return (await res.json()) as T;
}

// ========== main resolver ==========
async function resolveMB(kind: Kind, mbid: string): Promise<any> {
  // 1) fresh cache
  const cached = lookupFreshSync<any>(kind, mbid);
  if (cached) return cached;

  // 2) fetch
  let urlStr = "";
  if (kind === "artist") urlStr = `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json`;
  else if (kind === "release") urlStr = `https://musicbrainz.org/ws/2/release/${mbid}?fmt=json&inc=artist-credits`;
  else urlStr = `https://musicbrainz.org/ws/2/recording/${mbid}?fmt=json&inc=releases`;

  const data = await fetchJSON<any>(urlStr);

  // 3) override merge
  const albumInfo = loadAlbumInfo();
  const overrideMap =
    kind === "artist" ? albumInfo.artist :
    kind === "release" ? albumInfo.release :
    albumInfo.recording;
  const merged = overrideMap && overrideMap[mbid] ? deepMerge<any>(data, overrideMap[mbid] as any) : data;

  // 4) append-if-missing
  appendIfMissingByMbidSync(kind, mbid, merged);

  return merged;
}

// ========== worker entry ==========
(async () => {
  try {
    const payload = workerData as Payload;
    if (!payload || !payload.kind || !payload.mbid) throw new Error("invalid payload");
    ensureCacheFileSync(payload.kind);
    const data = await resolveMB(payload.kind, payload.mbid);
    const out: Ok<any> = { ok: true, data };
    parentPort?.postMessage(out);
  } catch (e) {
    const err: Err = { ok: false, error: String(e) };
    parentPort?.postMessage(err);
  }
})();
