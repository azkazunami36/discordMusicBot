import fs from "fs";
import { MusicLibraryJSON } from "../dbmgr/main.js";

export async function getOldData(oldDiscordMusicBotDirectoryPath: string, json: MusicLibraryJSON) {
    console.log("過去の音楽botのディレクトリ「" + oldDiscordMusicBotDirectoryPath + "」の内容をチェックします。必要に応じて、このミュージックライブラリにインポートします。");
    console.log("この処理には時間がかかる可能性があります。");
    const envJsonPath = oldDiscordMusicBotDirectoryPath + "/env.json";
    let envStatus;
    const albumInfoJsonPath = oldDiscordMusicBotDirectoryPath + "/albumInfo.json";
    let albumStatus;
    const youtubeInfoCacheJsonlPath = oldDiscordMusicBotDirectoryPath + "/cacheJSONs/youtubeInfoCache.jsonl";
    let ytinfoStatus: any[] | undefined;
    const youtubeThumbnailInfoCacheJsonlPath = oldDiscordMusicBotDirectoryPath + "/cacheJSONs/youtubeThumbnailLinkCache.jsonl";
    let ytthmbinfoStatus: any[] | undefined;
    const youtubeUserInfoCacheJsonlPath = oldDiscordMusicBotDirectoryPath + "/cacheJSONs/youtubeUserInfoCache.jsonl";
    let ytuserinfoStatus: any[] | undefined;
    if (fs.existsSync(envJsonPath)) {
        envStatus = JSON.parse(String(fs.readFileSync(envJsonPath)));
        console.log("env.jsonを読み込みました。");
    }
    if (fs.existsSync(albumInfoJsonPath)) {
        albumStatus = JSON.parse(String(fs.readFileSync(albumInfoJsonPath)));
        console.log("albumInfo.jsonを読み込みました。");
    }
    if (fs.existsSync(youtubeInfoCacheJsonlPath)) {
        const jsontexts = String(fs.readFileSync(youtubeInfoCacheJsonlPath)).split("\n").filter(Boolean);
        ytinfoStatus = [];
        jsontexts.forEach(jsontext => { try { ytinfoStatus?.push(JSON.parse(jsontext)) } catch { } });
        console.log("youtubeInfoCache.jsonを読み込みました。項目は" + ytinfoStatus.length + "個あります。");
    }
    if (fs.existsSync(youtubeThumbnailInfoCacheJsonlPath)) {
        const jsontexts = String(fs.readFileSync(youtubeThumbnailInfoCacheJsonlPath)).split("\n").filter(Boolean);
        ytthmbinfoStatus = [];
        jsontexts.forEach(jsontext => { try { ytthmbinfoStatus?.push(JSON.parse(jsontext)) } catch { } });
        console.log("youtubeThumbnailLinkCache.jsonを読み込みました。項目は" + ytthmbinfoStatus.length + "個あります。");
    }
    if (fs.existsSync(youtubeUserInfoCacheJsonlPath)) {
        const jsontexts = String(fs.readFileSync(youtubeUserInfoCacheJsonlPath)).split("\n").filter(Boolean);
        ytuserinfoStatus = [];
        jsontexts.forEach(jsontext => { try { ytuserinfoStatus?.push(JSON.parse(jsontext)) } catch { } });
        console.log("youtubeUserInfoCache.jsonを読み込みました。項目は" + ytuserinfoStatus.length + "個あります。");
    }
    console.log("JSONの読み取りが完了しました。音声キャッシュフォルダとJSONの照合を試みます。");
    if (ytinfoStatus !== undefined && ytthmbinfoStatus !== undefined && ytuserinfoStatus !== undefined) {
        const youtubeInfos = ytinfoStatus as {
            title?: string;
            description?: string;
            videoId?: string;
            author?: {
                url?: string;
            }
        }[];
        const videoIdtoThumbUrl = ytthmbinfoStatus as {
            videoId?: string;
            thumbnailUrl?: string;
        }[];
        ytuserinfoStatus
    }

}
