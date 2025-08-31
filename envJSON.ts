import fs from "fs";

export interface Playlist {
    type: "videoId" | "originalFileId";
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
                if (!playlistData.type || playlistData.type !== "originalFileId" && playlistData.type !== "videoId") throw "";
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
}
