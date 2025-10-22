import fs from "fs";
import yts from "yt-search";
import { youtubeInfoGet } from "../worker/helper/createByChatGPT/youtubeInfoGetHelper.js";
import { niconicoInfoGet } from "../worker/helper/createByChatGPT/niconicoInfoGetHelper.js";
import { twitterInfoGet } from "../worker/helper/createByChatGPT/twitterInfoGetHelper.js";

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
    playlist = new (class playlist {
        #envData: EnvData;
        constructor(envData: EnvData) {
            this.#envData = envData;
        }
        /** キューデータを保存します。 */
        #playlistSave(playlist: Playlist[]) {
            this.#envData.#envJSON("playlist", JSON.stringify(playlist));
        }
        /** キューデータを取得します。 */
        #playlistGet() {
            const playlistJSONStr = this.#envData.#envJSON("playlist") || this.#envData.#envJSON("playlist", "[]");
            try {
                const playlist = JSON.parse(String(playlistJSONStr)) as (Playlist)[];
                playlist.forEach(playlistData => {
                    if (!playlistData?.type || playlistData.type !== "originalFileId" && playlistData.type !== "videoId" && playlistData.type !== "nicovideoId" && playlistData.type !== "twitterId") throw "";
                    if (!playlistData.body || typeof playlistData.body !== "string") throw "";
                })
                return playlist;
            } catch (e) {
                return JSON.parse(String(this.#envData.#envJSON("playlist", "[]"))) as (Playlist)[];
            }
        }
        push(...playlist: Playlist[]) {
            const pl = this.#playlistGet();
            pl.push(...playlist);
            this.#playlistSave(pl);
        }
        unshift(...playlist: Playlist[]) {
            const pl = this.#playlistGet();
            pl.unshift(...playlist);
            this.#playlistSave(pl);
        }
        shift() {
            const pl = this.#playlistGet();
            const playlistData = pl.shift();
            this.#playlistSave(pl);
            return playlistData;
        }
        pop() {
            const pl = this.#playlistGet();
            const playlistData = pl.pop();
            this.#playlistSave(pl);
            return playlistData;
        }
        get(number: number): Playlist | undefined {
            const pl = this.#playlistGet();
            return pl[number];
        }
        length() {
            const pl = this.#playlistGet();
            return pl.length;
        }
        clear() {
            const pl = this.#playlistGet();
            pl.length = 0;
            this.#playlistSave(pl);
        }
        splice(start: number, deleteCount: number = 1) {
            const pl = this.#playlistGet();
            const list = pl.splice(start, deleteCount);
            this.#playlistSave(pl);
            return list;
        }
        [Symbol.iterator](): Iterator<Playlist> {
            let index = 0;
            const pl = this.#playlistGet();

            return {
                next(): IteratorResult<Playlist> {
                    if (index < pl.length) {
                        return { value: pl[index++], done: false };
                    } else {
                        return { value: undefined as any, done: true };
                    }
                }
            };
        }
        listGet() {
            const pl = this.#playlistGet();
            return pl;
        }
    })(this);
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
    /** 初期値、無効値は-1です */
    set restartedPlayPoint(point: number) {
        this.#envJSON("restartedPlayPoint", String(point));
    }
    get restartedPlayPoint() {
        return Number(this.#envJSON("restartedPlayPoint") || -1);
    }
    set restartedCalledChannel(point: string) {
        this.#envJSON("restartedCalledChannel", point);
    }
    get restartedCalledChannel() {
        return this.#envJSON("restartedCalledChannel") || "";
    }
    set restartedVoiceChannel(point: string) {
        this.#envJSON("restartedVoiceChannel", point);
    }
    get restartedVoiceChannel() {
        return this.#envJSON("restartedVoiceChannel") || "";
    }
    set reverbType(reverbType: "church" | "tunnel" | "ushapedvalley" | undefined) {
        this.#envJSON("reverbType", reverbType || "");
    }
    get reverbType() {
        switch (this.#envJSON("reverbType")) {
            case "church": return "church";
            case "tunnel": return "tunnel";
            case "ushapedvalley": return "ushapedvalley";
        }
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

interface NicoSnapshotItem {
    // 基本
    contentId: string;
    title: string;
    description?: string;
    // カウンタ類
    viewCounter?: number;
    mylistCounter?: number;
    likeCounter?: number;
    commentCounter?: number;
    // 動画情報
    lengthSeconds?: number;
    startTime?: string;
    lastResBody?: string;
    // サムネ・ジャンル・タグ
    thumbnailUrl?: string;
    genre?: string;
    tags?: string;
    // ユーザー / チャンネル情報
    userId?: string;
    userNickname?: string;
    channelId?: string;
    channelName?: string;
    // その他（APIが追加で返す可能性のある項目をキャッチ）
    [key: string]: string | number | undefined;
}

interface XPostInfo {
    id: string;
    text?: string;
    created_at?: string;
    author?: {
        id: string;
        name: string;
        username: string;
        profile_image_url?: string;
        verified?: boolean;
    };
    media?: Array<{
        media_key: string;
        type: "photo" | "video" | "animated_gif";
        url?: string;
        preview_image_url?: string;
        duration_ms?: number;
        variants?: Array<{
            bitrate?: number;
            content_type: string;
            url: string;
        }>;
    }>;
    public_metrics?: {
        like_count?: number;
        retweet_count?: number;
        reply_count?: number;
        quote_count?: number;
        bookmark_count?: number;
        view_count?: number; // 一部レベルでのみ返る
    };
    raw: any; // フルレスポンスをそのまま保持（将来の拡張用）
}

export type CacheGetReturn = {
    type: "videoId";
    body: yts.VideoMetadataResult | undefined;
} | {
    type: "nicovideoId";
    body: NicoSnapshotItem | undefined;
} | {
    type: "tweetId";
    body: XPostInfo | undefined;
};

/**
 * （旧 VideoMetaCache#cacheGet）を関数化したものです。
 * 指定IDのメタ情報を取得し、可能なら正規化URLを付与して返します。
 */
export async function videoMetaCacheGet(data: Playlist): Promise<CacheGetReturn | undefined> {
    if (data.type === "videoId") {
        const body = await youtubeInfoGet(data.body);
        return {
            type: "videoId",
            body
        };
    }
    if (data.type === "nicovideoId") {
        const body = await niconicoInfoGet(data.body);
        return {
            type: "nicovideoId",
            body
        };
    }
    if (data.type === "twitterId") {
        console.log("twitterinfogetを実行します。", data.body);
        const body = await twitterInfoGet(data.body);
        console.log("twitterinfogetを実行しました。");
        return {
            type: "tweetId",
            body
        };
    }
    return undefined;
}
