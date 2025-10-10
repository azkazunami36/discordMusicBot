import fs from "fs";
import yts from "yt-search";
import { NicoSnapshotItem, searchNicoVideo } from "./niconico.js";
import { google, youtube_v3 } from "googleapis";
import { searchTweet, XPostInfo } from "./twitter.js";

export interface Playlist {
    type: "videoId" | "originalFileId" | "nicovideoId" | "twitterId";
    body: string;
    /** IDに含まれた動画または音声が複数個ある場合指定します。 */
    number?: number;
}
export interface OriginalFiles {
    id: string;
    callName: string;
    fileName: string;
}

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
    raw?: any;                   // nvapiの生データ保存用（将来の拡張に備える）
}

interface NicoChannelInfo {
    id: string;             // chNNNNNN形式
    url: string;            // https://ch.nicovideo.jp/<id> （正規化URL）
    name: string;           // OGから取得（必須）
    iconUrl: string;        // OGから取得（必須）
    source?: 'og';          // 取得元（将来拡張用）
    raw?: any;              // 予備（将来の解析用）
}

/** さまざまなデータをenv.jsonに保存します。 */
export class EnvData {
    /** サーバーIDです。 */
    guildId: string;
    constructor(guildId: string) { this.guildId = guildId; }
    #envJSON(name: string, body?: string): string | undefined {
        if (!fs.existsSync("env.json")) fs.writeFileSync("env.json", "{}");
        const json = JSON.parse(String(fs.readFileSync("env.json")));
        if (!json[this.guildId]) json[this.guildId] = {};
        if (body !== undefined) {
            json[this.guildId][name] = body;
            fs.writeFileSync("env.json", JSON.stringify(json, null, "    "));
        }
        return json[this.guildId][name];
    }
    /** プレイリストデータを保存します。 */
    playlistSave(playlist: Playlist[]) {
        this.#envJSON("playlist", JSON.stringify(playlist));
    }
    /** プレイリストデータを取得します。 */
    playlistGet() {
        const playlistJSONStr = this.#envJSON("playlist") || this.#envJSON("playlist", "[]");
        try {
            const playlist = JSON.parse(String(playlistJSONStr)) as Playlist[];
            playlist.forEach(playlistData => {
                if (!playlistData.type || playlistData.type !== "originalFileId" && playlistData.type !== "videoId" && playlistData.type !== "nicovideoId") throw "";
                if (!playlistData.body || typeof playlistData.body !== "string") throw "";
            })
            return playlist;
        } catch (e) {
            return JSON.parse(String(this.#envJSON("playlist", "[]"))) as Playlist[];
        }
    }
    /** オリジナルファイルに関する情報を保存します。 */
    originalFilesSave(originalFiles: OriginalFiles) {
        this.#envJSON("originalFiles", JSON.stringify(originalFiles));
    }
    /** オリジナルファイルに関する情報を取得します。 */
    originalFilesGet() {
        const originalFilesJSONStr = this.#envJSON("originalFiles") || this.#envJSON("originalFiles", "[]");
        try {
            const originalFiles = JSON.parse(String(originalFilesJSONStr)) as OriginalFiles[];
            originalFiles.forEach(originalFile => {
                if (!originalFile.callName || typeof originalFile.callName !== "string") throw "";
                if (!originalFile.fileName || typeof originalFile.fileName !== "string") throw "";
                if (!originalFile.id || typeof originalFile.id !== "string") throw "";
            })
            return originalFiles;
        } catch (e) {
            return JSON.parse(String(this.#envJSON("originalFiles", "[]"))) as OriginalFiles[];
        }
    }
    /** botが読み出されたチャンネルのIDです。 */
    get callchannelId() {
        return this.#envJSON("callchannelId");
    }
    set callchannelId(channelId: string | undefined) {
        this.#envJSON("callchannelId", channelId);
    }
    /** 音量です。 */
    get volume() {
        return Number(this.#envJSON("volume")) || Number(this.#envJSON("volume", "100"));
    }
    set volume(vol: number) {
        this.#envJSON("volume", String(vol));
    }
    /** 1はリピートオフ、2はリピートオン、3は１曲リピート */
    get playType() {
        const playType = this.#envJSON("playType");
        switch (playType) {
            case "1": return 1;
            case "2": return 2;
            case "3": return 3;
            default: {
                this.#envJSON("playType", "1");
                return 1;
            }
        }
    }
    set playType(type: 1 | 2 | 3) {
        this.#envJSON("playType", String(type));
    }
    /** 再生が切り替わった時に通知するかどうか。 */
    get changeTellIs() {
        if (Boolean(this.#envJSON("changeTellIs"))) return true;
        return false;
    }
    set changeTellIs(type: boolean) {
        this.#envJSON("changeTellIs", String(type));
    }
    /** 再生速度。 */
    set playTempo(speed: number) {
        this.#envJSON("playSpeed", String(speed));
    }
    get playTempo() {
        return Number(this.#envJSON("playSpeed") || 1);
    }
    set playPitch(speed: number) {
        this.#envJSON("playPitch", String(speed));
    }
    get playPitch() {
        return Number(this.#envJSON("playPitch") || 0);
    }
}

interface VideoInfoCache {
    youtube?: (yts.VideoMetadataResult | undefined)[];
    niconico?: (NicoSnapshotItem | undefined)[];
    youtubeUsers?: (youtube_v3.Schema$Channel | undefined)[];
    youtubeAliases?: Record<string, string>;
    niconicoUsers?: (NicoUserInfo | undefined)[];
    niconicoChannels?: (NicoChannelInfo | undefined)[];
    twitter?: (XPostInfo | undefined)[];
}

/** VideoIDに記録されている情報をキャッシュし、読み込めるようにするものです。 */
export class VideoMetaCache {
    constructor() {
        if (!fs.existsSync("videoInfoCache.json")) fs.writeFileSync("videoInfoCache.json", "{}");
    }
    // IDや既存の値から絶対URLを生成（生成できなければ undefined）
    private toAbsoluteUrl(input: string | undefined, sourceType: 'youtube' | 'niconico'): string | undefined {
        if (!input) return undefined;
        try {
            // すでに絶対URLならそのまま返す
            new URL(input);
            return input;
        } catch { /* not an absolute URL */ }

        if (sourceType === 'niconico') {
            if (/^(?:sm|nm|so)\d+$/i.test(input)) return `https://www.nicovideo.jp/watch/${input}`;
            if (/^\d+$/.test(input)) return `https://www.nicovideo.jp/user/${input}`;
            if (/^ch\d+$/i.test(input)) return `https://ch.nicovideo.jp/${input}`;
            return undefined;
        }
        if (sourceType === 'youtube') {
            if (/^[A-Za-z0-9_-]{11}$/.test(input)) return `https://youtu.be/${input}`;
            if (/^UC[0-9A-Za-z_-]+$/.test(input)) return `https://www.youtube.com/channel/${input}`;
            return undefined;
        }
        return undefined;
    }
    async youtubeInfoGet(videoId: string) {
        const json: VideoInfoCache = JSON.parse(String(fs.readFileSync("videoInfoCache.json")));
        if (!json.youtube) json.youtube = [];
        const data = json.youtube.find(data => data && data.videoId === videoId);
        if (data) return data;
        else {
            try {
                const result = await yts({
                    videoId,
                    hl: "ja",
                    gl: "JP"
                });
                json.youtube.push(result);
                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                return result;
            } catch (e) {
                return undefined;
            }
        }
    }
    async youtubeUserInfoGet(channelOrUrl: string) {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            console.error("[youtubeUserInfoGet] YOUTUBE_API_KEY is not set in environment variables");
        } else {
            // debug/info logging
            const isDebug = process.env.DEBUG_YT === '1';
            const info = (...args: any[]) => { if (isDebug) console.log(...args); };
            info("[youtubeUserInfoGet] Using YOUTUBE_API_KEY (length):", apiKey.length);
        }
        const isDebug = process.env.DEBUG_YT === '1';
        const info = (...args: any[]) => { if (isDebug) console.log(...args); };

        // Helper to detect quota errors
        function isQuotaError(err: any): boolean {
            try {
                const reason = err?.cause?.errors?.[0]?.reason || err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason;
                return reason === 'quotaExceeded' || (err?.code === 403 && /quota/i.test(String(err?.message)));
            } catch { return false; }
        }

        function normalizeUrlMaybe(input: string): string {
            // If it looks like a youtube domain but missing scheme, add https://
            if (/^(?:www\.)?youtube\.com\//i.test(input) || /^(?:www\.)?youtu\.be\//i.test(input)) {
                return `https://${input}`;
            }
            return input;
        }

        function parseChannelUrl(urlLike: string): { type: 'channel' | 'user' | 'custom' | 'handle', idOrName: string } | null {
            try {
                const parsedUrl = new URL(normalizeUrlMaybe(urlLike));
                const parts = parsedUrl.pathname.split('/').filter(Boolean);
                if (parts.length === 0) return null;
                if (parts[0] === 'channel' && parts[1]) return { type: 'channel', idOrName: parts[1] };
                if (parts[0] === 'user' && parts[1]) return { type: 'user', idOrName: parts[1] };
                if (parts[0] === 'c' && parts[1]) return { type: 'custom', idOrName: parts[1] };
                // handle form may be either /@handle or just path with @handle
                const handle = parts.find(p => p.startsWith('@')) || (parsedUrl.pathname.startsWith('/@') ? parts[0] : undefined);
                if (handle) return { type: 'handle', idOrName: handle };
                return null;
            } catch {
                return null;
            }
        }

        async function resolveChannelIdFromPage(input: string): Promise<string | undefined> {
            try {
                // Build a best-effort URL (handle/custom/channel accepted)
                let url = input;
                if (!/^(?:https?:)?\/\//i.test(url)) {
                    if (url.startsWith('@')) url = `https://www.youtube.com/${url}`;
                    else if (/^UC[0-9A-Za-z_-]+$/.test(url)) url = `https://www.youtube.com/channel/${url}`;
                    else url = `https://www.youtube.com/${url}`; // e.g. c/CustomName
                }
                // Force www + https for consistency
                url = url.replace(/^https?:\/\/youtube\.com\//i, 'https://www.youtube.com/');

                info('[youtubeUserInfoGet] resolveChannelIdFromPage fetching:', url);
                const res = await fetch(url, {
                    headers: {
                        'user-agent': 'Mozilla/5.0',
                        'accept-language': 'ja,en;q=0.8'
                    }
                });
                if (!res.ok) {
                    info('[youtubeUserInfoGet] resolveChannelIdFromPage HTTP', res.status);
                    return undefined;
                }
                const html = await res.text();
                // Try several robust patterns
                const m1 = html.match(/\"channelId\"\s*:\s*\"(UC[0-9A-Za-z_-]+)\"/);
                if (m1 && m1[1]) return m1[1];
                const m2 = html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[0-9A-Za-z_-]+)/);
                if (m2 && m2[1]) return m2[1];
                const m3 = html.match(/\"externalId\"\s*:\s*\"(UC[0-9A-Za-z_-]+)\"/);
                if (m3 && m3[1]) return m3[1];
                info('[youtubeUserInfoGet] resolveChannelIdFromPage: channelId not found');
                return undefined;
            } catch (e) {
                console.error('[youtubeUserInfoGet] resolveChannelIdFromPage error:', e);
                return undefined;
            }
        }

        // Scrape minimal snippet for a known channelId from the channel page
        async function resolveChannelSnippetFromPageById(id: string): Promise<{ title?: string; thumbnail?: string; customUrl?: string } | undefined> {
            try {
                const url = `https://www.youtube.com/channel/${id}`;
                const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'ja,en;q=0.8' } });
                if (!res.ok) {
                    info('[youtubeUserInfoGet] resolveChannelSnippetFromPageById HTTP', res.status);
                    return undefined;
                }
                const html = await res.text();
                // title from og:title first
                const mTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["'][^>]*>/i)
                    || html.match(/\"title\"\s*:\s*\"([^\"]+)\"/);
                const title = mTitle ? mTitle[1] : undefined;
                // thumbnail from og:image (simple and robust)
                const mThumb = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["'][^>]*>/i);
                const thumbnail = mThumb ? mThumb[1] : undefined;
                // customUrl from og:url or canonical
                const mCustom = html.match(/<meta\s+property=["']og:url["']\s+content=["']https?:\/\/www\.youtube\.com\/([^"']+)["'][^>]*>/i)
                    || html.match(/<link\s+rel=["']canonical["']\s+href=["']https?:\/\/www\.youtube\.com\/([^"']+)["'][^>]*>/i);
                const customUrl = mCustom ? mCustom[1] : undefined;
                return { title, thumbnail, customUrl };
            } catch (e) {
                console.error('[youtubeUserInfoGet] resolveChannelSnippetFromPageById error:', e);
                return undefined;
            }
        }

        let ytFallback: { channelId?: string; name?: string; image?: string; url?: string } | undefined;
        // --- Query normalization helpers for yt-search fallbacks ---
        function buildQueryVariants(raw: string): string[] {
            const out: string[] = [];
            const seen = new Set<string>();
            const add = (s?: string) => {
                if (!s) return;
                const v = s.trim();
                if (v.length === 0) return;
                if (!seen.has(v)) { seen.add(v); out.push(v); }
            };

            const trimmed = (raw || "").trim();
            let decoded: string | undefined = undefined;
            try {
                if (/%[0-9A-Fa-f]{2}/.test(trimmed)) {
                    decoded = decodeURIComponent(trimmed);
                }
            } catch { /* ignore */ }

            // Heuristic: looks like an ID/handle/custom path? then DO NOT suffix-strip.
            const looksLikeIdOrHandle = (s: string) => {
                if (!s) return false;
                if (/^@.+/.test(s)) return true;                // handle
                if (/^UC[0-9A-Za-z_-]+$/.test(s)) return true;   // channelId
                if (/\b(channel|user|c)\//i.test(s)) return true; // url-ish path
                return false;
            };

            // 1) Prefer decoded first (most reliable), then original
            if (decoded) add(decoded);
            add(trimmed);

            // 2) For each of the first two, add light normalizations (no suffix removal)
            const baseVariants = Array.from(out);
            for (const v of baseVariants) {
                add(v.replace(/_/g, ' '));
                add(v.replace(/[\s\u3000]+/g, ' ').trim());
            }

            // 3) Only if the input does NOT look like an ID/handle, add a few last-resort suffix-stripped variants
            //    These are tried **after** all safe forms above.
            if (!looksLikeIdOrHandle(decoded || trimmed)) {
                const candidates = Array.from(out);
                for (const v of candidates) {
                    // drop a short trailing token like -r3k / _abc (2-6 alnum)
                    const stripped = v.replace(/[-_][A-Za-z0-9]{2,6}$/i, '');
                    if (stripped !== v) add(stripped.trim());
                }
            }

            return out;
        }

        async function resolveChannelIdViaYtSearch(rawQuery: string, logLabel: string): Promise<{ channelId?: string; name?: string; image?: string; url?: string } | undefined> {
            const variants = buildQueryVariants(rawQuery);
            for (const q of variants) {
                try {
                    const r = await yts({ query: q, hl: 'ja', gl: 'JP' });
                    const ch = (r as any)?.channels?.[0];
                    if (ch?.channelId) return { channelId: ch.channelId, name: ch.name, image: ch.image, url: ch.url };
                    // If no channels, try deriving from first video result
                    const v = (r as any)?.videos?.[0];
                    if (v?.author?.channelID) return { channelId: v.author.channelID, name: v.author.name, image: v.author.bestAvatar?.url, url: v.author.url } as any;
                } catch (e) {
                    console.error(`[youtubeUserInfoGet] yt-search error in ${logLabel} for variant`, q, e);
                }
            }
            info(`[youtubeUserInfoGet] yt-search returned 0 channels for variants:`, variants);
            return undefined;
        }
        const json: VideoInfoCache = JSON.parse(String(fs.readFileSync("videoInfoCache.json")));
        if (!json.youtubeUsers) json.youtubeUsers = [];
        if (!json.youtubeAliases) json.youtubeAliases = {};

        let channelId: string | undefined = undefined;

        // --- Alias helpers ---
        const toAliasKey = (parsed: { type: 'channel' | 'user' | 'custom' | 'handle', idOrName: string } | null, raw: string): string[] => {
            const keys: string[] = [];
            const normRaw = raw.trim().toLowerCase();
            keys.push(normRaw);
            if (parsed) {
                if (parsed.type === 'channel') keys.push(parsed.idOrName);
                if (parsed.type === 'handle') keys.push(parsed.idOrName.toLowerCase());
                if (parsed.type === 'custom') keys.push(`c/${parsed.idOrName.toLowerCase()}`);
                if (parsed.type === 'user') keys.push(`user/${parsed.idOrName.toLowerCase()}`);
            } else if (/^UC[0-9A-Za-z_-]+$/.test(raw)) {
                keys.push(raw);
            }
            return Array.from(new Set(keys));
        };
        const findAliasChannelId = (keys: string[]): string | undefined => {
            for (const k of keys) {
                const hit = json.youtubeAliases![k];
                if (hit) return hit;
            }
            return undefined;
        };
        // Determine if input is a URL
        const looksLikeUrl = /^(?:https?:)?\/\//i.test(channelOrUrl) || /^(?:www\.)?youtube\.com\//i.test(channelOrUrl) || /^(?:www\.)?youtu\.be\//i.test(channelOrUrl);
        if (looksLikeUrl) {
            const parsed = parseChannelUrl(channelOrUrl);
            info("[youtubeUserInfoGet] Parsed URL input:", channelOrUrl, "=>", parsed);
            if (!parsed) return undefined;
            // Early alias lookup
            const aliasKeys = toAliasKey(parsed, channelOrUrl);
            const aliasHit = findAliasChannelId(aliasKeys);
            if (aliasHit) {
                channelId = aliasHit;
                const cached = json.youtubeUsers.find(data => data && data.id === channelId);
                if (cached) return cached;
                // If not cached, we will continue below to fetch details (but without any search calls)
            }
            const youtube = google.youtube("v3");
            try {
                if (parsed.type === 'channel') {
                    channelId = parsed.idOrName;
                    // Record aliases
                    const keys = toAliasKey(parsed, channelOrUrl);
                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                } else if (parsed.type === 'user') {
                    // Resolve legacy username to channelId (note: forUsername is effectively legacy and may return empty)
                    const res = await youtube.channels.list({
                        key: apiKey,
                        forUsername: parsed.idOrName,
                        part: ['id'],
                    });
                    info("[youtubeUserInfoGet] channels.list(forUsername) status: items=", res.data.items?.length || 0);
                    if (!res.data.items || res.data.items.length === 0) return undefined;
                    channelId = res.data.items[0].id || undefined;
                    // Record aliases
                    const keys = toAliasKey(parsed, channelOrUrl);
                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                } else if (parsed.type === 'custom' || parsed.type === 'handle') {
                    // Search by custom url path or handle. For handle, strip leading '@' as Search API matches better without it.
                    try {
                        const query = parsed.type === 'handle' ? parsed.idOrName.replace(/^@/, '') : parsed.idOrName;
                        const res = await youtube.search.list({
                            key: apiKey,
                            q: query,
                            type: ['channel'],
                            part: ['snippet'],
                            maxResults: 1,
                        });
                        info("[youtubeUserInfoGet] search.list(q=", query, ") items=", res.data.items?.length || 0);
                        if (!res.data.items || res.data.items.length === 0) return undefined;
                        channelId = res.data.items[0].snippet?.channelId || undefined;
                        // Record aliases
                        const keys = toAliasKey(parsed, channelOrUrl);
                        keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                        fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                    } catch (e) {
                        if (isQuotaError(e)) {
                            info('[youtubeUserInfoGet] quotaExceeded on search.list — falling back to yt-search');
                            const fall = await resolveChannelIdViaYtSearch(parsed.type === 'handle' ? parsed.idOrName.replace(/^@/, '') : parsed.idOrName, 'URL-handle/custom');
                            if (fall?.channelId) {
                                channelId = fall.channelId;
                                ytFallback = fall;
                                const keys = toAliasKey(parsed, channelOrUrl);
                                keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                            }
                            if (!channelId) {
                                const pageInput = parsed.type === 'handle' ? parsed.idOrName : `c/${parsed.idOrName}`;
                                const cid = await resolveChannelIdFromPage(pageInput);
                                if (cid) {
                                    info('[youtubeUserInfoGet] resolved via page scrape:', cid);
                                    channelId = cid;
                                    const keys = toAliasKey(parsed, channelOrUrl);
                                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                                }
                            }
                            if (!channelId) return undefined;
                        } else {
                            console.error("[youtubeUserInfoGet] Error while resolving URL to channelId:", e);
                            return undefined;
                        }
                    }
                }
            } catch (e) {
                console.error("[youtubeUserInfoGet] Error while resolving URL to channelId:", e);
                return undefined;
            }
        } else {
            // Non-URL branch
            const parsedForAlias = parseChannelUrl(channelOrUrl);
            const aliasKeys2 = toAliasKey(parsedForAlias, channelOrUrl);
            const aliasHit2 = findAliasChannelId(aliasKeys2);
            if (aliasHit2) {
                channelId = aliasHit2;
                const cached = json.youtubeUsers.find(data => data && data.id === channelId);
                if (cached) return cached;
                // fallthrough to details fetch if not cached
            }
            // Assume direct channelId or handle-like string
            if (/^UC[0-9A-Za-z_-]+$/.test(channelOrUrl)) {
                channelId = channelOrUrl;
                // Record aliases
                const keys = toAliasKey(parsedForAlias, channelOrUrl);
                keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
            } else if (channelOrUrl.startsWith('@')) {
                // Resolve handle to channel via search
                const youtube = google.youtube("v3");
                const query = channelOrUrl.replace(/^@/, '');
                try {
                    const res = await youtube.search.list({
                        key: apiKey,
                        q: query,
                        type: ['channel'],
                        part: ['snippet'],
                        maxResults: 1,
                    });
                    info("[youtubeUserInfoGet] search.list(handle) items=", res.data.items?.length || 0);
                    if (!res.data.items || res.data.items.length === 0) return undefined;
                    channelId = res.data.items[0].snippet?.channelId || undefined;
                    // Record aliases
                    const keys = toAliasKey(parsedForAlias, channelOrUrl);
                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                } catch (e) {
                    if (isQuotaError(e)) {
                        info('[youtubeUserInfoGet] quotaExceeded on search.list(handle) — falling back to yt-search');
                        const fall = await resolveChannelIdViaYtSearch(query, 'handle');
                        if (fall?.channelId) {
                            channelId = fall.channelId;
                            ytFallback = fall;
                            const keys = toAliasKey(parsedForAlias, channelOrUrl);
                            keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                            fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                        }
                        if (!channelId) {
                            const cid = await resolveChannelIdFromPage(channelOrUrl);
                            if (cid) {
                                info('[youtubeUserInfoGet] resolved via page scrape (handle):', cid);
                                channelId = cid;
                                const keys = toAliasKey(parsedForAlias, channelOrUrl);
                                keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                            }
                        }
                        if (!channelId) return undefined;
                    } else {
                        console.error("[youtubeUserInfoGet] Error resolving handle via search:", e);
                        return undefined;
                    }
                }
            } else {
                // As a fallback, try searching the string as a channel name
                const youtube = google.youtube("v3");
                try {
                    const res = await youtube.search.list({
                        key: apiKey,
                        q: channelOrUrl,
                        type: ['channel'],
                        part: ['snippet'],
                        maxResults: 1,
                    });
                    info("[youtubeUserInfoGet] search.list(fallback) items=", res.data.items?.length || 0);
                    if (!res.data.items || res.data.items.length === 0) return undefined;
                    channelId = res.data.items[0].snippet?.channelId || undefined;
                    // Record aliases
                    const keys = toAliasKey(parsedForAlias, channelOrUrl);
                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                } catch (e) {
                    if (isQuotaError(e)) {
                        info('[youtubeUserInfoGet] quotaExceeded on search.list(fallback) — falling back to yt-search');
                        const fall = await resolveChannelIdViaYtSearch(channelOrUrl, 'name-fallback');
                        if (fall?.channelId) {
                            channelId = fall.channelId;
                            ytFallback = fall;
                            const keys = toAliasKey(parsedForAlias, channelOrUrl);
                            keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                            fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                        }
                        if (!channelId) {
                            const cid = await resolveChannelIdFromPage(channelOrUrl);
                            if (cid) {
                                info('[youtubeUserInfoGet] resolved via page scrape (name):', cid);
                                channelId = cid;
                                const keys = toAliasKey(parsedForAlias, channelOrUrl);
                                keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                            }
                        }
                        if (!channelId) return undefined;
                    } else {
                        console.error("[youtubeUserInfoGet] Error in fallback search:", e);
                        return undefined;
                    }
                }
            }
        }

        if (!channelId) {
            console.warn("[youtubeUserInfoGet] channelId could not be resolved.");
            return undefined;
        }

        const cached = json.youtubeUsers.find(data => data && data.id === channelId);
        if (cached) {
            info("[youtubeUserInfoGet] Cache hit for channelId:", channelId);
            return cached;
        }

        const youtube = google.youtube("v3");
        try {
            const res = await youtube.channels.list({
                key: apiKey,
                id: [channelId],
                part: ['snippet', 'statistics'],
                hl: 'ja'
            });
            const count = res.data.items?.length || 0;
            info("[youtubeUserInfoGet] channels.list(id) items=", count);
            if (!res.data.items || count === 0) return undefined;
            const channel = res.data.items[0];
            if (channel.id !== channelId) {
                console.warn("[youtubeUserInfoGet] Returned channel id does not match requested:", { requested: channelId, returned: channel.id });
                return undefined;
            }
            json.youtubeUsers.push(channel);
            fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
            return channel;
        } catch (e) {
            if (isQuotaError(e) && channelId) {
                // Prefer ytFallback when available
                if (ytFallback?.channelId === channelId) {
                    console.warn('[youtubeUserInfoGet] quotaExceeded on channels.list — returning minimal channel from yt-search');
                    const minimal: youtube_v3.Schema$Channel = {
                        kind: 'youtube#channel',
                        id: channelId,
                        snippet: {
                            title: ytFallback.name || undefined,
                            customUrl: ytFallback.url?.replace(/^https?:\/\/www\.youtube\.com\//, ''),
                            thumbnails: ytFallback.image ? {
                                default: { url: ytFallback.image },
                                high: { url: ytFallback.image }
                            } : undefined
                        }
                    } as any;
                    json.youtubeUsers.push(minimal);
                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                    return minimal;
                }
                // Otherwise, scrape the channel page by id to synthesize minimal snippet
                info('[youtubeUserInfoGet] quotaExceeded on channels.list — falling back to page scrape by id');
                const meta = await resolveChannelSnippetFromPageById(channelId);
                const minimal: youtube_v3.Schema$Channel = {
                    kind: 'youtube#channel',
                    id: channelId,
                    snippet: {
                        title: meta?.title || undefined,
                        customUrl: meta?.customUrl,
                        thumbnails: meta?.thumbnail ? {
                            default: { url: meta.thumbnail },
                            high: { url: meta.thumbnail }
                        } : undefined
                    }
                } as any;
                json.youtubeUsers.push(minimal);
                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                return minimal;
            }
            console.error("[youtubeUserInfoGet] Error fetching channel details:", e);
            return undefined;
        }
    }
    async niconicoInfoGet(contentId: string) {
        const json: VideoInfoCache = JSON.parse(String(fs.readFileSync("videoInfoCache.json")));
        if (!json.niconico) json.niconico = [];
        const data = json.niconico.find(data => data && data.contentId === contentId);
        if (data) return data
        else {
            const result = await searchNicoVideo(contentId);
            if (result && result[0]) {
                json.niconico.push(result[0]);
                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                return result[0];
            }
        }
    }
    async niconicoUserInfoGet(userIdOrUrl: string) {
        try {
            let userId: string | undefined = undefined;
            try {
                const url = new URL(userIdOrUrl);
                const match = url.pathname.match(/\/user\/(\d+)/);
                if (match) {
                    userId = match[1];
                }
            } catch {
                // Not a URL, maybe a plain userId
                if (/^\d+$/.test(userIdOrUrl)) {
                    userId = userIdOrUrl;
                }
            }
            if (!userId) {
                console.error("[niconicoUserInfoGet] ユーザーID/URLの解析に失敗しました:", userIdOrUrl);
                return undefined;
            }
            const json: VideoInfoCache = JSON.parse(String(fs.readFileSync("videoInfoCache.json")));
            if (!json.niconicoUsers) json.niconicoUsers = [];
            const cached = json.niconicoUsers.find(info => info && info.id === userId);
            if (cached) return cached;
            const userUrl = `https://www.nicovideo.jp/user/${userId}`;

            // 1) Try nvapi first（成功時は name と iconUrl が揃っているかを確認）
            try {
                const nv = await fetch(`https://nvapi.nicovideo.jp/v1/users/${userId}/profile`, {
                    headers: {
                        'X-Frontend-Id': '70',
                        'X-Frontend-Version': '0',
                        'User-Agent': 'Mozilla/5.0'
                    }
                });
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
                        json.niconicoUsers.push(info);
                        fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                        return info;
                    } else {
                        console.error("[niconicoUserInfoGet] nvapiは応答したが name/iconUrl が欠落: ", { nameNv, iconNv });
                    }
                } else {
                    console.error(`[niconicoUserInfoGet] nvapi応答エラー: HTTP ${nv.status}`);
                }
            } catch (e) {
                console.error('[niconicoUserInfoGet] nvapi取得中に例外が発生:', e);
            }

            let response: Response;
            try {
                response = await fetch(userUrl);
                if (!response.ok) {
                    console.error(`[niconicoUserInfoGet] ユーザーページの取得に失敗しました: HTTP ${response.status}`);
                    return undefined;
                }
            } catch (e) {
                console.error("[niconicoUserInfoGet] ユーザーページの取得中にエラーが発生しました:", e);
                return undefined;
            }
            const html = await response.text();
            let name: string | undefined = undefined;
            let iconUrl: string | undefined = undefined;
            // name: try og:title meta tag first
            const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']\s*\/?>/i);
            if (ogTitleMatch) {
                name = ogTitleMatch[1];
            } else {
                // fallback to title tag
                const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch) {
                    name = titleMatch[1];
                }
            }
            if (name) {
                // strip trailing common suffix like さんのユーザーページ
                name = name.replace(/さんのユーザーページ$/, '').trim();
            }
            // iconUrl: og:image meta tag
            const ogImageMatch = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']\s*\/?>/i);
            if (ogImageMatch) {
                iconUrl = ogImageMatch[1];
            }

            if (!name || !iconUrl) {
                console.error("[niconicoUserInfoGet] OGメタから name/iconUrl が取得できませんでした", { name, iconUrl });
                return undefined;
            }

            const info: NicoUserInfo = {
                id: userId,
                url: userUrl,
                name: String(name),
                iconUrl: String(iconUrl),
                source: 'og'
            };
            json.niconicoUsers.push(info);
            fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
            return info;
        } catch (e) {
            console.error("[niconicoUserInfoGet] 処理中にエラーが発生しました:", e);
            return undefined;
        }
    }
    async niconicoChannelInfoGet(channelIdOrUrl: string) {
        try {
            // 1) channelId 抽出（ch123456 のみ対応） or URLから抽出
            let channelId: string | undefined;
            try {
                const url = new URL(channelIdOrUrl);
                // ch.nicovideo.jp/ch123456 または /channel/ch123456 に対応
                const m1 = url.pathname.match(/\/(?:channel\/)?(ch\d+)/);
                if (m1) channelId = m1[1];
            } catch {
                // Not a URL, maybe plain channel id
                const m2 = channelIdOrUrl.match(/^ch\d+$/i);
                if (m2) channelId = m2[0];
            }
            if (!channelId) {
                console.error("[niconicoChannelInfoGet] チャンネルID/URLの解析に失敗しました:", channelIdOrUrl);
                return undefined;
            }

            // 2) キャッシュ読み込み
            const json: VideoInfoCache = JSON.parse(String(fs.readFileSync("videoInfoCache.json")));
            if (!json.niconicoChannels) json.niconicoChannels = [];
            const cached = json.niconicoChannels.find(info => info && info.id.toLowerCase() === channelId!.toLowerCase());
            if (cached) return cached;

            // 3) チャンネルページ取得（OGメタを解析）
            const chUrl = `https://ch.nicovideo.jp/${channelId}`;
            let response: Response;
            try {
                response = await fetch(chUrl);
                if (!response.ok) {
                    // 別ルート: /channel/chNNNNNN も試す
                    const altUrl = `https://ch.nicovideo.jp/channel/${channelId}`;
                    const altRes = await fetch(altUrl);
                    if (altRes.ok) {
                        response = altRes as any;
                    } else {
                        console.error(`[niconicoChannelInfoGet] チャンネルページの取得に失敗しました: HTTP ${response.status} / ${altRes.status}`);
                        return undefined;
                    }
                }
            } catch (e) {
                console.error("[niconicoChannelInfoGet] チャンネルページ取得中にエラーが発生しました:", e);
                return undefined;
            }

            const html = await response.text();
            let name: string | undefined;
            let iconUrl: string | undefined;

            // og:title
            const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']\s*\/?>/i);
            if (ogTitleMatch) {
                name = ogTitleMatch[1].trim();
            } else {
                const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch) name = titleMatch[1].trim();
            }
            // og:image
            const ogImageMatch = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']\s*\/?>/i);
            if (ogImageMatch) {
                iconUrl = ogImageMatch[1].trim();
            }

            if (!name || !iconUrl) {
                console.error("[niconicoChannelInfoGet] OGメタから name/iconUrl が取得できませんでした", { name, iconUrl });
                return undefined;
            }

            const info: NicoChannelInfo = {
                id: channelId,
                url: chUrl,
                name,
                iconUrl,
                source: 'og',
                raw: { from: 'og' }
            };
            json.niconicoChannels.push(info);
            fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
            return info;
        } catch (e) {
            console.error("[niconicoChannelInfoGet] 処理中にエラーが発生しました:", e);
            return undefined;
        }
    }

    async twitterInfoGet(tweetId: string) {
        const json: VideoInfoCache = JSON.parse(String(fs.readFileSync("videoInfoCache.json")));
        if (!json.twitter) json.twitter = [];
        const data = json.twitter.find(data => data && data.id === tweetId);
        if (data) return data;
        else {
            try {
                const result = await searchTweet(tweetId, true);
                if (result === undefined) return;
                json.twitter.push(result);
                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                return result;
            } catch (e) {
                return undefined;
            }
        }
    }

    async cacheGet(data: Playlist): Promise<CacheGetReturn | undefined> {
        if (data.type === "videoId") {
            const body = await this.youtubeInfoGet(data.body);
            const url = this.toAbsoluteUrl(data.body, "youtube");
            return {
                type: "videoId",
                body,
                url,
                sourceType: "youtube"
            };
        }
        if (data.type === "nicovideoId") {
            const body = await this.niconicoInfoGet(data.body);
            const url = this.toAbsoluteUrl(data.body, "niconico");
            return {
                type: "nicovideoId",
                body,
                url,
                sourceType: "niconico"
            };
        }
        if (data.type === "twitterId") {
            const body = await this.twitterInfoGet(data.body);
            return {
                type: "tweetId",
                body,
                url: body ? "https://x.com/i/web/status/" + body.id : undefined,
                sourceType: "twitter"
            }
        }
    }
}
export type CacheGetReturn = {
    type: "videoId";
    body: yts.VideoMetadataResult | undefined;
    url?: string;                // 正規化済みの絶対URL（生成できない場合は undefined）
    sourceType: "youtube";
} | {
    type: "nicovideoId";
    body: NicoSnapshotItem | undefined;
    url?: string;                // 正規化済みの絶対URL（生成できない場合は undefined）
    sourceType: "niconico";
} | {
    type: "tweetId";
    body: XPostInfo | undefined;
    url?: string;
    sourceType: "twitter"
};

