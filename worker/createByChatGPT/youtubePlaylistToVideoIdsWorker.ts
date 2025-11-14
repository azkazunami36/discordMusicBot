/******************************************************************
 * youtubePlaylistToVideoIdsWorker.ts
 *  - Chrome & Firefox cookie auto-detection (root 含む)
 *  - Playlist → videoIds extraction（getPlaylist 優先）
 *  - RD(Mix) 対応
 *  - 親スレッドへの log 転送
 ******************************************************************/

import * as youtubei from "youtubei.js";
import { getCookiesPromised } from "chrome-cookies-secure";
import { promises as fs } from "fs";
import fss from "fs";
import path from "path";
import { execFile } from "child_process";
import { parentPort, workerData } from "worker_threads";

/* ======================================================
   Worker → 親への log 接続
====================================================== */
const send = (type: "warn" | "error" | "info", msg: string) => {
  parentPort?.postMessage({ log: { type, msg } });
};

console.warn = (...args) => send("warn", args.join(" "));
console.error = (...args) => send("error", args.join(" "));
console.log = (...args) => send("info", args.join(" "));

/* ======================================================
   Firefox Cookie スキャン（root 全対応）
====================================================== */

async function scanFirefoxProfilesRoot(): Promise<string[]> {
  const base = "/root/.mozilla/firefox";
  if (!fss.existsSync(base)) {
    console.warn(`[Cookie] Firefox root base not found: ${base}`);
    return [];
  }

  const dirs = fss
    .readdirSync(base)
    .filter((d) => {
      const full = path.join(base, d);
      return fss.existsSync(full) && fss.statSync(full).isDirectory();
    });

  const usable = dirs
    .map((d) => path.join(base, d))
    .filter((dir) => fss.existsSync(path.join(dir, "cookies.sqlite")));

  if (!usable.length) {
    console.warn(`[Cookie] No Firefox profile with cookies.sqlite found under ${base}`);
  }

  return usable;
}

function execAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function loadFirefoxCookiesRoot(): Promise<Record<string, string> | null> {
  const profiles = await scanFirefoxProfilesRoot();
  if (!profiles.length) return null;

  let result: Record<string, string> = {};

  for (const dir of profiles) {
    try {
      const src = path.join(dir, "cookies.sqlite");
      const tmp = `/tmp/firefox_${path.basename(dir)}.sqlite`;

      await fs.copyFile(src, tmp);

      const query = `
        SELECT name, value
        FROM moz_cookies
        WHERE host LIKE '%youtube.com%'
           OR host LIKE '%google.com%'
           OR host LIKE '%youtube-nocookie.com%';
      `;

      const raw = await execAsync("sqlite3", [tmp, query]);
      const lines = raw.trim().split("\n");

      const cookies: Record<string, string> = {};
      for (const line of lines) {
        if (!line) continue;
        const [n, v] = line.split("|");
        if (n && v) cookies[n] = v;
      }

      if (Object.keys(cookies).length > 0) {
        console.log(`[Cookie] Firefox OK → ${dir} (cookies: ${Object.keys(cookies).length})`);
        result = { ...result, ...cookies };
      }
    } catch (e) {
      console.warn(`[Cookie] Firefox read failed (${dir}): ${e}`);
    }
  }

  if (!Object.keys(result).length) return null;
  return result;
}

/* ======================================================
   Chrome Cookie スキャン（存在チェック）
====================================================== */

function resolveChromeProfileCandidates(): string[] {
  const home = process.env.HOME ?? "/root";

  const macBase = `${home}/Library/Application Support/Google/Chrome`;
  const linuxBase = `${home}/.config/google-chrome`;
  const winBase = process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`
    : null;

  const candidates = [
    macBase && path.join(macBase, "Default"),
    macBase && path.join(macBase, "Profile 1"),
    linuxBase && path.join(linuxBase, "Default"),
    linuxBase && path.join(linuxBase, "Profile 1"),
    winBase && path.join(winBase, "Default"),
    winBase && path.join(winBase, "Profile 1"),
  ].filter((x): x is string => Boolean(x));

  return candidates;
}

function detectChromeProfile(): string | null {
  const list = resolveChromeProfileCandidates();
  for (const p of list) {
    const cookiePath = path.join(p, "Cookies");
    if (fss.existsSync(cookiePath)) {
      console.log(`[Cookie] Chrome OK → ${p}`);
      return p;
    }
  }
  console.warn("[Cookie] Chrome cookies not found in any candidate profile.");
  return null;
}

/* ======================================================
   URL parsing
====================================================== */

function extractPlaylistId(input: string): string | undefined {
  try {
    const u = new URL(input);
    const list = u.searchParams.get("list")?.trim();
    if (!list) return undefined;
    if (!/^[A-Za-z0-9_-]+$/.test(list)) return undefined;
    return list;
  } catch {
    return undefined;
  }
}

function extractSeedVideoId(input: string): string | undefined {
  try {
    const u = new URL(input);
    const v = u.searchParams.get("v")?.trim();
    if (v && /^[A-Za-z0-9_-]{6,}$/.test(v)) return v;

    if (u.hostname === "youtu.be" && u.pathname.length > 1) {
      const id = u.pathname.slice(1);
      if (/^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
    }
    if (u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
    }
    if (u.pathname.startsWith("/embed/")) {
      const id = u.pathname.split("/")[2];
      if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/* ======================================================
   buildCookieHeader（Firefox + Chrome マージ）
====================================================== */

async function buildCookieHeader(): Promise<string> {
  // Chrome (あれば使う)
  const chromePath = detectChromeProfile();
  const ytObjChrome =
    chromePath
      ? await getCookiesPromised(
          "https://www.youtube.com",
          "object",
          chromePath
        ).catch(() => ({}))
      : {};
  const ytmObjChrome =
    chromePath
      ? await getCookiesPromised(
          "https://music.youtube.com",
          "object",
          chromePath
        ).catch(() => ({}))
      : {};

  // Firefox (root)
  const ffObj = await loadFirefoxCookiesRoot().catch(() => null);

  const merged: Record<string, string> = {
    ...ytObjChrome,
    ...ytmObjChrome,
    ...(ffObj ?? {}),
  };

  if (!Object.keys(merged).length) {
    console.warn("[Cookie] No cookies found at all.");
    throw new Error("No cookies found");
  }

  return Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/* ======================================================
   Playlist 解析本体
====================================================== */

type Payload = { url: string };
type OutData = { playlistId: string; videoIds: string[] } | undefined;

async function fetchPlaylistVideoIdsFromUrl(url: string): Promise<OutData> {
  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    console.warn(`[Worker] No playlistId in URL: ${url}`);
    return undefined;
  }

  console.log(`[Worker] Start playlist scan: ${playlistId}`);

  const cookieHeader = await buildCookieHeader();
  const yt = await youtubei.Innertube.create({ cookie: cookieHeader });

  // アカウント選択：元コード互換で GOOGLE_ACCOUNT_INDEX を使用
  const accountIndex = Number(process.env.GOOGLE_ACCOUNT_INDEX ?? "0") || 0;
  if ((yt as any).session?.context) {
    (yt as any).session.context = {
      ...(yt as any).session.context,
      client: { ...(yt as any).session.context.client, hl: "ja", gl: "JP" },
    };
    (yt as any).session.context.headers = {
      ...(yt as any).session.context.headers,
      "X-Goog-AuthUser": `${accountIndex}`,
    };
  }

  /* ---------------------------------------------
     RD(Mix) 用 next API
  --------------------------------------------- */
  const tryMixViaNext = async (): Promise<string[]> => {
    const seed = extractSeedVideoId(url);
    if (!seed) {
      console.warn("[Worker] RD playlist but no seed video found.");
      return [];
    }

    try {
      const resp: any = await (yt as any).actions.execute("next", {
        videoId: seed,
        playlistId,
        params: "wAEB",
      });
      const data = resp?.data ?? resp;

      let contents =
        data?.contents?.twoColumnWatchNextResults?.playlist?.playlistPanelRenderer
          ?.contents ??
        data?.contents?.singleColumnWatchNextResults?.playlist
          ?.playlistPanelRenderer?.contents ??
        data?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents;

      if (!Array.isArray(contents)) contents = [];

      const ids = contents
        .map(
          (c: any) =>
            c?.playlistPanelVideoRenderer?.videoId ??
            c?.playlistPanelVideoRenderer?.navigationEndpoint?.watchEndpoint
              ?.videoId ??
            c?.playlistPanelVideoWrapperRenderer?.primaryRenderer
              ?.playlistPanelVideoRenderer?.videoId ??
            null
        )
        .filter((x: any): x is string => typeof x === "string");

      const unique = [...new Set(ids as string[])];
      console.log(`[Worker] RD Mix via next: ${unique.length} ids`);
      return unique;
    } catch (e) {
      console.warn(`[Worker] RD Mix via next failed: ${e}`);
      return [];
    }
  };

  /* ---------------------------------------------
     getPlaylist ベースの全件取得
  --------------------------------------------- */

  const collectVideoIdsFromPlaylistObject = async (pl: any): Promise<string[]> => {
    const ids = new Set<string>();

    const pushList = (arr: any) => {
      if (!arr) return;
      for (const v of arr as any[]) {
        const vid =
          v?.id ??
          v?.video_id ??
          v?.videoId ??
          v?.shortId ??
          v?.compactVideoRenderer?.videoId ??
          v?.videoRenderer?.videoId ??
          null;
        if (typeof vid === "string") ids.add(vid);
      }
    };

    // 最初のページ
    pushList(pl?.videos ?? pl?.items ?? pl?.contents ?? pl?.videoItems);

    // youtubei の Playlist オブジェクトは getContinuation() を持つことがある
    let cur = pl;
    let steps = 0;
    while (typeof cur?.getContinuation === "function" && steps < 100) {
      steps++;
      try {
        cur = await cur.getContinuation();
        pushList(cur?.videos ?? cur?.items ?? cur?.contents ?? cur?.videoItems);
      } catch (e) {
        console.warn(`[Worker] getContinuation() failed: ${e}`);
        break;
      }
    }

    const out = [...ids];
    console.log(
      `[Worker] collectVideoIdsFromPlaylistObject: collected=${out.length}, steps=${steps}`
    );
    return out;
  };

  const tryGetAllViaGetPlaylist = async (): Promise<string[]> => {
    const seen = new Set<string>();
    const result: string[] = [];

    const tryOne = async (input: string, label: string) => {
      try {
        const pl: any = await (yt as any).getPlaylist(input);
        if (!pl) {
          console.warn(`[Worker] getPlaylist(${label}) returned empty`);
          return;
        }
        const ids = await collectVideoIdsFromPlaylistObject(pl);
        for (const id of ids) {
          if (!seen.has(id)) {
            seen.add(id);
            result.push(id);
          }
        }
        console.log(
          `[Worker] getPlaylist(${label}) collected ${ids.length}, merged total ${result.length}`
        );
      } catch (e) {
        console.warn(`[Worker] getPlaylist(${label}) failed: ${e}`);
      }
    };

    // URL 優先 → playlistId
    await tryOne(url, "url");
    await tryOne(playlistId, "id");

    return result;
  };

  /* ---------------------------------------------
     browse(VL...) + continuation ベース
  --------------------------------------------- */

  const extractIdsFromPlaylistRenderer = (root: any): string[] => {
    const ids = new Set<string>();
    if (!root) return [];
    const stack = [root];

    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== "object") continue;

      const vid =
        cur?.videoId ??
        cur?.playlistVideoRenderer?.videoId ??
        cur?.playlistPanelVideoRenderer?.videoId ??
        cur?.compactVideoRenderer?.videoId ??
        cur?.videoRenderer?.videoId ??
        cur?.navigationEndpoint?.watchEndpoint?.videoId ??
        null;

      if (typeof vid === "string") ids.add(vid);

      for (const k of Object.keys(cur)) {
        const v = (cur as any)[k];
        if (v && typeof v === "object") stack.push(v);
        if (Array.isArray(v)) for (const it of v) stack.push(it);
      }
    }

    return [...ids];
  };

  const extractContinuationTokens = (root: any): string[] => {
    const tokens = new Set<string>();
    if (!root) return [];
    const stack = [root];

    const push = (t?: any) => {
      if (typeof t === "string" && t) tokens.add(t);
    };

    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== "object") continue;

      push(
        cur?.continuationItemRenderer?.continuationEndpoint?.continuationCommand
          ?.token
      );
      push(cur?.nextContinuationData?.continuation);
      push(cur?.reloadContinuationData?.continuation);
      push(cur?.continuationCommand?.token);

      for (const k of Object.keys(cur)) {
        const v = (cur as any)[k];
        if (k === "continuation" && typeof v === "string") push(v);
        if (v && typeof v === "object") stack.push(v);
        if (Array.isArray(v)) for (const it of v) stack.push(it);
      }
    }

    return [...tokens];
  };

  const fetchAllViaBrowseVL = async (): Promise<string[]> => {
    const seen = new Set<string>();
    const ids: string[] = [];

    const enqueueIds = (root: any) => {
      for (const id of extractIdsFromPlaylistRenderer(root)) {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    };

    const processRoot = async (initial: any, label: string) => {
      if (!initial) {
        console.warn(`[Worker] browse(${label}) initial empty`);
        return;
      }
      enqueueIds(initial);

      let tokens = extractContinuationTokens(initial);
      const MAX = 2000;
      let steps = 0;

      console.log(
        `[Worker] browse(${label}) initial: ids=${ids.length}, tokens=${tokens.length}`
      );

      while (tokens.length && steps < MAX) {
        steps++;
        const token = tokens.shift()!;
        let cont: any;
        try {
          cont = await (yt as any).actions.execute("browse", {
            continuation: token,
          });
        } catch (e) {
          console.warn(
            `[Worker] browse continuation(${label}) failed step=${steps}: ${e}`
          );
          continue;
        }
        if (!cont) continue;

        const cd = cont?.data ?? cont;
        enqueueIds(cd);

        const more = extractContinuationTokens(cd);
        for (const t of more) tokens.push(t);
      }

      console.log(
        `[Worker] browse(${label}) done: ids=${ids.length}, steps=${steps}, remainingTokens=${tokens.length}`
      );
    };

    // 1) VL<playlistId>
    try {
      const respVL: any = await (yt as any).actions.execute("browse", {
        browseId: `VL${playlistId}`,
      });
      await processRoot(respVL?.data ?? respVL, `VL${playlistId}`);
    } catch (e) {
      console.warn(`[Worker] browse(VL${playlistId}) failed: ${e}`);
    }

    // 2) 生の playlistId（VLで足りない場合や continuation が別経路の場合）
    if (ids.length < 200) {
      try {
        const respRaw: any = await (yt as any).actions.execute("browse", {
          browseId: playlistId,
        });
        await processRoot(respRaw?.data ?? respRaw, playlistId);
      } catch (e) {
        console.warn(`[Worker] browse(${playlistId}) failed: ${e}`);
      }
    }

    return ids;
  };

  /* ---------------------------------------------
     取得入口：RD → getPlaylist → browse
  --------------------------------------------- */

  const fetchVideoIds = async (): Promise<string[]> => {
    // RD (Mix) 系
    if (playlistId.startsWith("RD")) {
      const mixIds = await tryMixViaNext();
      if (mixIds.length) return mixIds;
      console.warn("[Worker] RD Mix via next returned no ids, fallback to others.");
      // RD だけど一応 getPlaylist / browse も試す
    }

    // 1) getPlaylist を最優先（内部で継続取得してくれる想定）
    const viaGetPlaylist = await tryGetAllViaGetPlaylist();
    if (viaGetPlaylist.length) {
      console.log(
        `[Worker] fetchVideoIds: via getPlaylist success: count=${viaGetPlaylist.length}`
      );
      return viaGetPlaylist;
    }

    // 2) browse + continuation 全探索
    const viaBrowse = await fetchAllViaBrowseVL();
    if (viaBrowse.length) {
      console.log(
        `[Worker] fetchVideoIds: via browse success: count=${viaBrowse.length}`
      );
      return viaBrowse;
    }

    console.warn("[Worker] fetchVideoIds: all methods failed, returning empty.");
    return [];
  };

  const videoIds = await fetchVideoIds();
  console.log(
    `[Worker] Finished playlist scan: ${playlistId}, total videoIds=${videoIds.length}`
  );
  return { playlistId, videoIds };
}

/* ======================================================
   Worker 起動
====================================================== */

(async () => {
  try {
    const payload = workerData as Payload;
    const out = await fetchPlaylistVideoIdsFromUrl(payload.url);
    parentPort?.postMessage({ ok: true, data: out });
  } catch (e) {
    console.error(`Worker fatal: ${e}`);
    parentPort?.postMessage({ ok: false, error: String(e) });
  }
})();
