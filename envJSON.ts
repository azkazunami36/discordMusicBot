import fs from "fs";
import yts from "yt-search";
import { NicoSnapshotItem, searchNicoVideo } from "./ niconico.js";

export interface Playlist {
    type: "videoId" | "originalFileId" | "nicovideoId";
    body: string;
}
export interface OriginalFiles {
    id: string;
    callName: string;
    fileName: string;
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
}

interface VideoInfoCache {
    youtube?: (yts.VideoMetadataResult | undefined)[];
    niconico?: (NicoSnapshotItem | undefined)[];
}

/** VideoIDに記録されている情報をキャッシュし、読み込めるようにするものです。 */
export class VideoMetaCache {
    constructor() {
        if (!fs.existsSync("videoInfoCache.json")) fs.writeFileSync("videoInfoCache.json", "{}");
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
                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json));
                return result;
            } catch (e) {
                return undefined;
            }
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
                fs.writeFileSync("videoInfoCache.json", JSON.stringify(json));
                return result[0];
            }
        }
    }
    async cacheGet(data: Playlist) {
        if (data.type === "videoId") return await this.youtubeInfoGet(data.body);
        if (data.type === "nicovideoId") return await this.niconicoInfoGet(data.body);
    }
}
