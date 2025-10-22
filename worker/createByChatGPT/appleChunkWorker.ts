import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import path from "path";
import url from "url";
import * as youtubei from "youtubei.js";
import yts from "yt-search";
// ワーカー内で自給自足の appleMusicToYouTubeId を実装（envJSON へ依存しない）
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

type Payload = { urls: string[]; start: number };
type SortedOut = { type: "videoId"; body: string }[];

// --- JSONL キャッシュ: cacheJSONs/appleMusicToVideoIdCache.jsonl ---
const CACHE_DIR = path.join(__dirname, "..", "..", "cacheJSONs");
const CACHE_FILE = path.join(CACHE_DIR, "appleMusicToVideoIdCache.jsonl");
type CacheRow = { videoId: string; appleMusicId: string };

let APPLE_CACHE_LOADED = false;
let APPLE_CACHE_BY_APPLE = new Map<string, string>(); // appleMusicId -> videoId
let APPLE_CACHE_BY_VIDEO = new Set<string>(); // videoId exists

function loadAppleCacheIndexSync() {
    if (APPLE_CACHE_LOADED) return;
    ensureCacheFileSync();
    const rows = readAllCacheRowsSync();
    for (const r of rows) {
        if (r?.appleMusicId && r?.videoId) {
            APPLE_CACHE_BY_APPLE.set(r.appleMusicId, r.videoId);
            APPLE_CACHE_BY_VIDEO.add(r.videoId);
        }
    }
    APPLE_CACHE_LOADED = true;
}

function ensureCacheFileSync() {
    try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch { }
    try { if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, ""); } catch { }
}

function readAllCacheRowsSync(): CacheRow[] {
    try {
        const txt = String(fs.readFileSync(CACHE_FILE));
        if (!txt) return [];
        const rows: CacheRow[] = [];
        for (const line of txt.split("\n")) {
            const s = line.trim();
            if (!s) continue;
            try { rows.push(JSON.parse(s) as CacheRow); } catch { }
        }
        return rows;
    } catch {
        return [];
    }
}

function lookupByAppleIdSync(appleMusicId: string): string | undefined {
    loadAppleCacheIndexSync();
    return APPLE_CACHE_BY_APPLE.get(appleMusicId);
}

function appendIfMissingByVideoIdSync(row: CacheRow) {
    loadAppleCacheIndexSync();
    if (APPLE_CACHE_BY_VIDEO.has(row.videoId)) return; // videoId 重複
    if (APPLE_CACHE_BY_APPLE.has(row.appleMusicId)) return; // appleMusicId 重複
    try {
        ensureCacheFileSync();
        fs.appendFileSync(CACHE_FILE, JSON.stringify(row) + "\n");
        APPLE_CACHE_BY_APPLE.set(row.appleMusicId, row.videoId);
        APPLE_CACHE_BY_VIDEO.add(row.videoId);
    } catch {}
}

async function appleMusicToYouTubeId(appleUrlOrId: string): Promise<string | undefined> {
    const startTime = Date.now();
    const log: { type: "info" | "warn" | "error"; body: any[] }[] = [];
    const push = (type: "info" | "warn" | "error", ...body: any[]) => { log.push({ type, body }); };
    const err = (...a: any[]) => push("error", ...a);
    const fail = (message: string) => {
        err(message);
        console.error(`[appleMusicToYouTubeId(worker)] 失敗:`, log);
        return undefined;
    };

    // --- Apple Music の trackId 抽出 ---
    const extractTrackId = (s: string): string | undefined => {
        try {
            const u = new URL(s);
            const i = u.searchParams.get("i");
            if (i && /^\d+$/.test(i)) return i;
            const nums = u.pathname.split("/").filter(Boolean).filter(x => /^\d+$/.test(x));
            if (nums.length) return nums[nums.length - 1];
            return undefined;
        } catch {
            return /^\d+$/.test(s) ? s : undefined;
        }
    };
    const trackId = extractTrackId(appleUrlOrId);
    if (!trackId) return fail("trackId not found");

    // --- JSONL キャッシュ 事前ヒット確認（appleId ベース） ---
    {
        const cached = lookupByAppleIdSync(trackId);
        if (cached) {
            console.log(`[cache] appleMusicToYouTubeId: hit appleMusicId=${trackId} -> videoId=${cached}`);
            return cached;
        }
    }

    // --- Apple Lookup（JP/US） ---
    const fetchLookup = async (country: string) => {
        const urlLookup = `https://itunes.apple.com/lookup?id=${trackId}&entity=song&country=${country}`;
        const res = await fetch(urlLookup);
        if (!res.ok) return undefined;
        const data = await res.json().catch(() => undefined);
        const items = Array.isArray(data?.results) ? data.results : [];
        return items.find((r: any) => r.kind === "song") || items[0];
    };
    const jpMeta = await fetchLookup("jp");
    const usMeta = await fetchLookup("us");
    if (!jpMeta && !usMeta) return fail("lookup metadata not found");

    const jpTitle: string | undefined = jpMeta?.trackName;
    const jpArtist: string | undefined = jpMeta?.artistName;
    const jpAlbum: string | undefined = jpMeta?.collectionName;
    const jpDurationMs: number | undefined = jpMeta?.trackTimeMillis;

    const enTitle: string | undefined = usMeta?.trackName || jpTitle;
    const enArtist: string | undefined = usMeta?.artistName || jpArtist;
    const enAlbum: string | undefined = usMeta?.collectionName || jpAlbum;

    // --- album suffix normalizer (mimic original): remove trailing "- EP" / "- Single"
    const stripAlbumSuffixes = (s?: string) =>
        (s || "").replace(/\s*-\s*(EP|Single)\s*$/i, "").trim();
    const jpAlbumNorm = stripAlbumSuffixes(jpAlbum);
    const enAlbumNorm = stripAlbumSuffixes(enAlbum);

    if (!jpTitle || !jpArtist) return fail("missing title/artist");
    if (!jpDurationMs) return fail("missing duration");

    const buildQuery = (title?: string, artist?: string, album?: string) => {
        const raw = [title, artist, album].filter(Boolean).join(" ");
        return raw.replace(/-/g, " ").trim();
    };
    const jpQuery = buildQuery(jpTitle, jpArtist, jpAlbumNorm);
    const enQuery = buildQuery(enTitle, enArtist, enAlbumNorm);
    const deepCheck = false;
    if (deepCheck) {
        const albumNormJP = stripAlbumSuffixes(jpAlbum);
        const albumNormEN = stripAlbumSuffixes(enAlbum);

        const qJP_full = [jpTitle, jpArtist, albumNormJP].filter(Boolean).join(" ").trim();
        const qEN_full = [enTitle, enArtist, albumNormEN].filter(Boolean).join(" ").trim();

        const safeSearch = async (q: string, lang: "ja" | "en") => {
            try {
                const __t_create = Date.now();
                const __yt = await youtubei.Innertube.create({
                    timezone: "Asia/Tokyo",
                    lang: lang,
                    location: "JP",
                    device_category: "desktop",
                });
                console.log(`[計測] youtubei.Innertube.create に ${((Date.now() - __t_create) / 1000).toFixed(2)} 秒かかりました`);
                const __t_search = Date.now();
                const res = await __yt.search(q);
                console.log(`[計測] youtubei.search に ${((Date.now() - __t_search) / 1000).toFixed(2)} 秒かかりました`);
                const result: {
                    title: string;
                    authorName: string;
                    videoId: string
                }[] = []
                for (const resu of res.results)
                    if (resu.is(youtubei.YTNodes.Video) && resu.title.text)
                        result.push({ title: resu.title.text, authorName: resu.author.name, videoId: resu.video_id })
                return result;
            } catch (e) {
                console.error("er", e);
            }
        };
        async function inspectResults(searchResult: {
            title: string;
            authorName: string;
            videoId: string
        }[]) {
            const __t_create2 = Date.now();
            const yt = await youtubei.Innertube.create({
                client_type: youtubei.ClientType.MUSIC,
                lang: 'ja',
                location: 'JP'
            });
            console.log(`[計測] youtubei.Innertube.create(MUSIC) に ${((Date.now() - __t_create2) / 1000).toFixed(2)} 秒かかりました`);
            interface TrackMeta {
                title?: string;
                albumTitle?: string;
                artistName?: string;
                videoId: string;
            }
            const musicInfoResult: TrackMeta[] = [];

            for (const item of searchResult) {
                const videoId = item.videoId;
                if (!videoId) continue;
                try {
                    const __t_getInfo = Date.now();
                    const info = await yt.music.getInfo(videoId);
                    console.log(`[計測] yt.music.getInfo(${videoId}) に ${((Date.now() - __t_getInfo) / 1000).toFixed(2)} 秒かかりました`);

                    /**
                     * TrackInfo から title / albumTitle / artistName を抽出
                     * @param track YouTube.js の TrackInfo
                     * @returns TrackMeta
                     */
                    async function extractTrackMeta(track: youtubei.YTMusic.TrackInfo): Promise<TrackMeta> {
                        const meta: TrackMeta = { videoId };
                        const basic = track.basic_info;

                        // --- 1) basic_info ---
                        if (basic?.title) meta.title = basic.title;
                        if (basic?.channel?.name) meta.artistName = basic.channel.name;

                        // 再帰的に text / runs を集める内部関数
                        const collectTexts = (node: unknown, depth = 0): string[] => {
                            if (depth > 6 || typeof node !== "object" || node === null) return [];
                            const texts: string[] = [];

                            const n = node as Record<string, unknown>;
                            const value = n["text"];
                            if (typeof value === "string") {
                                texts.push(value);
                            } else if (value && typeof value === "object" && Array.isArray((value as any).runs)) {
                                const runs = (value as { runs: { text?: string }[] }).runs;
                                texts.push(runs.map(r => r.text ?? "").join(""));
                            }

                            if (Array.isArray(n["runs"])) {
                                const runs = n["runs"] as { text?: string }[];
                                texts.push(runs.map(r => r.text ?? "").join(""));
                            }

                            for (const val of Object.values(n)) {
                                if (Array.isArray(val)) for (const v of val) texts.push(...collectTexts(v, depth + 1));
                                else if (typeof val === "object" && val !== null) texts.push(...collectTexts(val, depth + 1));
                            }

                            return texts;
                        };

                        // 指定ラベルに基づき値を拾う
                        const findByLabel = (texts: string[], labels: string[]): string | undefined => {
                            for (let i = 0; i < texts.length; i++) {
                                const t = texts[i].trim();
                                for (const label of labels) {
                                    const pattern = new RegExp(`^${label}\\s*[•:\\-]\\s*(.+)$`, "i");
                                    const match = t.match(pattern);
                                    if (match) return match[1].trim();
                                    if (t.toLowerCase() === label.toLowerCase() && texts[i + 1])
                                        return texts[i + 1].trim();
                                }
                            }
                            return undefined;
                        };

                        // --- 2) getRelated() から ---
                        const related = await track.getRelated().catch(() => undefined);
                        if (related && Array.isArray(related)) {
                            for (const node of related) {
                                if (
                                    node instanceof youtubei.YTNodes.MusicDescriptionShelf ||
                                    node instanceof youtubei.YTNodes.MusicCarouselShelf
                                ) {
                                    const texts = collectTexts(node);
                                    const album = findByLabel(texts, ["album", "アルバム"]);
                                    const artist = findByLabel(texts, ["artist", "アーティスト"]);
                                    if (album && !meta.albumTitle) meta.albumTitle = album;
                                    if (artist && !meta.artistName) meta.artistName = artist;
                                }
                            }
                        }

                        // --- 3) getTab() 経由で補完 ---
                        if (!meta.albumTitle || !meta.artistName) {
                            for (const tabName of track.available_tabs) {
                                if (!/desc|概要|about|information|詳細/i.test(tabName)) continue;
                                const tab = await track.getTab(tabName).catch(() => undefined);
                                if (!tab) continue;

                                const texts = collectTexts(tab);
                                const album = findByLabel(texts, ["album", "アルバム"]);
                                const artist = findByLabel(texts, ["artist", "アーティスト"]);
                                if (album && !meta.albumTitle) meta.albumTitle = album;
                                if (artist && !meta.artistName) meta.artistName = artist;
                                if (meta.albumTitle && meta.artistName) break;
                            }
                        }

                        // --- 4) 最後のフォールバック ---
                        if (!meta.artistName && basic?.author) meta.artistName = basic.author;

                        return meta;
                    }
                    musicInfoResult.push((await extractTrackMeta(info)));
                } catch (err) {
                    console.warn('Failed to fetch video info for', videoId, err);
                }
            }
            return musicInfoResult;
        }

        const jpResult = await safeSearch(qJP_full, "ja");
        const enResult = await safeSearch(qEN_full, "en");
        if (jpResult && enResult) {
            type VideoObject = { videoId: string;[key: string]: unknown };

            /**
             * 2つの配列を videoId で照合し、共通するものを { one: [], two: [] } にまとめて返す
             * どちらの配列にも存在する videoId がない場合は空の配列を返す
             */
            function matchByVideoId<
                T extends VideoObject,
                U extends VideoObject
            >(one: T[], two: U[]): { one: T[]; two: U[] } {
                const result: { one: T[]; two: U[] } = { one: [], two: [] };

                // Map化して高速照合
                const mapTwo = new Map<string, U>();
                for (const t of two) {
                    mapTwo.set(t.videoId, t);
                }

                for (const o of one) {
                    const match = mapTwo.get(o.videoId);
                    if (match) {
                        result.one.push(o);
                        result.two.push(match);
                    }
                }

                return result;
            }
            const { one, two } = matchByVideoId(jpResult, enResult);
            const jpInfo = await inspectResults(one);
            const enInfo = await inspectResults(two);

        }
    }
    type YtItem = { videoId: string; title?: string; seconds?: number; channelTitle?: string; };

    const searchYoutubei = async (q: string): Promise<YtItem[]> => {
        try {
            const yt = await youtubei.Innertube.create({ lang: "ja", location: "JP" } as any);
            const r = await yt.search(q);
            const items: any[] =
                (Array.isArray(r?.videos) ? r.videos : []) ||
                (Array.isArray(r?.results) ? r.results : []);
            const mapped: YtItem[] = (items || [])
                .map((it) => {
                    const id = it.id || it.videoId || it?.endpoint?.payload?.videoId;
                    const title =
                        it.title?.text ?? it.title ?? it?.headline?.text;
                    const seconds =
                        typeof it.duration === "number"
                            ? it.duration
                            : it.duration?.seconds ?? it.duration_seconds;
                    const channelTitle =
                        it.author?.name ||
                        it.channel?.name ||
                        it.owner?.name ||
                        it.short_byline_text?.text ||
                        it.owner_text?.text ||
                        "";
                    return id ? { videoId: String(id), title, seconds: typeof seconds === "number" ? seconds : undefined, channelTitle } : undefined;
                })
                .filter(Boolean) as YtItem[];
            return mapped;
        } catch {
            return [];
        }
    };

    const searchYts = async (q: string): Promise<YtItem[]> => {
        try {
            const r: any = await yts(q).catch(() => undefined);
            const vids: any[] = Array.isArray(r?.videos) ? r.videos : [];
            return vids.map(v => ({
                videoId: v.videoId,
                title: v.title,
                seconds: typeof v.seconds === "number" ? v.seconds : undefined
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

    // --- スコア付け ---
    const mkScore = (list: YtItem[], artistJP: string, artistEN?: string) => {
        const score = new Map<string, number>();
        for (let i = 0; i < list.length; i++) {
            const it = list[i];
            const base = list.length - i;
            const names = [
                ...artistJP.replace(/[\/:;¥*]/g, "").split(" "),
                ...(artistEN?.replace(/[\/:;¥*]/g, "").split(" ") || []),
            ].filter(Boolean);
            let bonus = 0;
            for (const name of names) {
                if (name.length > 1 && it.channelTitle && it.channelTitle.includes(name)) bonus += 10;
            }
            score.set(it.videoId, base + bonus);
        }
        return score;
    };

    const scoreMapJP = mkScore(jpList, jpArtist, enArtist);
    const scoreMapEN = mkScore(enList, jpArtist, enArtist);
    for (const vid of scoreMapJP.keys()) {
        const enScore = scoreMapEN.get(vid);
        if (enScore) scoreMapJP.set(vid, (scoreMapJP.get(vid) || 0) + enScore);
    }

    const filteredJP = jpList.filter(it => {
        if (typeof it.seconds !== "number") return false;
        const diffMs = Math.abs(it.seconds * 1000 - jpDurationMs);
        return diffMs < 6000;
    });
    if (filteredJP.length === 0) return fail("no candidates matched duration");

    filteredJP.sort((a, b) => (scoreMapJP.get(b.videoId) || 0) - (scoreMapJP.get(a.videoId) || 0));
    if (!filteredJP.length || !filteredJP[0]?.videoId) return fail("no selected candidate");

    const selectedVideoId = filteredJP[0].videoId;

    // --- JSONL キャッシュ追記（直前に再読込し videoId 重複ならスキップ） ---
    appendIfMissingByVideoIdSync({ videoId: selectedVideoId, appleMusicId: trackId });

    console.log(`[計測] appleMusicToYouTubeId(worker) 全体で ${((Date.now() - startTime) / 1000).toFixed(2)} 秒`);
    return selectedVideoId;
}

async function processSlice(data: Payload): Promise<SortedOut> {
    const { urls, start } = data;

    const settled = await Promise.allSettled(
        urls
            .filter(Boolean)
            .map((url, idx) =>
                appleMusicToYouTubeId(url).then((id) => ({
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
