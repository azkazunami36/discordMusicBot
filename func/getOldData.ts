import fs from "fs";
import fsP from "fs/promises";
import { MusicLibraryJSON, niconicoInfoData, SourceInfo, TwitterInfoData, YouTubeInfoData } from "../dbmgr/main.js";
import { ProgressView } from "../class/progressView.js";
import { randomUUID } from "crypto";
import { TwitterInfo } from "../dbmgr/worker/infoGetHelper.js";

function youtubeUrlToId(urlstr: string): { type: "channelId" | "userId"; id: string } | undefined {
    try {
        const url = new URL(urlstr);
        const splitedPath = url.pathname.split("/");
        if (splitedPath[1] === "channel") {
            return {
                type: "channelId",
                id: splitedPath[2]
            }
        }
        if (splitedPath[1].startsWith("@") && splitedPath[2] === undefined) {
            return {
                type: "userId",
                id: decodeURI(splitedPath[1])
            }
        }
    } catch { }
}

async function fileCopy(oldPath: string, newPath: string, filename: string) {
    const random = (() => {
        for (let i = 0; i <= 500; i++) {
            const random = randomUUID();
            if (fs.existsSync(newPath + "/" + random)) continue;
            fs.mkdirSync(newPath + "/" + random, { recursive: true });
            return random;
        }
        throw new Error("500回一時フォルダ作成チャレンジを行いましたが、全てにおいてUUIDが重複しました。fs.existSyncにてcontinueを発火する条件であるパスが存在するかで500回成功したことが理由です。処理は強制終了しました。");
    })();
    await fsP.copyFile(oldPath + "/" + filename, newPath + "/" + random + "/" + filename);
    fs.renameSync(newPath + "/" + random + "/" + filename, newPath + "/" + filename);
    fs.rmSync(newPath + "/" + random, { recursive: true, force: true });
}
export async function getOldData(oldDiscordMusicBotDirectoryPath: string, json: MusicLibraryJSON) {
    console.log("過去の音楽botのディレクトリ「" + oldDiscordMusicBotDirectoryPath + "」の内容をチェックします。必要に応じて、このミュージックライブラリにインポートします。");
    console.log("この処理には時間がかかる可能性があります。");
    const envjson = (() => {
        const envJsonPath = oldDiscordMusicBotDirectoryPath + "/env.json";
        let envStatus;
        if (fs.existsSync(envJsonPath)) {
            envStatus = JSON.parse(String(fs.readFileSync(envJsonPath)));
            console.log("env.jsonを読み込みました。");
        }
        return envStatus as Record<string, {
            callchannelId?: string;
            volume?: string;
            playType?: string;
            playlist?: string;
            originalFiles?: string;
            changeTellIs?: string;
            playSpeed?: string;
            playPitch?: string;
            restartedPlayPoint?: string;
            restartedCalledChannel?: string;
            restartedVoiceChannel?: string;
            ffmpegFilter?: string;
            reverbType?: string;
            manualStartedIs?: string;
            recordedAudioFileSaveChannelTo?: string;
            restartedPlayIs?: string;
        }> | undefined;
    })();
    const albumInfoJson = (() => {
        const albumInfoJsonPath = oldDiscordMusicBotDirectoryPath + "/albumInfo.json";
        let albumStatus;
        if (fs.existsSync(albumInfoJsonPath)) {
            albumStatus = JSON.parse(String(fs.readFileSync(albumInfoJsonPath)));
            console.log("albumInfo.jsonを読み込みました。");
        }
        return albumStatus as {
            youtubeLink?: {
                videoId?: Record<string, {
                    recording?: string;
                    release?: string;
                }>;
            };
        } | undefined;
    })();

    function loadJSONL<T, MapOrSet extends "set" | "map" | "doubleMap" | "none">(filename: string, mapOrSet?: MapOrSet, call?: (item: T) => [string, string | undefined] | undefined): (
        MapOrSet extends "map" ? Map<string, string> :
        MapOrSet extends "set" ? Set<string> :
        MapOrSet extends "doubleMap" ? { keyToId: Map<string, string>; idToKey: Map<string, string> } :
        T[]
    ) | undefined {
        try {
            const path = oldDiscordMusicBotDirectoryPath + "/cacheJSONs/" + filename;
            let status: T[] | undefined;
            if (fs.existsSync(path)) {
                const jsontexts = String(fs.readFileSync(path)).split("\n").filter(Boolean);
                status = [];
                jsontexts.forEach(jsontext => { try { status?.push(JSON.parse(jsontext)) } catch { } });
                console.log(filename + "を読み込みました。項目は" + status.length + "個あります。");
            }
            if (call !== undefined) {
                if (mapOrSet === "map") {
                    const map = new Map<string, string>();
                    status?.forEach(item => {
                        const result = call(item);
                        if (result && result[1] !== undefined) map.set(result[0], result[1]);
                    });
                    return map as any;
                }
                if (mapOrSet === "set") {
                    const map = new Set<string>();
                    status?.forEach(item => {
                        const result = call(item);
                        if (result) map.add(result[0]);
                    });
                    return map as any;
                }
                if (mapOrSet === "doubleMap") {
                    const map1 = new Map<string, string>();
                    const map2 = new Map<string, string>();
                    status?.forEach(item => {
                        const result = call(item);
                        if (result && result[1] !== undefined) {
                            map1.set(result[0], result[1]);
                            map2.set(result[1], result[0]);
                        }
                    });
                    return { keyToId: map1, idToKey: map2 } as any;
                }
            }
            return status as any;
        } catch { }
    }
    function loadFolder(filename: string) {
        const path = oldDiscordMusicBotDirectoryPath + "/" + filename;
        let status: string[] | undefined;
        if (fs.existsSync(path)) {
            status = fs.readdirSync(path);
            console.log(filename + "フォルダを読み込みました。項目は" + status.length + "個あります。");
        }
        const map = new Map<string, string>();
        status?.forEach(str => {
            const split = str.split(".");
            const id = split[0];
            map.set(id, str);
        });
        return status ? map : undefined;
    }

    const youtubeInfoCacheJson = loadJSONL<{
        title?: string;
        description?: string;
        videoId?: string;
        author?: {
            name?: string;
            url?: string;
        }
        thumbnail?: string;
    }, "none">("youtubeInfoCache.jsonl");
    const youtubeThumbnailLinkCacheJson = loadJSONL<{ thumbnailUrl?: string; videoId?: string; }, "map">("youtubeThumbnailLinkCache.jsonl", "map", item => {
        if (item.videoId && item.thumbnailUrl) return [item.videoId, item.thumbnailUrl];
    });
    const youtubeUserInfoCacheJson = loadJSONL<{
        id?: string;
        snippet?: {
            customUrl?: string;
            title?: string;
            thumbnails?: {
                default?: {
                    url?: string;
                };
                medium?: {
                    url?: string;
                };
                high?: {
                    url?: string;
                };
            }
        }
    }, "none">("youtubeUserInfoCache.jsonl");
    const youtubeUserIdLinkJson = loadJSONL<{ channelId?: string; key?: string; }, "doubleMap">("youtubeUserIdLink.jsonl", "doubleMap", info => {
        if (info.channelId && info.key) return [info.key, info.channelId]
    });
    const youtubeCacheFolderList = loadFolder("youtubeCache");

    const niconicoInfoCache = loadJSONL<{
        title?: string;
        description?: string;
        contentId?: string;
        thumbnailUrl?: string;
        userId?: string;
        userNickname?: string;
    }, "none">("niconicoInfoCache.jsonl")
    const niconicoCacheFolderList = loadFolder("niconicoCache");
    const niconicoUserInfoCache = loadJSONL<{ id?: string; iconUrl?: string }, "none">("niconicoUserInfoCache.jsonl");
    const niconicoChannelInfoCache = loadJSONL<{ id?: string; iconUrl?: string }, "none">("niconicoChannelInfoCache.jsonl");

    const twitterInfoCache = loadJSONL<{
        id?: string;
        text?: string;
        author?: {
            id?: string;
            name?: string;
            username?: string;
            profile_image_url?: string;
        }
        media?: {
            type?: "video";
            preview_image_url?: string;
        }[]
    }, "none">("twitterInfoCache.jsonl");
    const twitterCacheFolderList = loadFolder("twitterCache");

    console.log("JSONと音声キャッシュフォルダの読み取りが完了しました。音声キャッシュフォルダとJSONの照合を試みます。");

    if (envjson !== undefined) {
        const serverIds = Object.keys(envjson);
        for (let i = 0; i < serverIds.length; i++) {
            const serverId = serverIds[i];
            const serverData = envjson[serverId];
            if (serverData.playlist) {
                try {
                    const playlist: { type: "videoId" | "nicovideoId" | "twitterId", body: string; number?: number; }[] = JSON.parse(serverData.playlist);
                    const 修復済みプレイリスト: ({
                        type: "youtube" | "niconico" | "twitter" | "soundcloud";
                        id: string;
                        index?: number;
                    } | undefined)[] = [];
                    playlist.forEach(item => {
                        let type: "youtube" | "niconico" | "twitter" | undefined;
                        let id: string | undefined;
                        let index: number | undefined;
                        switch (item.type) {
                            case "videoId": type = "youtube"; break;
                            case "nicovideoId": type = "niconico"; break;
                            case "twitterId": type = "twitter"; break;
                        }
                        if (typeof item.body === "string") id = item.body;
                        if (typeof item.number === "number") index = item.number;
                        if (type && id) 修復済みプレイリスト.push({ type, id, index });
                    })
                    const server = json.servers.find(server => server.guildId === serverId);
                    if (server) server.playlist = 修復済みプレイリスト;
                    else json.servers.push({guildId: serverId, playlist: 修復済みプレイリスト});
                } catch { }
            }
        }
    }

    // YouTubeの情報移行に必要な情報全てが揃っている場合。
    if (youtubeInfoCacheJson !== undefined && youtubeThumbnailLinkCacheJson !== undefined && youtubeUserIdLinkJson !== undefined && youtubeCacheFolderList !== undefined && fs.existsSync("./youtube")) {
        const progress = new ProgressView();
        progress.reflashrate = 60;
        let success = 0;
        for (let i = 0; i < youtubeInfoCacheJson.length; i++) {
            const info = youtubeInfoCacheJson[i];
            if (info.videoId && info.title && info.description && info.author?.name && info.author.url) {
                progress.message = "YouTube動画データ移動中 (" + i + "/" + youtubeInfoCacheJson.length + ") " + success + "個成功";
                progress.percent = i / youtubeInfoCacheJson.length * 100;

                // if (fs.existsSync("./youtube/" + filename)) continue; // このコードは使う必要がありません。ミュージックライブラリのJSONに記録されていない音声はないも同然です。
                if (json.youtube.find(ytinfo => ytinfo.id === info.videoId)) continue;

                const videoId = info.videoId;
                const filename = youtubeCacheFolderList.get(videoId);
                if (!filename) continue;

                const thumbnail = youtubeThumbnailLinkCacheJson.get(info.videoId) || info.thumbnail;
                if (!thumbnail) continue;

                const idinfo: {
                    channelId: string;
                    userId?: string;
                } | undefined = (() => {
                    const urltoid = youtubeUrlToId(info.author.url);
                    if (!urltoid) return;
                    if (urltoid.type === "channelId") {
                        const userId = youtubeUserIdLinkJson.idToKey.get(urltoid.id);
                        if (userId) return {
                            channelId: urltoid.id,
                            userId: userId
                        };
                        else return {
                            channelId: urltoid.id
                        }
                    }
                    if (urltoid.type === "userId") {
                        const channelId = youtubeUserIdLinkJson.keyToId.get(urltoid.id.toLowerCase());
                        if (channelId) return {
                            channelId: channelId,
                            userId: urltoid.id
                        }
                    }
                })();
                if (!idinfo) continue;

                const stat = await (() => {
                    return new Promise<fs.Stats | undefined>(resolve => {
                        fs.stat(oldDiscordMusicBotDirectoryPath + "/youtubeCache/" + filename, (err, stats) => {
                            if (err) resolve(undefined);
                            else resolve(stats)
                        })
                    })
                })();
                if (!stat) continue;

                const newInfo: YouTubeInfoData = {
                    id: info.videoId,
                    videoInfo: {
                        title: info.title,
                        description: info.description,
                        channelName: info.author.name,
                        thumbnailUrl: thumbnail,
                        channelId: idinfo.channelId,
                        videoId: info.videoId,
                        userId: idinfo.userId
                    },
                    musicBrainz: {},
                    sourceInfo: {
                        infoGetTimestamp: Date.now(),
                        sourceGetTimestamp: Date.now(),
                        filename: filename,
                        size: stat.size
                    }
                }
                await fileCopy(oldDiscordMusicBotDirectoryPath + "/youtubeCache", "./youtube", filename);
                json.youtube.push(newInfo);
                success++;
            }
        }
        progress.done = true;
        console.log("YouTube動画の移動が完了しました。" + youtubeInfoCacheJson.length + "個中" + success + "個が移動されました。");
    }
    if (youtubeUserInfoCacheJson !== undefined) {
        let success = 0;
        for (let i = 0; i < youtubeUserInfoCacheJson.length; i++) {
            const info = youtubeUserInfoCacheJson[i];
            if (info.id && info.snippet?.thumbnails) {
                if (json.youtubeUserIcons.find(inf => inf.id === info.id)) continue;
                const thumbnails = info.snippet.thumbnails;
                const url = thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url;
                if (!url) continue;
                json.youtubeUserIcons.push({ id: info.id, url: url });
                success++;
            }
        }
        console.log("YouTubeユーザーアイコン情報の移動が完了しました。" + youtubeUserInfoCacheJson.length + "個中" + success + "個が移動されました。");
    }
    if (niconicoInfoCache !== undefined && niconicoCacheFolderList !== undefined) {
        const progress = new ProgressView();
        progress.reflashrate = 60;
        let success = 0;
        for (let i = 0; i < niconicoInfoCache.length; i++) {
            const info = niconicoInfoCache[i];
            if (info.contentId && info.title && info.description && info.thumbnailUrl) {
                progress.message = "ニコニコ動画データ移動中 (" + i + "/" + niconicoInfoCache.length + ") " + success + "個成功";
                progress.percent = i / niconicoInfoCache.length * 100;

                if (json.niconico.find(i => i.id === info.contentId)) continue;

                const contentId = info.contentId;
                const filename = niconicoCacheFolderList.get(contentId);
                if (!filename) continue;

                const stat = await (() => {
                    return new Promise<fs.Stats | undefined>(resolve => {
                        fs.stat(oldDiscordMusicBotDirectoryPath + "/niconicoCache/" + filename, (err, stats) => {
                            if (err) resolve(undefined);
                            else resolve(stats)
                        })
                    })
                })();
                if (!stat) continue;

                const newInfo: niconicoInfoData = {
                    id: info.contentId,
                    videoInfo: {
                        title: info.title,
                        description: info.description,
                        id: info.contentId,
                        thumbnailUrl: info.thumbnailUrl,
                        channelId: info.userId,
                        channelName: info.userNickname
                    },
                    sourceInfo: {
                        infoGetTimestamp: Date.now(),
                        sourceGetTimestamp: Date.now(),
                        filename: filename,
                        size: stat.size
                    },
                    musicBrainz: {}
                }
                await fileCopy(oldDiscordMusicBotDirectoryPath + "/niconicoCache", "./niconico", filename);
                json.niconico.push(newInfo);
                success++;
            }
        }
        progress.done = true;
        console.log("ニコニコ動画データの移動が完了しました。" + niconicoInfoCache.length + "個中" + success + "個が移動されました。");
    }
    if (niconicoUserInfoCache !== undefined) {
        let success = 0;
        niconicoUserInfoCache.forEach(key => {
            if (key.iconUrl && key.id && !json.niconicoUserIcons.find(info => info.id === key.id)) {
                json.niconicoUserIcons.push({
                    id: key.id,
                    url: key.iconUrl
                });
                success++;
            }
        })
        console.log("ニコニコ動画ユーザーアイコン情報の移動が完了しました。" + niconicoUserInfoCache.length + "個中" + success + "個が移動されました。");
    }
    if (niconicoChannelInfoCache !== undefined) {
        let success = 0;
        niconicoChannelInfoCache.forEach(key => {
            if (key.iconUrl && key.id && !json.niconicoUserIcons.find(info => info.id === key.id)) {
                json.niconicoUserIcons.push({
                    id: key.id,
                    url: key.iconUrl
                });
                success++;
            }
        })
        console.log("ニコニコ動画チャンネルユーザーアイコン情報の移動が完了しました。" + niconicoChannelInfoCache.length + "個中" + success + "個が移動されました。");
    }
    if (twitterInfoCache !== undefined && twitterCacheFolderList !== undefined) {
        const progress = new ProgressView();
        progress.reflashrate = 60;
        let success = 0;
        let success2 = 0;
        for (let i = 0; i < twitterInfoCache.length; i++) {
            const info = twitterInfoCache[i];
            if (info.id && info.text && info.author?.id && info.media) {
                progress.message = "Twitter動画データ等移動中 (" + i + "/" + twitterInfoCache.length + ") " + success + "個成功";
                progress.percent = i / twitterInfoCache.length * 100;

                if (json.twitter.find(i => i.id === info.id)) continue;

                const id = info.id;
                const mainMediaInfo = info.media.filter(info => info.type === "video") as { type: "video", preview_image_url?: string; }[];

                const newInfos: TwitterInfoData = {
                    id: info.id,
                    videoInfos: [],
                    sourceInfos: [],
                    musicBrainzs: []
                }
                for (let i = 0; i < mainMediaInfo.length; i++) {
                    const mediainfo = mainMediaInfo[i];
                    if (!mediainfo.preview_image_url) continue;

                    const newInfo: TwitterInfo = {
                        id: info.id,
                        full: info.text,
                        body: info.text,
                        thumbnailUrl: mediainfo.preview_image_url,
                        userNumId: info.author.id,
                        userName: info.author.name,
                        userId: info.author.username
                    };

                    newInfos.videoInfos.push(newInfo)
                    const filename = twitterCacheFolderList.get(id + "-" + (i + 1));
                    if (!filename) continue;
                    const stat = await (() => {
                        return new Promise<fs.Stats | undefined>(resolve => {
                            fs.stat(oldDiscordMusicBotDirectoryPath + "/twitterCache/" + filename, (err, stats) => {
                                if (err) resolve(undefined);
                                else resolve(stats)
                            })
                        })
                    })();

                    if (!stat) continue;
                    const newSourceInfo: SourceInfo = {
                        infoGetTimestamp: Date.now(),
                        sourceGetTimestamp: Date.now(),
                        size: stat.size,
                        filename: filename
                    };
                    await fileCopy(oldDiscordMusicBotDirectoryPath + "/twitterCache", "./twitter", filename);
                    newInfos.sourceInfos.push(newSourceInfo);
                }
                json.twitter.push(newInfos);
                success++;
            }
            if (info.author?.id && info.author.profile_image_url && !json.twitterUserIcons.find(i => i.id === info.author?.id)) {
                json.twitterUserIcons.push({ id: info.author.id, url: info.author.profile_image_url });
                success2++;
            }
        }
        progress.done = true;
        console.log("Twitter動画データの移動が完了しました。" + twitterInfoCache.length + "個中" + success + "個が移動されました。");
        console.log("Twitterユーザーアイコン情報の移動が完了しました。" + twitterInfoCache.length + "個中" + success2 + "個が移動されました。");
    }
    console.log("過去の音楽botのデータ移行が完了しました。");

}
