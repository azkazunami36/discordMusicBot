import { spawn } from "node:child_process";

/**
 * 何らかの文字列を適切なダウンロードサービスのJSONに変換します。無効なものやうまく取得できないものはundefinedになります。
 * 
 * スタートがhttpから始まる場合はURL判定として処理(スペースが含まれている場合は文字列)。
 * 
 * yt-dlpが取得できそうなものは「supportedytdlp」として応答します。
 * 
 * URLではなく検索の必要のある文字列であった場合は「noturl」として返答します。
 */
export async function stringToServiceParser(string: string): Promise<({
    type: "youtube" | "niconico" | "twitter" | "soundcloud" | "url" | "noturl" | "supportedytdlp";
    body: string[];
    youtubePlaylistId?: string;
    niconicoMylistId?: string;
    selectSourceNumber?: number;
} | undefined)> {
    try {
        const url = new URL(string);
        const params = url.searchParams;
        switch (url.hostname) {
            case "youtube.com":
            case "www.youtube.com":
            case "music.youtube.com": {
                const videoId = params.get("v");
                const playlistId = params.get("list");
                if (videoId) return {
                    type: "youtube",
                    body: [videoId]
                }; else {
                    const data = await (() => {
                        try {
                            return new Promise<string[]>((resolve, reject) => {
                                try {
                                    const proc = spawn("yt-dlp", ["--flat-playlist", "-j", "https://youtube.com/playlist?list=" + playlistId]);
                                    proc.stdout.setEncoding("utf-8");
                                    let data = "";
                                    proc.on("close", () => {
                                        try {
                                            const jsons = data.split("\n").filter(Boolean).map(str => JSON.parse(str) as { id?: string });
                                            const validId: string[] = [];
                                            jsons.forEach(json => {
                                                try {
                                                    if (typeof json === "object" && json !== null && !Array.isArray(json) && "id" in json && typeof json.id === "string") validId.push(json.id);
                                                } catch { }
                                            });
                                            resolve(validId);
                                        } catch (e) {
                                            reject(e);
                                        }
                                    })
                                    proc.stdout.on("data", chunk => data += chunk);
                                    proc.stdout.on("error", e => reject(e));
                                    proc.on("error", e => reject(e));
                                } catch (e) {
                                    reject(e);
                                }
                            })
                        } catch {
                            return;
                        }
                    })();
                    if (data) return {
                        type: "youtube",
                        body: data,
                        youtubePlaylistId: playlistId ?? undefined
                    }
                }
                break;
            }
            case "www.youtu.be":
            case "youtu.be": {
                const videoId = url.pathname.split("/").filter(Boolean)[0];
                if (videoId) return {
                    type: "youtube",
                    body: [videoId]
                }
                break;
            }
            case "nicovideo.jp":
            case "www.nicovideo.jp": {
                const split = url.pathname.split("/").filter(Boolean);
                const watchPoint = split.indexOf("watch");
                const mylistPoint = split.indexOf("mylist");
                if (watchPoint !== -1) {
                    const id = split[watchPoint + 1];
                    if (typeof id === "string") return {
                        type: "niconico",
                        body: [id]
                    }
                }
                if (mylistPoint !== -1) {
                    const mylistId = split[mylistPoint + 1];
                    if (typeof mylistId === "string") {
                        const data = await (() => {
                            try {
                                return new Promise<string[]>((resolve, reject) => {
                                    try {
                                        const proc = spawn("yt-dlp", ["--flat-playlist", "-j", "https://www.nicovideo.jp/mylist/" + mylistId])
                                        proc.stdout.setEncoding("utf-8");
                                        let data = "";
                                        proc.on("close", () => {
                                            try {
                                                const jsons = data.split("\n").filter(Boolean).map(str => JSON.parse(str) as { id?: string });
                                                const validId: string[] = [];
                                                jsons.forEach(json => {
                                                    try {
                                                        if (typeof json === "object" && json !== null && !Array.isArray(json) && "id" in json && typeof json.id === "string") validId.push(json.id);
                                                    } catch { }
                                                });
                                                resolve(validId);
                                            } catch (e) {
                                                reject(e);
                                            }
                                        })
                                        proc.stdout.on("data", chunk => data += chunk);
                                        proc.stdout.on("error", e => reject(e));
                                        proc.on("error", e => reject(e));
                                    } catch (e) {
                                        reject(e);
                                    }
                                })
                            } catch {
                                return;
                            }
                        })();
                        if (data) return {
                            type: "niconico",
                            body: data,
                            niconicoMylistId: mylistId
                        }
                    }
                }
                break;
            }
            case "www.nico.ms":
            case "nico.ms": {
                const id = url.pathname.split("/").filter(Boolean)[0];
                if (id) return {
                    type: "niconico",
                    body: [id]
                }
                break;
            }
            case "x.com":
            case "www.x.com":
            case "twitter.com":
            case "www.twitter.com": {
                const split = url.pathname.split("/").filter(Boolean);
                const statusPoint = split.indexOf("status");
                const index = (() => {
                    const photoPoint = split.indexOf("photo");
                    const videoPoint = split.indexOf("video");
                    if (photoPoint !== -1 && !Number.isNaN(Number(split[photoPoint + 1]))) return Number(split[photoPoint + 1]);
                    if (videoPoint !== -1 && !Number.isNaN(Number(split[videoPoint + 1]))) return Number(split[videoPoint + 1]);
                    return 1
                })();
                if (statusPoint !== -1 && typeof split[statusPoint + 1] === "string") return {
                    type: "twitter",
                    body: [split[statusPoint + 1]],
                    selectSourceNumber: index
                }
                break;
            }
            case "soundcloud.com":
            case "www.soundcloud.com":
            case "on.soundcloud.com":
            case "api-v2.soundcloud.com": {
                const split = url.pathname.split("/").filter(Boolean);
                if ((url.hostname === "www.soundcloud.com" || url.hostname === "soundcloud.com") && split.length === 1) return;
                const data = await (() => {
                    try {
                        return new Promise<string[]>((resolve, reject) => {
                            try {
                                const proc = spawn("yt-dlp", ["-j", url.origin + url.pathname]);
                                proc.stdout.setEncoding("utf-8");
                                let data = "";
                                proc.on("close", () => {
                                    try {
                                        const jsons = data.split("\n").filter(Boolean).map(str => JSON.parse(str) as { id?: string });
                                        const validId: string[] = [];
                                        jsons.forEach(json => {
                                            try {
                                                if (typeof json === "object" && json !== null && !Array.isArray(json) && "id" in json && typeof json.id === "string") validId.push(json.id);
                                            } catch { }
                                        });
                                        resolve(validId);
                                    } catch (e) {
                                        reject(e);
                                    }
                                })
                                proc.stdout.on("data", chunk => data += chunk);
                                proc.stdout.on("error", e => reject(e));
                                proc.on("error", e => reject(e));
                            } catch (e) {
                                reject(e);
                            }
                        })
                    } catch {
                        return;
                    }
                })();
                if (data) return {
                    type: "soundcloud",
                    body: data
                }
                break;
            }
            case "w.soundcloud.com": {
                const rawurlstr = url.searchParams.get("url");
                if (rawurlstr) {
                    try {
                        const rawurl = new URL(rawurlstr);
                        const spliturl = rawurl.pathname.split("/");
                        if (spliturl[1] === "tracks") {
                            const colonsplit = spliturl[2].split(":");
                            if (colonsplit[0] === "soundcloud" && colonsplit[1] === "tracks" && colonsplit[2])
                                return {
                                    type: "soundcloud",
                                    body: [colonsplit[2]]
                                }
                        }
                    } catch { }
                }
            }
        }
        return
    } catch {
        return {
            type: "noturl",
            body: [string]
        }
    }
}
