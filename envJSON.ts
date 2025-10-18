import fs from "fs";
import yts from "yt-search";
import { NicoSnapshotItem, searchNicoVideo } from "./niconico.js";
// ↑ 依存はそのまま。以下、挙動改善・バグ修正の差分のみ
import { google, youtube_v3 } from "googleapis";
import { searchTweet, XPostInfo } from "./twitter.js";
import * as youtubei from "youtubei.js";
import { getCookiesPromised } from "chrome-cookies-secure";

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
    /** キューデータを保存します。 */
    playlistSave(playlist: Playlist[]) {
        this.#envJSON("playlist", JSON.stringify(playlist));
    }
    /** キューデータを取得します。 */
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
        if (this.#envJSON("changeTellIs") === "true") return true;
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

export class AlbumInfo {
    constructor() { }
    #readJSON(): {
        /** MusicBrainz用に予約しています。 */
        release?: {};
        /** MusicBrainz用に予約しています。 */
        artist?: {};
        /** MusicBrainz用に予約しています。 */
        recording?: {};
        /** 
         * 曲に対しての情報です。関連性を保証します。  
         * Mainとそうでないものの違いは、優先度や置換時に選ばれるかどうかです。Mainにあるものが圧倒的に優先されて返されます。
         * 
         * また、MainではないほうにたくさんIDを入れると、間違ったIDを修正する役割にもなります。例えば、YouTubeの検索で似たような別の作者が用意した動画などはここで補正することができます。
         */
        musics?: {
            /**
             * ここにはこの曲と全く同じである動画を入れます。非公式でも構いません。
             */
            videoIds?: string[];
            /** 
             * ここには公式の曲を入れます。
             */
            mainVideoId?: string;
            /**
             * ここにはこの曲と全く同じである動画を入れます。非公式でも構いません。
             */
            nicovideoIds?: string[];
            /** 
             * ここには公式の曲を入れます。
             */
            mainNicovideoId: string;
            /**
             * ここには関連するMusicBrainzのRecording IDを入れます。関連するならどれでも構いません。
             */
            recordings?: string[];
            /**
             * ここにはメインで使いたいMusicBrainzのRecording IDを入れます。Main Recording IDと合わせてください。
             */
            mainRecording?: string;
            /** 
             * ここには関連するMusicBrainzのRelease IDを入れます。関連するならどれでもかまいません。
             */
            releases?: string[];
            /**
             * ここにはメインで使いたいMusicBrainzのRelease IDを入れます。Main Recording IDと合わせてください。
             */
            mainRelease?: string;
            /**
             * ここには関連する曲のIDを入れます。関連するならどれでも構いません。
             */
            appleMusicIds?: string[];
            /**
             * ここにはメインで使いたい曲のIDを入れます。
             */
            mainAppleMusicId?: string;
            /**
             * ここには関連する曲のIDを入れます。関連するならどれでも構いません。
             */
            spotifyIds?: string[];
            /**
             * ここにはメインで使いたい曲のIDを入れます。
             */
            mainSpotifyId?: string;
        }[];
        /** 非推奨。これは消します。この内容をmusicsにコピーします。 */
        youtubeLink?: {
            videoId?: {
                [videoId: string]: {
                    recording?: string;
                    release?: string;
                    appleMusicId?: string;
                    spotifyId?: string;
                } | undefined;
            }
        }
    } {
        if (!fs.existsSync("./albumInfo.json")) fs.writeFileSync("./albumInfo.json", "{}");
        try {
            return JSON.parse(String(fs.readFileSync("./albumInfo.json")));
        } catch {
            fs.writeFileSync("./albumInfo.json", "{}");
            console.warn("albumInfo.jsonが破損していたため、内容を削除し1から生成しました。");
            return {};
        }
    }
    /** IDをリンクします。入力されたIDが存在するものだったりすると、結合されたりします。 */
    linkId(data: {
        /**
         * ここにはこの曲と全く同じである動画を入れます。非公式でも構いません。
         */
        videoIds?: string[];
        /**
         * ここにはこの曲と全く同じである動画を入れます。非公式でも構いません。
         */
        nicovideoIds?: string[];
        /**
         * ここには関連するMusicBrainzのRecording IDを入れます。関連するならどれでも構いません。
         */
        recordings?: string[];
        /** 
         * ここには関連するMusicBrainzのRelease IDを入れます。関連するならどれでもかまいません。
         */
        releases?: string[];
        /**
         * ここには関連する曲のIDを入れます。関連するならどれでも構いません。
         */
        appleMusicIds?: string[];
        /**
         * ここには関連する曲のIDを入れます。関連するならどれでも構いません。
         */
        spotifyIds?: string[];
    }) { }
}

interface VideoInfoCache {
    youtube?: (yts.VideoMetadataResult | undefined)[];
    youtubeThumbnail?: { videoId: string; thumbnailUrl: string; }[];
    niconico?: (NicoSnapshotItem | undefined)[];
    youtubeUsers?: (youtube_v3.Schema$Channel | undefined)[];
    youtubeAliases?: Record<string, string>;
    niconicoUsers?: (NicoUserInfo | undefined)[];
    niconicoChannels?: (NicoChannelInfo | undefined)[];
    twitter?: (XPostInfo | undefined)[];
    /** Spotify track/playlist to YouTube video mapping cache */
    spotifyToYouTube?: { spotifyId: string; videoId: string }[];
    /** Apple Music song to YouTube video mapping cache */
    appleMusicToYouTube?: { appleId: string; videoId: string }[];
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
            // （エラー出力は削除）鍵が未設定でも極力フォールバックで進む
        } else {
            // debug/info logging（DEBUG_YT=1 の時だけ動く簡易ロガーは残します）
            const isDebug = process.env.DEBUG_YT === '1';
            const info = (...args: any[]) => { if (isDebug) console.log(...args); };
            info("[youtubeUserInfoGet] Using YOUTUBE_API_KEY (length):", apiKey.length);
        }
        // Add debug log helper（上の isDebug/info を常時使えるよう再定義）
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
                const handle = parts.find(p => p.startsWith('@')) || (parsedUrl.pathname.startsWith('/@') ? parts[0] : undefined);
                if (handle) return { type: 'handle', idOrName: handle };
                return null;
            } catch {
                return null;
            }
        }

        async function resolveChannelIdFromPage(input: string): Promise<string | undefined> {
            try {
                let url = input;
                if (!/^(?:https?:)?\/\//i.test(url)) {
                    if (url.startsWith('@')) url = `https://www.youtube.com/${url}`;
                    else if (/^UC[0-9A-Za-z_-]+$/.test(url)) url = `https://www.youtube.com/channel/${url}`;
                    else url = `https://www.youtube.com/${url}`;
                }
                url = url.replace(/^https?:\/\/youtube\.com\//i, 'https://www.youtube.com/');
                const res = await fetch(url, {
                    headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'ja,en;q=0.8' },
                    redirect: 'follow' as any
                });
                if (!res.ok) return undefined;

                const finalUrl = (res as any).url as string | undefined;
                const html = await res.text();
                const m1 = html.match(/\\"channelId\\"\s*:\s*\\"(UC[0-9A-Za-z_-]+)\\"/);
                const m2 = html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[0-9A-Za-z_-]+)/);
                const m3 = html.match(/\\"externalId\\"\s*:\s*\\"(UC[0-9A-Za-z_-]+)\\"/);
                const mFinal = finalUrl ? finalUrl.match(/\/channel\/(UC[0-9A-Za-z_-]+)/) : null;

                let best: string | undefined;
                if (m2?.[1] && m3?.[1] && m2[1] === m3[1]) best = m2[1];
                else if (mFinal?.[1]) best = mFinal[1];
                else if (m1?.[1]) best = m1[1];
                else if (m2?.[1]) best = m2[1];
                else if (m3?.[1]) best = m3[1];

                return best;
            } catch {
                return undefined;
            }
        }

        async function resolveChannelSnippetFromPageById(id: string): Promise<{ title?: string; thumbnail?: string; customUrl?: string } | undefined> {
            try {
                const url = `https://www.youtube.com/channel/${id}`;
                const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'ja,en;q=0.8' } });
                if (!res.ok) return undefined;
                const html = await res.text();
                const mTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["'][^>]*>/i) || html.match(/\"title\"\s*:\s*\"([^\"]+)\"/);
                const title = mTitle ? mTitle[1] : undefined;
                const mThumb = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["'][^>]*>/i);
                const thumbnail = mThumb ? mThumb[1] : undefined;
                const mCustom = html.match(/<meta\s+property=["']og:url["']\s+content=["']https?:\/\/www\.youtube\.com\/([^"']+)["'][^>]*>/i)
                    || html.match(/<link\s+rel=["']canonical["']\s+href=["']https?:\/\/www\.youtube\.com\/([^"']+)["'][^>]*>/i);
                const customUrl = mCustom ? mCustom[1] : undefined;
                return { title, thumbnail, customUrl };
            } catch {
                return undefined;
            }
        }

        let ytFallback: { channelId?: string; name?: string; image?: string; url?: string } | undefined;

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
                if (/%[0-9A-Fa-f]{2}/.test(trimmed)) decoded = decodeURIComponent(trimmed);
            } catch { /* ignore */ }

            const looksLikeIdOrHandle = (s: string) => {
                if (!s) return false;
                if (/^@.+/.test(s)) return true;
                if (/^UC[0-9A-Za-z_-]+$/.test(s)) return true;
                if (/\b(channel|user|c)\//i.test(s)) return true;
                return false;
            };

            if (decoded) add(decoded);
            add(trimmed);

            const baseVariants = Array.from(out);
            for (const v of baseVariants) {
                add(v.replace(/_/g, ' '));
                add(v.replace(/[\s\u3000]+/g, ' ').trim());
            }

            if (!looksLikeIdOrHandle(decoded || trimmed)) {
                const candidates = Array.from(out);
                for (const v of candidates) {
                    const stripped = v.replace(/[-_][A-Za-z0-9]{2,6}$/i, '');
                    if (stripped !== v) add(stripped.trim());
                }
            }
            return out;
        }

        async function resolveChannelIdViaYtSearch(rawQuery: string, _label: string): Promise<{ channelId?: string; name?: string; image?: string; url?: string } | undefined> {
            const variants = buildQueryVariants(rawQuery);
            for (const q of variants) {
                try {
                    const r = await yts({ query: q, hl: 'ja', gl: 'JP' });
                    const ch = (r as any)?.channels?.[0];
                    if (ch?.channelId) return { channelId: ch.channelId, name: ch.name, image: ch.image, url: ch.url };
                    const v = (r as any)?.videos?.[0];
                    if (v?.author?.channelID) {
                        return { channelId: v.author.channelID, name: v.author.name, image: v.author.bestAvatar?.url, url: v.author.url } as any;
                    }
                } catch { /* ignore single variant errors */ }
            }
            return undefined;
        }

        const json: VideoInfoCache = JSON.parse(String(fs.readFileSync("videoInfoCache.json")));
        if (!json.youtubeUsers) json.youtubeUsers = [];
        if (!json.youtubeAliases) json.youtubeAliases = {};

        let channelId: string | undefined;

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

        const looksLikeUrl = /^(?:https?:)?\/\//i.test(channelOrUrl) || /^(?:www\.)?youtube\.com\//i.test(channelOrUrl) || /^(?:www\.)?youtu\.be\//i.test(channelOrUrl);

        if (looksLikeUrl) {
            const parsed = parseChannelUrl(channelOrUrl);
            if (!parsed) return undefined;

            const aliasKeys = toAliasKey(parsed, channelOrUrl);
            const aliasHit = findAliasChannelId(aliasKeys);
            if (aliasHit) {
                channelId = aliasHit;
                const cached = json.youtubeUsers.find(data => data && data.id === channelId);
                if (cached) return cached;
            }

            const youtube = google.youtube("v3");
            try {
                if (parsed.type === 'channel') {
                    channelId = parsed.idOrName;
                    const keys = toAliasKey(parsed, channelOrUrl);
                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                } else if (parsed.type === 'user') {
                    const res = await youtube.channels.list({ key: apiKey, forUsername: parsed.idOrName, part: ['id'] });
                    if (!res.data.items || res.data.items.length === 0) return undefined;
                    channelId = res.data.items[0].id || undefined;
                    const keys = toAliasKey(parsed, channelOrUrl);
                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                } else if (parsed.type === 'custom' || parsed.type === 'handle') {
                    let resolvedChannelId: string | undefined = undefined;
                    if (parsed.type === 'handle') resolvedChannelId = await resolveChannelIdFromPage(parsed.idOrName);
                    else resolvedChannelId = await resolveChannelIdFromPage(`c/${parsed.idOrName}`);

                    if (resolvedChannelId) {
                        channelId = resolvedChannelId;
                        const keys = toAliasKey(parsed, channelOrUrl);
                        keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                        fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                    } else {
                        try {
                            const query = parsed.type === 'handle' ? parsed.idOrName.replace(/^@/, '') : parsed.idOrName;
                            const res = await youtube.search.list({ key: apiKey, q: query, type: ['channel'], part: ['snippet'], maxResults: 1 });
                            if (!res.data.items || res.data.items.length === 0) return undefined;
                            channelId = res.data.items[0].snippet?.channelId || undefined;
                            const keys = toAliasKey(parsed, channelOrUrl);
                            keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                            fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                        } catch (e) {
                            if (isQuotaError(e)) {
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
                                        channelId = cid;
                                        const keys = toAliasKey(parsed, channelOrUrl);
                                        keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                                        fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                                    }
                                }
                                if (!channelId) return undefined;
                            } else {
                                return undefined;
                            }
                        }
                    }
                }
            } catch {
                return undefined;
            }
        } else {
            const parsedForAlias = parseChannelUrl(channelOrUrl);
            const aliasKeys2 = toAliasKey(parsedForAlias, channelOrUrl);
            const aliasHit2 = findAliasChannelId(aliasKeys2);
            if (aliasHit2) {
                channelId = aliasHit2;
                const cached = json.youtubeUsers.find(data => data && data.id === channelId);
                if (cached) return cached;
            }
            if (/^UC[0-9A-Za-z_-]+$/.test(channelOrUrl)) {
                channelId = channelOrUrl;
                const keys = toAliasKey(parsedForAlias, channelOrUrl);
                keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
            } else if (channelOrUrl.startsWith('@')) {
                const cidByPage = await resolveChannelIdFromPage(channelOrUrl);
                if (cidByPage) {
                    channelId = cidByPage;
                    const keys = toAliasKey(parsedForAlias, channelOrUrl);
                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                } else {
                    const youtube = google.youtube("v3");
                    const query = channelOrUrl.replace(/^@/, '');
                    try {
                        const res = await youtube.search.list({ key: apiKey, q: query, type: ['channel'], part: ['snippet'], maxResults: 1 });
                        if (!res.data.items || res.data.items.length === 0) return undefined;
                        channelId = res.data.items[0].snippet?.channelId || undefined;
                        const keys = toAliasKey(parsedForAlias, channelOrUrl);
                        keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                        fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                    } catch (e) {
                        if (isQuotaError(e)) {
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
                                    channelId = cid;
                                    const keys = toAliasKey(parsedForAlias, channelOrUrl);
                                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                                }
                            }
                            if (!channelId) return undefined;
                        } else {
                            return undefined;
                        }
                    }
                }
            } else {
                const youtube = google.youtube("v3");
                try {
                    const res = await youtube.search.list({ key: apiKey, q: channelOrUrl, type: ['channel'], part: ['snippet'], maxResults: 1 });
                    if (!res.data.items || res.data.items.length === 0) return undefined;
                    channelId = res.data.items[0].snippet?.channelId || undefined;
                    const keys = toAliasKey(parsedForAlias, channelOrUrl);
                    keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                    fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                } catch (e) {
                    if (isQuotaError(e)) {
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
                                channelId = cid;
                                const keys = toAliasKey(parsedForAlias, channelOrUrl);
                                keys.forEach(k => { json.youtubeAliases![k] = channelId!; });
                                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                            }
                        }
                        if (!channelId) return undefined;
                    } else {
                        return undefined;
                    }
                }
            }
        }

        if (!channelId) return undefined;

        const cached = json.youtubeUsers.find(data => data && data.id === channelId);
        if (cached) return cached;

        const youtube = google.youtube("v3");
        try {
            const res = await youtube.channels.list({
                key: apiKey,
                id: [channelId],
                part: ['snippet', 'statistics'],
                hl: 'ja'
            });
            const count = res.data.items?.length || 0;
            if (!res.data.items || count === 0) return undefined;
            const channel = res.data.items[0];
            if (channel.id !== channelId) return undefined;
            json.youtubeUsers.push(channel);
            fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
            return channel;
        } catch (e) {
            if (isQuotaError(e) && channelId) {
                if (ytFallback?.channelId === channelId) {
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
                console.error(`[niconicoUserInfoGet] ユーザーID/URLの解析に失敗しました:`, userIdOrUrl);
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
                        console.error(`[niconicoUserInfoGet] nvapiは応答したが name/iconUrl が欠落: `, { nameNv, iconNv });
                    }
                } else {
                    if (nv.status === 404) {
                        // 404 は致命的ではなく後続の OG 解析で処理できるため、ログレベルを下げる
                        console.log(`[niconicoUserInfoGet] nvapi 404 (not fatal): userId=${userId}`);
                    } else {
                        console.error(`[niconicoUserInfoGet] nvapi応答エラー: HTTP ${nv.status}`);
                    }
                }
            } catch (e) {
                console.warn(`[niconicoUserInfoGet] nvapi取得中に例外が発生:`, e);
            }

            let response: Response;
            try {
                response = await fetch(userUrl);
                if (!response.ok) {
                    console.error(`[niconicoUserInfoGet] ユーザーページの取得に失敗しました: HTTP ${response.status}`);
                    return undefined;
                }
            } catch (e) {
                console.error(`[niconicoUserInfoGet] ユーザーページの取得中にエラーが発生しました:`, e);
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
                console.error(`[niconicoUserInfoGet] OGメタから name/iconUrl が取得できませんでした`, { name, iconUrl });
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
            console.error(`[niconicoUserInfoGet] 処理中にエラーが発生しました:`, e);
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
                console.error(`[niconicoChannelInfoGet] チャンネルID/URLの解析に失敗しました:`, channelIdOrUrl);
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
                console.error(`[niconicoChannelInfoGet] チャンネルページ取得中にエラーが発生しました:`, e);
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
                console.error(`[niconicoChannelInfoGet] OGメタから name/iconUrl が取得できませんでした`, { name, iconUrl });
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
            console.error(`[niconicoChannelInfoGet] 処理中にエラーが発生しました:`, e);
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
    /**
     * videoId から「最も高解像度のサムネURL」を返す。
     * - youtubei.js で取得できた thumbnails[] から最大解像度を選択（Cookie使用可）
     * - 取得失敗時は i.ytimg.com の既知パスを高解像度順に返す（存在チェックはしないが実運用で十分）
     * - 戻り: URL or undefined
     */
    async youtubeThumbnailGet(videoId: string) {
        const json: VideoInfoCache = JSON.parse(String(fs.readFileSync("videoInfoCache.json")));
        if (!json.youtubeThumbnail) json.youtubeThumbnail = [];
        const data = json.youtubeThumbnail.find(data => data && data.videoId === videoId);
        if (data) return data.thumbnailUrl;
        // 単関数に全部内包します

        const isValidId = (id: string) => /^[A-Za-z0-9_-]{6,}$/.test(id);

        // Chrome Cookie → header 生成
        const buildCookieHeader = async () => {
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
        };

        // 任意オブジェクトから thumbnails 配列を根こそぎ回収
        const collectThumbnailsDeep = (root: any): { url: string; w?: number; h?: number }[] => {
            const out: { url: string; w?: number; h?: number }[] = [];
            const stack = [root];
            while (stack.length) {
                const cur = stack.pop();
                if (!cur || typeof cur !== "object") continue;

                // パターン1: { thumbnails: [{url,width,height}, ...] }
                if (Array.isArray((cur as any).thumbnails)) {
                    for (const t of (cur as any).thumbnails) {
                        if (t?.url) out.push({ url: t.url, w: t.width, h: t.height });
                    }
                }
                // パターン2: { thumbnail: { thumbnails: [...] } }
                if ((cur as any).thumbnail?.thumbnails) {
                    for (const t of (cur as any).thumbnail.thumbnails) {
                        if (t?.url) out.push({ url: t.url, w: t.width, h: t.height });
                    }
                }
                // パターン3: { url, width, height } が直置き
                if (cur.url && typeof cur.url === "string") {
                    out.push({ url: cur.url, w: (cur as any).width, h: (cur as any).height });
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
        };

        if (!isValidId(videoId)) return undefined;

        // 1) youtubei.js で最大解像度を取りに行く
        try {
            const cookie = await buildCookieHeader().catch(() => "");
            const yt = await youtubei.Innertube.create(cookie ? { cookie } : {});
            // 複数Googleアカウント環境の安定化（任意）
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
                // 面積（w*h）降順で最大を選ぶ（w/h欠損は末尾扱い）
                thumbs.sort((a, b) => ((b.w || 0) * (b.h || 0)) - ((a.w || 0) * (a.h || 0)));
                json.youtubeThumbnail.push({ videoId, thumbnailUrl: thumbs[0].url });
                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
                return thumbs[0].url;
            }
        } catch {
            // youtubei 失敗時はフォールバックへ
        }

        // 2) フォールバック：i.ytimg.com の既知パスを高解像度順に返す
        // （存在チェックはしない。maxres が 404 の場合はクライアント側で次候補へ切替して使ってください）
        const candidates = [
            // webp 系（軽くて高画質が多い）
            `https://i.ytimg.com/vi_webp/${videoId}/maxresdefault.webp`,
            `https://i.ytimg.com/vi_webp/${videoId}/sddefault.webp`,
            `https://i.ytimg.com/vi_webp/${videoId}/hqdefault.webp`,
            `https://i.ytimg.com/vi_webp/${videoId}/mqdefault.webp`,
            // jpg 系
            `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, // 1280x720（無い動画は404）
            `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,     // 640x480
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,     // 480x360
            `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,     // 320x180
            `https://i.ytimg.com/vi/${videoId}/default.jpg`,       // 120x90
            // 参考：フレーム0（古いが使えることあり・解像度はまちまち）
            `https://i.ytimg.com/vi/${videoId}/0.jpg`,
        ];
        return candidates[0]; // まずは最上位を返す（クライアント側で順次フォールバックする設計にしておくのが実運用◎）
    }
    async spotifyToYouTubeId(spotifyUrlOrId: string): Promise<string | undefined> {
        const startTime = Date.now();
        // --- scoped log collector (only prints on final failure) ---
        const log: { type: "info" | "warn" | "error"; body: any[] }[] = [];
        const push = (type: "info" | "warn" | "error", ...body: any[]) => { log.push({ type, body }); };
        const info = (...a: any[]) => push("info", ...a);
        const warn = (...a: any[]) => push("warn", ...a);
        const err = (...a: any[]) => push("error", ...a);
        const fail = (message: string) => {
            err(message);
            // 出力はここで一回だけ
            console.error(`[spotifyToYouTubeId] 検索に失敗しました。詳細:`, log);
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

        // oEmbed（タイトル/アーティスト文字列が取れる・ロケールは弱い）
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

        // Helpers: parse "title – artist" variants and duration from HTML
        const splitTitleArtist = (s?: string): { title?: string; artist?: string } => {
            if (!s) return {};
            // handle en dash, em dash, hyphen, middle dot, bullet, pipe
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
            // 1) direct numeric ms in JSON (durationMs or duration_ms)
            const mNum = html.match(/\b(duration(?:Ms|_ms)?)\"?\s*:\s*(\d{3,})/i);
            if (mNum && mNum[2]) {
                const v = parseInt(mNum[2], 10);
                if (Number.isFinite(v) && v > 0) return v;
            }
            // 2) ISO8601 duration (PT#M#S)
            const mIso = html.match(/\b\"duration\"\s*:\s*\"PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?\"/i);
            if (mIso) {
                const mm = mIso[1] ? parseInt(mIso[1], 10) : 0;
                const ss = mIso[2] ? parseFloat(mIso[2]) : 0;
                const ms = Math.round((mm * 60 + ss) * 1000);
                if (ms > 0) return ms;
            }
            // 3) human format like 3:45 or 03:45 inside JSON
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

            // できるだけ堅牢にパスを試す
            const candidates: any[] = [
                json?.props?.pageProps?.state?.data?.entity,                  // 旧
                json?.props?.pageProps?.state?.data?.trackUnion,              // 場合によって
                json?.props?.pageProps?.state?.data?.pageData?.track,         // 変種
            ].filter(Boolean);

            const pick = candidates[0];
            if (!pick) return {};

            const title = pick.name || pick.title || pick.track?.name;
            const artist =
                (Array.isArray(pick.artists) && pick.artists[0]?.name) ||
                (Array.isArray(pick.track?.artists) && pick.track.artists[0]?.name) ||
                pick.artist?.name;
            const album = pick.album?.name || pick.track?.album?.name;

            // duration（ms）候補
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
                    // 単体/配列どちらも考慮
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
                } catch { /* continue */ }
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

        // ----- RAW LOGGING (Spotify only) -----
        try {
            // Title tags
            const titleJP = jpHtml?.match(/<title>([^<]+)<\/title>/i)?.[1];
            const titleEN = enHtml?.match(/<title>([^<]+)<\/title>/i)?.[1];
            info("[spotifyToYouTubeId][raw] <title> JP:", titleJP);
            info("[spotifyToYouTubeId][raw] <title> EN:", titleEN);

            // __NEXT_DATA__ JSON
            const nextJPMatch = jpHtml?.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
            const nextENMatch = enHtml?.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
            const nextJP = nextJPMatch?.[1];
            const nextEN = nextENMatch?.[1];
            info("[spotifyToYouTubeId][raw] __NEXT_DATA__ JP present:", !!nextJP, "len:", nextJP?.length);
            if (nextJP) info("[spotifyToYouTubeId][raw] __NEXT_DATA__ JP JSON:", nextJP);
            info("[spotifyToYouTubeId][raw] __NEXT_DATA__ EN present:", !!nextEN, "len:", nextEN?.length);
            if (nextEN) info("[spotifyToYouTubeId][raw] __NEXT_DATA__ EN JSON:", nextEN);

            // ld+json blocks
            const ldJPMatches = [...(jpHtml?.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [])].map(m => m[1]);
            const ldENMatches = [...(enHtml?.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [])].map(m => m[1]);
            info("[spotifyToYouTubeId][raw] ld+json JP count:", ldJPMatches.length);
            ldJPMatches.forEach((j, idx) => info(`[spotifyToYouTubeId][raw] ld+json JP[${idx}]:`, j));
            info("[spotifyToYouTubeId][raw] ld+json EN count:", ldENMatches.length);
            ldENMatches.forEach((j, idx) => info(`[spotifyToYouTubeId][raw] ld+json EN[${idx}]:`, j));

            // EMBED page quick probes
            const titleEM = embedHtml?.match(/&lt;title&gt;([^&]+)&lt;\/title&gt;|<title>([^<]+)<\/title>/i);
            info("[spotifyToYouTubeId][raw] <title> EMBED:", titleEM ? (titleEM[1] || titleEM[2]) : undefined);

            const nextEMMatch = embedHtml?.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
            const nextEM = nextEMMatch?.[1];
            info("[spotifyToYouTubeId][raw] __NEXT_DATA__ EMBED present:", !!nextEM, "len:", nextEM?.length);
            if (nextEM) info("[spotifyToYouTubeId][raw] __NEXT_DATA__ EMBED JSON:", nextEM);

            const ldEMMatches = [...(embedHtml?.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [])].map(m => m[1]);
            info("[spotifyToYouTubeId][raw] ld+json EMBED count:", ldEMMatches.length);
            ldEMMatches.forEach((j, idx) => info(`[spotifyToYouTubeId][raw] ld+json EMBED[${idx}]:`, j));

            // oEmbed JSON full
            info("[spotifyToYouTubeId][raw] oEmbed JP:", jpEmbed);
            info("[spotifyToYouTubeId][raw] oEmbed EN:", enEmbed);
        } catch (e) {
            info("[spotifyToYouTubeId][raw] logging error:", (e as any)?.message || e);
        }
        // ----- RAW LOGGING END -----

        // Helper to parse loosely from embed HTML (when JSON parsing is hard)
        const parseFromEmbedLoose = (html?: string): Partial<Meta> => {
            if (!html) return {};
            // Try to find artists array and first name
            let artist: string | undefined;
            const artistsBlock = html.match(/"artists"\s*:\s*\[([\s\S]*?)\]/);
            if (artistsBlock) {
                const names = [...artistsBlock[1].matchAll(/"name"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
                if (names.length) artist = names[0];
            }
            // Title candidates (track name)
            const titleMatch = html.match(/"name"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"track"/);
            const title = titleMatch ? titleMatch[1] : undefined;

            // Album name, if present
            const albumMatch = html.match(/"album"\s*:\s*{[\s\S]*?"name"\s*:\s*"([^"]+)"/);
            const album = albumMatch ? albumMatch[1] : undefined;

            // Duration: duration_ms or durationMs
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

        // Safety check for empty or missing top element
        if (!filtered.length || !filtered[0]?.videoId) {
            return fail('no selected candidate');
        }

        // ログ（Appleと同等の粒度）
        try {
            const top5 = filtered.slice(0, 5).map(v => {
                const base = scoreMapJP.get(v.videoId) || 0;
                const diff = Math.abs((v.seconds ?? 0) * 1000 - durationMs);
                return `${v.title ?? ""} (${v.videoId})  score:${base}  diff:${diff}ms`;
            }).join("\n");
            info(`[spotifyToYouTubeId] Track:${trackId}\nJPQuery: ${jpQuery}\nENQuery: ${enQuery}\nTop5:\n${top5}`);
        } catch { /* noop */ }


        const took = Date.now() - t0;
        info(`[spotifyToYouTubeId] selected:`, filtered[0]?.videoId, `took=${took}ms`);
        return filtered[0].videoId;
    }
    async appleMusicToYouTubeId(appleUrlOrId: string): Promise<string | undefined> {
        const startTime = Date.now();
        // --- scoped log collector (only prints on final failure) ---
        const log: { type: "info" | "warn" | "error"; body: any[] }[] = [];
        const push = (type: "info" | "warn" | "error", ...body: any[]) => { log.push({ type, body }); };
        const info = (...a: any[]) => push("info", ...a);
        const warn = (...a: any[]) => push("warn", ...a);
        const err = (...a: any[]) => push("error", ...a);
        const fail = (message: string) => {
            err(message);
            // 出力はここで一回だけ
            console.error(`[appleMusicToYouTubeId] 検索に失敗しました。詳細:`, log);
            return undefined;
        };
        // const DEBUG_APPLE = process.env.DEBUG_APPLE === '1';
        // --- 1) Apple Music から日本語/英語メタデータ取得（JP/US を利用） ---
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
        if (!trackId) { return fail('trackId not found'); }

        const fetchLookup = async (country: string) => {
            const url = `https://itunes.apple.com/lookup?id=${trackId}&entity=song&country=${country}`;
            const t_lookup = Date.now();
            const res = await fetch(url);
            console.log(`[計測] fetchLookup（${country.toUpperCase()}） に ${((Date.now() - t_lookup) / 1000).toFixed(2)} 秒かかりました`);
            if (!res.ok) return undefined;
            const data = await res.json().catch(() => undefined);
            const items = Array.isArray(data?.results) ? data.results : [];
            return items.find((r: any) => r.kind === "song") || items[0];
        };

        const jpMeta = await fetchLookup("jp");
        const usMeta = await fetchLookup("us");
        if (!jpMeta && !usMeta) { return fail('lookup metadata not found'); }

        // 日本語メタ（必須: タイトル/アーティスト/アルバム、長さms）
        const jpTitle: string | undefined = jpMeta?.trackName;
        const jpArtist: string | undefined = jpMeta?.artistName;
        const jpAlbum: string | undefined = jpMeta?.collectionName;
        const jpDurationMs: number | undefined = jpMeta?.trackTimeMillis;

        // 英語メタ（USから）
        const enTitle: string | undefined = usMeta?.trackName || jpTitle;
        const enArtist: string | undefined = usMeta?.artistName || jpArtist;
        const enAlbum: string | undefined = usMeta?.collectionName || jpAlbum;

        if (!jpTitle || !jpArtist) { return fail('missing title/artist'); }
        if (!jpDurationMs) { return fail('missing duration'); } // 長さ必須（仕様どおり日本語メタの長さ基準）

        // --- 2) クエリ生成（ハイフンのみ除去） ---
        const buildQuery = (title?: string, artist?: string, album?: string) => {
            const raw = [title, artist, album].filter(Boolean).join(" ");
            // 当面はハイフンのみ除去（他は触らない）
            return raw.replace(/-/g, " ").trim();
        };
        const jpQuery = buildQuery(jpTitle, jpArtist, jpAlbum);
        const enQuery = buildQuery(enTitle, enArtist, enAlbum);

        const stripAlbumSuffixes = (s?: string) => (s || "").replace(/\s*-\s*(EP|Single)\s*$/i, "").trim();

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

        // --- 3) YouTube 検索（youtubei と yts の両方で試す） ---
        type YtItem = { videoId: string; title?: string; seconds?: number; channelTitle?: string; };

        const searchYoutubei = async (q: string): Promise<YtItem[]> => {
            try {
                const __t_create3 = Date.now();
                const yt = await (youtubei.Innertube.create({ lang: "ja", location: "JP" } as any).catch(e => { err("youtubei.create", e); }));
                console.log(`[計測] youtubei.Innertube.create に ${((Date.now() - __t_create3) / 1000).toFixed(2)} 秒かかりました`);
                const __t_search2 = Date.now();
                const r = await (yt?.search(q).catch(e => { err("youtubei.search", e); }));
                console.log(`[計測] youtubei.search に ${((Date.now() - __t_search2) / 1000).toFixed(2)} 秒かかりました`);

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

                        return id
                            ? {
                                videoId: String(id),
                                title,
                                seconds: typeof seconds === "number" ? seconds : undefined,
                                channelTitle, // ← 追加
                            }
                            : undefined;
                    })
                    .filter(Boolean) as YtItem[];

                return mapped;
            } catch {
                return [];
            }
        };

        const searchYts = async (q: string): Promise<YtItem[]> => {
            try {
                const __t_yts = Date.now();
                const r: any = await yts(q).catch(e => { err("searchYtsError:", e); });
                console.log(`[計測] yts検索 に ${((Date.now() - __t_yts) / 1000).toFixed(2)} 秒かかりました`);
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

        // --- 4) スコア付け ---
        // スコア = 配列長 - 要素番号 + もしユーザー名がアーティスト名と同じなら50、でないと0
        const scoreMapJP = new Map<string, number>();
        for (let i = 0; i < jpList.length; i++) {
            scoreMapJP.set(jpList[i].videoId, jpList.length - i + ((() => {
                const splitedArtistName = [...jpArtist.replace(/[\/:;¥*]/g, "").split(" "), ...(enArtist?.replace(/[\/:;¥*]/g, "").split(" ") || [])];
                let matched = 0;
                const chname = jpList[i].channelTitle;
                splitedArtistName.forEach(name => {
                    if (name.length > 1 && chname && chname.includes(name)) matched += 10;
                });
                return matched;
            })()));
        }
        const scoreMapEN = new Map<string, number>();
        for (let i = 0; i < enList.length; i++) {
            scoreMapEN.set(enList[i].videoId, enList.length - i + ((() => {
                const splitedArtistName = [...jpArtist.replace(/[\/:;¥*]/g, "").split(" "), ...(enArtist?.replace(/[\/:;¥*]/g, "").split(" ") || [])];
                let matched = 0;
                const chname = enList[i].channelTitle;
                splitedArtistName.forEach(name => {
                    if (name.length > 1 && chname && chname.includes(name)) matched += 10;
                });
                return matched;
            })()));
        }

        // 日本語と英語の結果を照合し、同一 videoId があれば EN のスコアを日本語側に加算
        for (const vid of scoreMapJP.keys()) {
            const enScore = scoreMapEN.get(vid);
            if (enScore) {
                scoreMapJP.set(vid, (scoreMapJP.get(vid) || 0) + enScore);
            }
        }
        // 以後は日本語結果のみ使用

        // --- 5) 日本語結果を日本語メタの長さでフィルタ（±6秒未満のみ残す） ---
        const filteredJP = jpList.filter(it => {
            if (typeof it.seconds !== "number") return false;
            const diffMs = Math.abs(it.seconds * 1000 - jpDurationMs);
            return diffMs < 6000;
        });

        if (filteredJP.length === 0) {
            return fail('no candidates matched duration');
        }

        // --- 6) スコアで降順ソートし、先頭を採用 ---
        filteredJP.sort((a, b) => {
            const sa = scoreMapJP.get(a.videoId) || 0;
            const sb = scoreMapJP.get(b.videoId) || 0;
            return sb - sa;
        });

        const infoData: {
            seconds?: number;
            title?: string;
            videoId?: string;
            score?: number;
        }[] = [];
        filteredJP.forEach(a => {
            const score = scoreMapJP.get(a.videoId) || 0;
            infoData.push({
                ...a,
                score
            });
        })

        console.log("実行結果（appleMusicToYouTubeId）:", { jpQuery, enQuery, list: infoData });

        // Safety check for empty or missing top element
        if (!filteredJP.length || !filteredJP[0]?.videoId) {
            return fail('no selected candidate');
        }

        console.log(`[計測] appleMusicToYouTubeId 全体で ${((Date.now() - startTime) / 1000).toFixed(2)} 秒かかりました`);
        return filteredJP[0].videoId;
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

