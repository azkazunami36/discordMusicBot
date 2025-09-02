import fs from "fs";
import yts from "yt-search";
import { NicoSnapshotItem, searchNicoVideo } from "./ niconico.js";
import { google, youtube_v3 } from "googleapis";

export interface Playlist {
    type: "videoId" | "originalFileId" | "nicovideoId";
    body: string;
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
    playlistSave(playlist: Playlist[]) {
        this.#envJSON("playlist", JSON.stringify(playlist));
    }
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
    originalFilesSave(originalFiles: OriginalFiles) {
        this.#envJSON("originalFiles", JSON.stringify(originalFiles));
    }
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
    get callchannelId() {
        return this.#envJSON("callchannelId");
    }
    set callchannelId(channelId: string | undefined) {
        this.#envJSON("callchannelId", channelId);
    }
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
    get changeTellIs() {
        if (Boolean(this.#envJSON("changeTellIs"))) return true;
        return false;
    }
    set changeTellIs(type: boolean) {
        this.#envJSON("changeTellIs", String(type));
    }
    set playSpeed(speed: number) {
        this.#envJSON("playSpeed", String(speed));
    }
    get playSpeed() {
        return Number(this.#envJSON("playSpeed") || 1);
    }
}

interface VideoInfoCache {
    youtube?: (yts.VideoMetadataResult | undefined)[];
    niconico?: (NicoSnapshotItem | undefined)[];
    youtubeUsers?: (youtube_v3.Schema$Channel | undefined)[];
    niconicoUsers?: (NicoUserInfo | undefined)[];
    niconicoChannels?: (NicoChannelInfo | undefined)[];
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
        function parseChannelUrl(url: string): { type: 'channel' | 'user' | 'custom' | 'handle', idOrName: string } | null {
            try {
                const parsedUrl = new URL(url);
                const path = parsedUrl.pathname;
                const parts = path.split('/').filter(Boolean);
                if (parts.length === 0) return null;
                if (parts[0] === 'channel' && parts[1]) return { type: 'channel', idOrName: parts[1] };
                if (parts[0] === 'user' && parts[1]) return { type: 'user', idOrName: parts[1] };
                if (parts[0] === 'c' && parts[1]) return { type: 'custom', idOrName: parts[1] };
                if (parts[0].startsWith('@')) return { type: 'handle', idOrName: parts[0] };
                return null;
            } catch {
                return null;
            }
        }

        const json: VideoInfoCache = JSON.parse(String(fs.readFileSync("videoInfoCache.json")));
        if (!json.youtubeUsers) json.youtubeUsers = [];

        let channelId: string | undefined = undefined;

        // Check if input is a URL
        const isUrl = channelOrUrl.startsWith('http://') || channelOrUrl.startsWith('https://');
        if (isUrl) {
            const parsed = parseChannelUrl(channelOrUrl);
            if (!parsed) return undefined;
            const youtube = google.youtube("v3");
            try {
                if (parsed.type === 'channel') {
                    channelId = parsed.idOrName;
                } else if (parsed.type === 'user') {
                    // resolve username to channelId
                    const res = await youtube.channels.list({
                        key: process.env.YOUTUBE_API_KEY,
                        forUsername: parsed.idOrName,
                        part: ['id'],
                    });
                    if (!res.data.items || res.data.items.length === 0) return undefined;
                    channelId = res.data.items[0].id || undefined;
                } else if (parsed.type === 'custom' || parsed.type === 'handle') {
                    // search channel by custom url or handle
                    const res = await youtube.search.list({
                        key: process.env.YOUTUBE_API_KEY,
                        q: parsed.idOrName,
                        type: ['channel'],
                        part: ['snippet'],
                        maxResults: 1,
                    });
                    if (!res.data.items || res.data.items.length === 0) return undefined;
                    channelId = res.data.items[0].snippet?.channelId || undefined;
                }
            } catch {
                return undefined;
            }
        } else {
            // assume direct channelId
            channelId = channelOrUrl;
        }

        if (!channelId) return undefined;

        const cached = json.youtubeUsers.find(data => data && data.id === channelId);
        if (cached) return cached;

        const youtube = google.youtube("v3");
        try {
            const res = await youtube.channels.list({
                key: process.env.YOUTUBE_API_KEY,
                id: [channelId],
                part: ['snippet', 'statistics'],
                hl: "ja"
            });
            if (!res.data.items || res.data.items.length === 0) return undefined; // 見つからなかった場合
            const channel = res.data.items[0];
            // 念のためチェック
            if (channel.id !== channelId) return undefined;
            json.youtubeUsers.push(channel);
            fs.writeFileSync("videoInfoCache.json", JSON.stringify(json, null, "    "));
            return channel;
        } catch {
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
};

