import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";

// __dirname（ESM）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** envJSON.ts で使っている形に合わせたローカル定義（import は行わない） */
interface NicoUserInfo {
  id: string;             // numeric user id as string
  url: string;            // https://www.nicovideo.jp/user/<id>
  // 必須（OGでも必ず取得できないとエラー扱い）
  name: string;
  iconUrl: string;
  // ここから nvapi 由来の追加情報（存在しない場合もあるため任意）
  source?: 'nvapi' | 'og';
  nickname?: string;
  description?: string;
  followerCount?: number;
  followingCount?: number;
  mylistCount?: number;
  videoCount?: number;
  createdAt?: string;          // ISO文字列
  userLevel?: number;
  isPremium?: boolean;
  isChannel?: boolean;
  coverImageUrl?: string;
  iconsNormal?: string;
  iconsLarge?: string;
  raw?: any;                   // nvapiの生データ保存用
}

type Payload = { inputs: string[]; start: number };
type SortedOut = { type: "niconicoUserInfo"; body: NicoUserInfo }[];

// --- JSONL キャッシュ: ./cacheJSONs/niconicoUserInfoCache.jsonl ---
const CACHE_DIR = path.join(__dirname, "..", "cacheJSONs");
const CACHE_FILE = path.join(CACHE_DIR, "niconicoUserInfoCache.jsonl");

function ensureCacheFileSync() {
  try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, ""); } catch {}
}

function readAllCacheRowsSync(): NicoUserInfo[] {
  ensureCacheFileSync();
  try {
    const txt = String(fs.readFileSync(CACHE_FILE));
    if (!txt) return [];
    const rows: NicoUserInfo[] = [];
    for (const line of txt.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try { rows.push(JSON.parse(s) as NicoUserInfo); } catch {}
    }
    return rows;
  } catch { return []; }
}

function lookupByUserIdSync(userId: string): NicoUserInfo | undefined {
  const rows = readAllCacheRowsSync();
  return rows.find((r: any) => r?.id === userId);
}

function appendIfMissingByUserIdSync(row: NicoUserInfo) {
  // 保存直前に必ず再読込 → 同一 id があれば追記スキップ
  const rows = readAllCacheRowsSync();
  if (rows.some((r: any) => r?.id === (row as any)?.id)) return;
  try { fs.appendFileSync(CACHE_FILE, JSON.stringify(row) + "\n"); } catch {}
}

// 入力から numeric userId を抽出（URL/ID 両対応）
function extractNicoUserId(input: string): string | undefined {
  // 素の数字
  if (/^\d+$/.test(input)) return input;
  // URL から /user/<id>
  try {
    const u = new URL(input);
    const m = u.pathname.match(/\/user\/(\d+)/);
    if (m) return m[1];
  } catch { /* not an URL */ }
  return undefined;
}

async function fetchNicoUser(input: string): Promise<NicoUserInfo | undefined> {
  ensureCacheFileSync();

  const userId = extractNicoUserId(input);
  if (!userId) return undefined;

  // キャッシュヒット
  const cached = lookupByUserIdSync(userId);
  if (cached) return cached;

  const userUrl = `https://www.nicovideo.jp/user/${userId}`;

  // 1) nvapi を試す（十分なフィールドが揃えばそれを採用）
  try {
    const nv = await fetch(`https://nvapi.nicovideo.jp/v1/users/${userId}/profile`, {
      headers: {
        'X-Frontend-Id': '70',
        'X-Frontend-Version': '0',
        'User-Agent': 'Mozilla/5.0'
      } as any
    } as any);
    if (nv.ok) {
      const j = await nv.json();
      const u = j?.data?.user ?? j?.data;
      const p = j?.data?.profile ?? j?.data;
      const icons = u?.icons ?? j?.data?.icons;
      const nameNv = u?.nickname ?? p?.nickname ?? p?.name;
      const iconNv = icons?.large ?? icons?.normal ?? p?.iconUrl;

      if (nameNv && iconNv) {
        const info: NicoUserInfo = {
          id: userId,
          url: userUrl,
          name: String(nameNv),
          iconUrl: String(iconNv),
          source: 'nvapi',
          nickname: u?.nickname ?? p?.nickname,
          description: p?.description ?? p?.bio ?? p?.introduction,
          followerCount: u?.followerCount ?? p?.followerCount ?? j?.data?.followerCount,
          followingCount: u?.followingCount ?? p?.followingCount ?? j?.data?.followingCount,
          mylistCount: u?.mylistCount ?? p?.mylistCount,
          videoCount: u?.videoCount ?? p?.videoCount,
          createdAt: u?.createdAt ?? p?.createdAt,
          userLevel: u?.userLevel ?? p?.userLevel,
          isPremium: u?.isPremium ?? p?.isPremium,
          isChannel: u?.isChannel ?? p?.isChannel,
          coverImageUrl: p?.coverImageUrl ?? p?.headerImageUrl,
          iconsNormal: icons?.normal,
          iconsLarge: icons?.large,
          raw: j
        };
        appendIfMissingByUserIdSync(info);
        return info;
      }
    }
  } catch { /* nvapi 失敗は致命ではない */ }

  // 2) OGメタで最小情報を構築
  try {
    const res = await fetch(userUrl as any);
    if (!res.ok) return undefined;
    const html = await res.text();

    // name
    let name: string | undefined;
    const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']\s*\/?>/i);
    if (ogTitleMatch) name = ogTitleMatch[1];
    else {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) name = titleMatch[1];
    }
    if (name) name = name.replace(/さんのユーザーページ$/, "").trim();

    // icon
    let iconUrl: string | undefined;
    const ogImageMatch = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']\s*\/?>/i);
    if (ogImageMatch) iconUrl = ogImageMatch[1];

    if (!name || !iconUrl) return undefined;

    const info: NicoUserInfo = {
      id: userId,
      url: userUrl,
      name: String(name),
      iconUrl: String(iconUrl),
      source: 'og'
    };
    appendIfMissingByUserIdSync(info);
    return info;
  } catch {
    return undefined;
  }
}

async function processSlice(data: Payload): Promise<SortedOut> {
  const { inputs, start } = data;

  const settled = await Promise.allSettled(
    (inputs || [])
      .filter(Boolean)
      .map((raw, idx) => fetchNicoUser(raw).then((info) => ({ num: start + idx, info })))
  );

  const sorted: SortedOut = settled
    .filter((r): r is PromiseFulfilledResult<{ num: number; info: NicoUserInfo | undefined }> =>
      r.status === "fulfilled" && !!r.value?.info
    )
    .map((r) => r.value as { num: number; info: NicoUserInfo })
    .sort((a, b) => a.num - b.num)
    .map(({ info }) => ({ type: "niconicoUserInfo", body: info }));

  return sorted;
}

// 起動即実行して結果を返す
processSlice(workerData as Payload).then(
  (res) => parentPort?.postMessage({ ok: true, data: res }),
  (err) => parentPort?.postMessage({ ok: false, error: String(err) })
);
