import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";
import * as youtubei from "youtubei.js";
import yts from "yt-search";
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

type Payload = { urls: string[]; start: number };
type SortedOut = { type: "videoId"; body: string }[];

// --- JSONL キャッシュ: cacheJSONs/spotifyToVideoIdCache.jsonl ---
const SPOTIFY_CACHE_DIR = path.join(__dirname, "..", "..", "cacheJSONs");
const SPOTIFY_CACHE_FILE = path.join(SPOTIFY_CACHE_DIR, "spotifyToVideoIdCache.jsonl");
type SpotifyCacheRow = { videoId: string; spotifyId: string };

let SPOTIFY_CACHE_LOADED = false;
let SPOTIFY_CACHE_BY_SPOTIFY = new Map<string, string>(); // spotifyId -> videoId
let SPOTIFY_CACHE_BY_VIDEO = new Set<string>(); // videoId exists

function loadSpotifyCacheIndexSync() {
    if (SPOTIFY_CACHE_LOADED) return;
    ensureSpotifyCacheFileSync();
    const rows = readAllSpotifyCacheRowsSync();
    for (const r of rows) {
        if (r?.spotifyId && r?.videoId) {
            SPOTIFY_CACHE_BY_SPOTIFY.set(r.spotifyId, r.videoId);
            SPOTIFY_CACHE_BY_VIDEO.add(r.videoId);
        }
    }
    SPOTIFY_CACHE_LOADED = true;
}

function ensureSpotifyCacheFileSync() {
    try { if (!fs.existsSync(SPOTIFY_CACHE_DIR)) fs.mkdirSync(SPOTIFY_CACHE_DIR, { recursive: true }); } catch {}
    try { if (!fs.existsSync(SPOTIFY_CACHE_FILE)) fs.writeFileSync(SPOTIFY_CACHE_FILE, ""); } catch {}
}

function readAllSpotifyCacheRowsSync(): SpotifyCacheRow[] {
    try {
        const txt = String(fs.readFileSync(SPOTIFY_CACHE_FILE));
        if (!txt) return [];
        const rows: SpotifyCacheRow[] = [];
        for (const line of txt.split("\n")) {
            const s = line.trim();
            if (!s) continue;
            try { rows.push(JSON.parse(s) as SpotifyCacheRow); } catch {}
        }
        return rows;
    } catch {
        return [];
    }
}

function lookupBySpotifyIdSync(spotifyId: string): string | undefined {
    loadSpotifyCacheIndexSync();
    return SPOTIFY_CACHE_BY_SPOTIFY.get(spotifyId);
}

function appendSpotifyIfMissingByVideoIdSync(row: SpotifyCacheRow) {
    loadSpotifyCacheIndexSync();
    if (SPOTIFY_CACHE_BY_VIDEO.has(row.videoId)) return; // 同じ videoId が既にあるなら保存スキップ
    if (SPOTIFY_CACHE_BY_SPOTIFY.has(row.spotifyId)) return; // 同じ spotifyId が既にあるなら保存スキップ
    try {
        ensureSpotifyCacheFileSync();
        fs.appendFileSync(SPOTIFY_CACHE_FILE, JSON.stringify(row) + "\n");
        // 追記に成功したらインメモリインデックスも更新
        SPOTIFY_CACHE_BY_SPOTIFY.set(row.spotifyId, row.videoId);
        SPOTIFY_CACHE_BY_VIDEO.add(row.videoId);
    } catch {}
}

async function spotifyToYouTubeId(spotifyUrlOrId: string): Promise<string | undefined> {
    const startTime = Date.now();
    // --- scoped log collector (only prints on final failure) ---
    const log: { type: "info" | "warn" | "error"; body: any[] }[] = [];
    const push = (type: "info" | "warn" | "error", ...body: any[]) => { log.push({ type, body }); };
    const info = (...a: any[]) => push("info", ...a);
    const warn = (...a: any[]) => push("warn", ...a);
    const err = (...a: any[]) => push("error", ...a);
    const fail = (message: string) => {
        err(message);
        console.error(`[spotifyToYouTubeId(worker)] 検索に失敗しました。詳細:`, log);
        return undefined;
    };
    const t0 = Date.now();
    info(`[spotifyToYouTubeId] start:`, spotifyUrlOrId);

    // ---------- 0) ID抽出 & URL正規化（/intl-xx/ を吸収） ----------
    const extractTrackId = (s: string): string | undefined => {
        try {
            const u = new URL(s);
            const m = u.pathname.match(/\/(?:intl-[a-z]{2}\/)?(?:embed\/)?track\/([A-Za-z0-9]+)/);
            if (m) info(`[spotifyToYouTubeId] parsed id from path:`, m[1]);
            if (m) return m[1];
            // アルバム内ハイライトなど（?highlight=spotify:track:<id>）
            const hi = u.search.match(/highlight=spotify:track:([A-Za-z0-9]+)/);
            if (hi) info(`[spotifyToYouTubeId] parsed id from highlight:`, hi[1]);
            if (hi) return hi[1];
            // 生のIDが来たとき
            return /^[A-Za-z0-9]{10,}$/.test(s) ? s : undefined;
        } catch {
            return /^[A-Za-z0-9]{10,}$/.test(s) ? s : undefined;
        }
    };
    const trackId = extractTrackId(spotifyUrlOrId);
    if (!trackId) { return fail('trackId not found'); }

    // --- JSONL キャッシュ 事前ヒット確認（spotifyId ベース） ---
    {
        const cached = lookupBySpotifyIdSync(trackId);
        if (cached) {
            console.log(`[cache] spotifyToYouTubeId: hit spotifyId=${trackId} -> videoId=${cached}`);
            return cached;
        }
    }
    info(`[spotifyToYouTubeId] trackId:`, trackId);

    const canonical = (locale: "ja" | "en") =>
        `https://open.spotify.com/${locale === "ja" ? "intl-ja/" : "intl-en/"}track/${trackId}`;

    // ---------- 1) Spotifyメタデータ取得（トークン不要ルートのみ） ----------
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

    const fetchText = async (url: string, acceptLang: string) => {
        try {
            const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": acceptLang } as any });
            if (!r || !r.ok) {
                warn(`[spotifyToYouTubeId] fetchText not ok: ${url}`);
                return undefined;
            }
            const txt = await r.text().catch(() => undefined);
            if (!txt) warn(`[spotifyToYouTubeId] fetchText body empty: ${url}`);
            return txt;
        } catch (e: any) {
            warn(`[spotifyToYouTubeId] fetchText error: ${url} ${e?.message || e}`);
            return undefined;
        }
    };

    const fetchOEmbed = async (url: string) => {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        try {
            const r = await fetch(oembedUrl, { headers: { "User-Agent": UA } as any });
            if (!r || !r.ok) {
                warn(`[spotifyToYouTubeId] oEmbed not ok: ${oembedUrl}`);
                return undefined;
            }
            const j = await r.json().catch(() => undefined);
            if (!j) warn(`[spotifyToYouTubeId] oEmbed body empty`);
            return j;
        } catch (e: any) {
            warn(`[spotifyToYouTubeId] oEmbed error: ${e?.message || e}`);
            return undefined;
        }
    };

    type Meta = { title?: string; artist?: string; album?: string; durationMs?: number; };

    const splitTitleArtist = (s?: string): { title?: string; artist?: string } => {
        if (!s) return {};
        const SEP = /\s*(?:–|—|-|·|•|\|)\s*/;
        const parts = String(s).split(SEP);
        if (parts.length >= 2) return { title: parts[0].trim(), artist: parts[1].trim() };
        return { title: s };
    };

    const parseFromTitleTag = (html?: string): Partial<Meta> => {
        if (!html) return {};
        const m = html.match(/<title>([^<]+)<\/title>/i);
        if (!m) return {};
        const { title, artist } = splitTitleArtist(m[1]);
        return { title, artist };
    };

    const sniffDurationMs = (html?: string): number | undefined => {
        if (!html) return undefined;
        const mNum = html.match(/\b(duration(?:Ms|_ms)?)\"?\s*:\s*(\d{3,})/i);
        if (mNum && mNum[2]) {
            const v = parseInt(mNum[2], 10);
            if (Number.isFinite(v) && v > 0) return v;
        }
        const mIso = html.match(/\b\"duration\"\s*:\s*\"PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?\"/i);
        if (mIso) {
            const mm = mIso[1] ? parseInt(mIso[1], 10) : 0;
            const ss = mIso[2] ? parseFloat(mIso[2]) : 0;
            const ms = Math.round((mm * 60 + ss) * 1000);
            if (ms > 0) return ms;
        }
        const mClock = html.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
        if (mClock) {
            const hh = mClock[3] ? parseInt(mClock[1], 10) : 0;
            const mm = mClock[3] ? parseInt(mClock[2], 10) : parseInt(mClock[1], 10);
            const ss = mClock[3] ? parseInt(mClock[3], 10) : parseInt(mClock[2], 10);
            const total = (hh * 3600 + mm * 60 + ss) * 1000;
            if (total > 0) return total;
        }
        return undefined;
    };

    const parseFromNextData = (html?: string): Partial<Meta> => {
        if (!html) return {};
        const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!m) return {};
        let json: any;
        try { json = JSON.parse(m[1]); } catch { return {}; }
        const candidates: any[] = [
            json?.props?.pageProps?.state?.data?.entity,
            json?.props?.pageProps?.state?.data?.trackUnion,
            json?.props?.pageProps?.state?.data?.pageData?.track,
        ].filter(Boolean);
        const pick = candidates[0];
        if (!pick) return {};
        const title = pick.name || pick.title || pick.track?.name;
        const artist =
            (Array.isArray(pick.artists) && pick.artists[0]?.name) ||
            (Array.isArray(pick.track?.artists) && pick.track.artists[0]?.name) ||
            pick.artist?.name;
        const album = pick.album?.name || pick.track?.album?.name;
        let durationMs: number | undefined =
            typeof pick.durationMs === "number" ? pick.durationMs :
            typeof pick.duration_ms === "number" ? pick.duration_ms :
            typeof pick.track?.durationMs === "number" ? pick.track.durationMs :
            typeof pick.track?.duration_ms === "number" ? pick.track.duration_ms : undefined;
        return { title, artist, album, durationMs };
    };

    const parseFromLdJson = (html?: string): Partial<Meta> => {
        if (!html) return {};
        const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
        for (const s of scripts) {
            try {
                const o = JSON.parse(s[1]);
                const arr = Array.isArray(o) ? o : [o];
                for (const item of arr) {
                    if (item["@type"] === "MusicRecording" || item["@type"] === "MusicAlbum" || item.name) {
                        const title = item.name;
                        const artist =
                            item.byArtist?.name ||
                            (Array.isArray(item.byArtist) && item.byArtist[0]?.name);
                        const album = item.inAlbum?.name;
                        let durationMs: number | undefined;
                        if (typeof item.duration === "string") {
                            const m = item.duration.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
                            if (m) {
                                const mm = m[1] ? parseInt(m[1], 10) : 0;
                                const ss = m[2] ? parseFloat(m[2]) : 0;
                                durationMs = Math.round((mm * 60 + ss) * 1000);
                            }
                        }
                        if (typeof (item as any).durationMs === 'number') durationMs = (item as any).durationMs;
                        if (typeof (item as any).duration_ms === 'number') durationMs = (item as any).duration_ms;
                        return { title, artist, album, durationMs };
                    }
                }
            } catch {}
        }
        return {};
    };

    const mergeMeta = (...m: Partial<Meta>[]): Meta => {
        const out: Meta = {};
        for (const x of m) {
            out.title = out.title || x.title;
            out.artist = out.artist || x.artist;
            out.album = out.album || x.album;
            out.durationMs = out.durationMs || x.durationMs;
        }
        return out;
    };

    // JP / EN ページを取ってみる（片方でもOK）
    const t_fetchText_jp = Date.now();
    const jpHtml = await fetchText(canonical("ja"), "ja-JP,ja;q=0.9,en;q=0.6");
    console.log(`[計測] fetchText（JP） に ${((Date.now() - t_fetchText_jp) / 1000).toFixed(2)} 秒かかりました`);
    const t_fetchText_en = Date.now();
    const enHtml = await fetchText(canonical("en"), "en-US,en;q=0.9,ja;q=0.6");
    console.log(`[計測] fetchText（EN） に ${((Date.now() - t_fetchText_en) / 1000).toFixed(2)} 秒かかりました`);
    info(`[spotifyToYouTubeId] html fetched: jp=${!!jpHtml} en=${!!enHtml}`);

    const t_fetchOEmbed_jp = Date.now();
    const jpEmbed = await fetchOEmbed(canonical("ja")).catch(() => undefined);
    console.log(`[計測] fetchOEmbed（JP） に ${((Date.now() - t_fetchOEmbed_jp) / 1000).toFixed(2)} 秒かかりました`);
    const t_fetchOEmbed_en = Date.now();
    const enEmbed = await fetchOEmbed(canonical("en")).catch(() => undefined);
    console.log(`[計測] fetchOEmbed（EN） に ${((Date.now() - t_fetchOEmbed_en) / 1000).toFixed(2)} 秒かかりました`);
    info(`[spotifyToYouTubeId] oembed fetched: jp=${!!jpEmbed} en=${!!enEmbed}`);

    // --- Fetch iframe (embed) HTML as additional metadata source ---
    const iframeUrl = (jpEmbed?.iframe_url as string) || (enEmbed?.iframe_url as string);
    let embedHtml: string | undefined;
    if (iframeUrl) {
        try {
            const r = await fetch(iframeUrl, { headers: { "User-Agent": UA } as any });
            if (r.ok) {
                embedHtml = await r.text().catch(() => undefined);
            } else {
                warn(`[spotifyToYouTubeId] embed iframe fetch not ok: ${r.status}`);
            }
        } catch (e: any) {
            warn(`[spotifyToYouTubeId] embed iframe fetch error: ${e?.message || e}`);
        }
    } else {
        warn(`[spotifyToYouTubeId] no iframe_url in oEmbed`);
    }

    // Helper to parse loosely from embed HTML (when JSON parsing is hard)
    const parseFromEmbedLoose = (html?: string): Partial<Meta> => {
        if (!html) return {};
        let artist: string | undefined;
        const artistsBlock = html.match(/"artists"\s*:\s*\[([\s\S]*?)\]/);
        if (artistsBlock) {
            const names = [...artistsBlock[1].matchAll(/"name"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
            if (names.length) artist = names[0];
        }
        const titleMatch = html.match(/"name"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"track"/);
        const title = titleMatch ? titleMatch[1] : undefined;
        const albumMatch = html.match(/"album"\s*:\s*{[\s\S]*?"name"\s*:\s*"([^"]+)"/);
        const album = albumMatch ? albumMatch[1] : undefined;
        let durationMs: number | undefined;
        const mNum = html.match(/"duration_(?:ms|Ms)"\s*:\s*(\d{3,})/);
        if (mNum?.[1]) {
            const v = parseInt(mNum[1], 10);
            if (Number.isFinite(v) && v > 0) durationMs = v;
        }
        if (!durationMs) {
            const iso = html.match(/"duration"\s*:\s*"PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?"/);
            if (iso) {
                const mm = iso[1] ? parseInt(iso[1], 10) : 0;
                const ss = iso[2] ? parseFloat(iso[2]) : 0;
                durationMs = Math.round((mm * 60 + ss) * 1000);
            }
        }
        return { title, artist, album, durationMs };
    };

    const jp = mergeMeta(
        parseFromNextData(jpHtml),
        parseFromLdJson(jpHtml),
        parseFromNextData(embedHtml),
        parseFromLdJson(embedHtml),
        parseFromEmbedLoose(embedHtml),
        (() => {
            const o = jpEmbed || {};
            const bySplit = splitTitleArtist(o.title);
            const artist = (o as any).author_name || bySplit.artist;
            return { title: bySplit.title, artist };
        })(),
        parseFromTitleTag(jpHtml),
        parseFromTitleTag(embedHtml),
        { durationMs: sniffDurationMs(jpHtml) },
        { durationMs: sniffDurationMs(embedHtml) }
    );
    const en = mergeMeta(
        parseFromNextData(enHtml),
        parseFromLdJson(enHtml),
        parseFromNextData(embedHtml),
        parseFromLdJson(embedHtml),
        parseFromEmbedLoose(embedHtml),
        (() => {
            const o = enEmbed || {};
            const bySplit = splitTitleArtist(o.title);
            const artist = (o as any).author_name || bySplit.artist;
            return { title: bySplit.title, artist };
        })(),
        parseFromTitleTag(enHtml),
        parseFromTitleTag(embedHtml),
        { durationMs: sniffDurationMs(enHtml) },
        { durationMs: sniffDurationMs(embedHtml) }
    );
    info(`[spotifyToYouTubeId] meta JP:`, jp);
    info(`[spotifyToYouTubeId] meta EN:`, en);

    // JP を基準、欠けは EN で補完
    const titleJP = jp.title || en.title;
    const artistJP = jp.artist || en.artist;
    const albumJP = jp.album || en.album;
    const durationMs = jp.durationMs || en.durationMs;
    const titleEN = en.title || jp.title;
    const artistEN = en.artist || jp.artist;
    const albumEN = en.album || jp.album;

    if (!titleJP || !artistJP || !durationMs) {
        warn(`[spotifyToYouTubeId] insufficient meta:`, { titleJP, artistJP, durationMs, note: 'checked nextData/ld+json/oEmbed(author_name)/<title>/duration sniff' });
        return fail('insufficient metadata');
    }

    // ---------- 2) クエリ生成（ハイフンのみ除去：仕様準拠） ----------
    const buildQuery = (title?: string, artist?: string, album?: string) =>
        [title, artist, album].filter(Boolean).join(" ").replace(/-/g, " ").trim();

    const jpQuery = buildQuery(titleJP, artistJP, albumJP);
    const enQuery = buildQuery(titleEN, artistEN, albumEN);
    info(`[spotifyToYouTubeId] JPQuery: ${jpQuery}`);
    info(`[spotifyToYouTubeId] ENQuery: ${enQuery}`);

    // ---------- 3) YouTube 検索（youtubei + yts） ----------
    type YtItem = { videoId: string; title?: string; seconds?: number; channelTitle?: string };

    const searchYoutubei = async (q: string): Promise<YtItem[]> => {
        try {
            const t_create = Date.now();
            const yt = await (youtubei.Innertube.create({ lang: "ja", location: "JP" } as any).catch(e => { err("youtubei.create", e); }));
            console.log(`[計測] youtubei.Innertube.create に ${((Date.now() - t_create) / 1000).toFixed(2)} 秒かかりました`);
            const t_search = Date.now();
            const r = await (yt?.search(q).catch(e => { err("youtubei.search", e); }));
            console.log(`[計測] youtubei.search に ${((Date.now() - t_search) / 1000).toFixed(2)} 秒かかりました`);
            const items: any[] = (Array.isArray(r?.videos) ? r.videos : []) || (Array.isArray(r?.results) ? r.results : []);
            return (items || []).map(it => {
                const id = it.id || it.videoId || it?.endpoint?.payload?.videoId;
                const seconds =
                    typeof it.duration === "number" ? it.duration :
                        it.duration?.seconds ?? it.duration_seconds;
                const channelTitle =
                    it.author?.name || it.channel?.name || it.owner?.name ||
                    it.short_byline_text?.text || it.owner_text?.text || "";
                return id ? {
                    videoId: String(id),
                    title: it.title?.text ?? it.title ?? it?.headline?.text,
                    seconds: typeof seconds === "number" ? seconds : undefined,
                    channelTitle
                } : undefined;
            }).filter(Boolean) as YtItem[];
        } catch {
            return [];
        }
    };

    const searchYts = async (q: string): Promise<YtItem[]> => {
        try {
            const t_yts = Date.now();
            const r: any = await yts(q).catch(e => { err("searchYtsError:", e); });
            console.log(`[計測] yts検索 に ${((Date.now() - t_yts) / 1000).toFixed(2)} 秒かかりました`);
            const vids: any[] = Array.isArray(r?.videos) ? r.videos : [];
            return vids.map(v => ({
                videoId: v.videoId,
                title: v.title,
                seconds: typeof v.seconds === "number" ? v.seconds : undefined,
                channelTitle: v.author?.name
            }));
        } catch {
            return [];
        }
    };

    const mergeUnique = (a: YtItem[], b: YtItem[]) => {
        const out: YtItem[] = [];
        const seen = new Set<string>();
        for (const it of [...a, ...b]) {
            if (!it || !it.videoId) continue;
            if (!seen.has(it.videoId)) {
                seen.add(it.videoId);
                out.push(it);
            }
        }
        return out;
    };

    const jpList = mergeUnique(await searchYoutubei(jpQuery), await searchYts(jpQuery));
    const enList = mergeUnique(await searchYoutubei(enQuery), await searchYts(enQuery));
    info(`[spotifyToYouTubeId] jpList: ${jpList.length}, enList: ${enList.length}`);
    if (!jpList.length && !enList.length) warn(`[spotifyToYouTubeId] no youtube results`);

    // ---------- 4) スコア付け（配列長 - 要素番号）＋ JP/EN 重複加算 ----------
    const scoreMapJP = new Map<string, number>();
    for (let i = 0; i < jpList.length; i++) scoreMapJP.set(jpList[i].videoId, jpList.length - i + ((() => {
        const splitedArtistName = [...artistJP.replace(/[\/:;¥*]/g, "").split(" "), ...(artistEN?.replace(/[\/:;¥*]/g, "").split(" ") || [])];
        let matched = 0;
        const chname = jpList[i].channelTitle;
        splitedArtistName.forEach(name => {
            if (name.length > 1 && chname && chname.includes(name)) matched += 10;
        });
        return matched;
    })()));

    const scoreMapEN = new Map<string, number>();
    for (let i = 0; i < enList.length; i++) scoreMapEN.set(enList[i].videoId, enList.length - i + ((() => {
        const splitedArtistName = [...artistJP.replace(/[\/:;¥*]/g, "").split(" "), ...(artistEN?.replace(/[\/:;¥*]/g, "").split(" ") || [])];
        let matched = 0;
        const chname = enList[i].channelTitle;
        splitedArtistName.forEach(name => {
            if (name.length > 1 && chname && chname.includes(name)) matched += 10;
        });
        return matched;
    })()));

    for (const vid of scoreMapJP.keys()) {
        const enScore = scoreMapEN.get(vid);
        if (enScore) scoreMapJP.set(vid, (scoreMapJP.get(vid) || 0) + enScore);
    }

    // ---------- 5) 長さフィルタ（±6秒未満のみ） ----------
    const filtered = jpList.filter(it => typeof it.seconds === "number" && Math.abs(it.seconds! * 1000 - durationMs) < 6000);
    info(`[spotifyToYouTubeId] durationMs=${durationMs} filtered=${filtered.length} (±6s)`);
    if (!filtered.length) { warn(`[spotifyToYouTubeId] filtered empty`); return fail('no candidates matched duration'); }

    // ---------- 6) スコア降順で先頭 ----------
    filtered.sort((a, b) => (scoreMapJP.get(b.videoId) || 0) - (scoreMapJP.get(a.videoId) || 0));

    if (!filtered.length || !filtered[0]?.videoId) {
        return fail('no selected candidate');
    }

    try {
        const top5 = filtered.slice(0, 5).map(v => {
            const base = scoreMapJP.get(v.videoId) || 0;
            const diff = Math.abs((v.seconds ?? 0) * 1000 - durationMs);
            return `${v.title ?? ""} (${v.videoId})  score:${base}  diff:${diff}ms`;
        }).join("\n");
        info(`[spotifyToYouTubeId] Track:${trackId}\nJPQuery: ${jpQuery}\nENQuery: ${enQuery}\nTop5:\n${top5}`);
    } catch {}

    const took = Date.now() - t0;
    info(`[spotifyToYouTubeId] selected:`, filtered[0]?.videoId, `took=${took}ms`);
    const selectedVideoId = filtered[0].videoId;

    // --- JSONL キャッシュ追記（直前に再読込し videoId 重複ならスキップ）---
    appendSpotifyIfMissingByVideoIdSync({ videoId: selectedVideoId, spotifyId: trackId });

    console.log(`[計測] spotifyToYouTubeId(worker) 全体で ${((Date.now() - startTime) / 1000).toFixed(2)} 秒`);
    return selectedVideoId;
}
async function processSlice(data: Payload): Promise<SortedOut> {
    const { urls, start } = data;

    const settled = await Promise.allSettled(
        urls
            .filter(Boolean)
            .map((url, idx) =>
                spotifyToYouTubeId(url).then((id) => ({
                    num: start + idx,
                    id,
                }))
            )
    );

    const sorted: SortedOut = settled
        .filter(
            (r): r is PromiseFulfilledResult<{ num: number; id: string }> =>
                r.status === "fulfilled" && !!r.value?.id
        )
        .map((r) => r.value)
        .sort((a, b) => a.num - b.num)
        .map(({ id }) => ({ type: "videoId", body: id }));

    return sorted;
}

// 起動即実行して結果を返すワーカー
processSlice(workerData as Payload).then(
    (res) => parentPort?.postMessage({ ok: true, data: res }),
    (err) => parentPort?.postMessage({ ok: false, error: String(err) })
);
