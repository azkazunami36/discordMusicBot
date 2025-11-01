import { Message, Guild, GuildMember, APIInteractionGuildMember } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { EnvData, Playlist, videoMetaCacheGet } from "../class/envJSON.js";
import { sourcePathManager } from "../class/sourcePathManager.js";
import { SumLog } from "../class/sumLog.js";
import { appleChunkHelper } from "../worker/helper/createByChatGPT/appleChunkHelper.js";
import { spotifyChunkHelper } from "../worker/helper/createByChatGPT/spotifyChunkHelper.js";
import { parseSpotifyUrl } from "../worker/helper/createByChatGPT/parseSpotifyUrlHelper.js";
import { parseAppleMusicUrl } from "../worker/helper/createByChatGPT/parseAppleMusicUrlHelper.js";
import { searchNicoVideo } from "../worker/helper/createByChatGPT/searchNicoVideoHelper.js";
import { getNicoMylistIds } from "../worker/helper/createByChatGPT/getNicoMylistIdsHelper.js";
import { parseNicoVideo } from "../createByChatGPT/niconico.js";
import { fetchPlaylistVideoIdsFromUrl } from "../worker/helper/createByChatGPT/youtubePlaylistToVideoIdsHelper.js";
import { youtubeUserInfoGet } from "../worker/helper/createByChatGPT/youtubeUserInfoGetHelper.js";
import { niconicoUserInfoGet } from "../worker/helper/createByChatGPT/niconicoInfoUserGetHelper.js";
import { niconicoChannelInfoGet } from "../worker/helper/createByChatGPT/niconicoChannelInfoGetHelper.js";
import { parseTweetId } from "../worker/helper/createByChatGPT/parseTweetIdHelper.js";

export async function urlToQueue(
    string: string,
    guildData: {
        guildId: string;
        guild: Guild;
        member: GuildMember | APIInteractionGuildMember;
    },
    priority: "youtube" | "youtubePlaylist" | "niconico" | "twitter" | string | null,
    message: Message,
    cb: (percent: number, status: "analyzing" | "searching" | "checkAndDownloading" | "done" | "failed", playlist: Playlist[], option: {
        analyzed: number;
    }) => void,
    option?: {
        soloAdd?: boolean;
        firstAdd?: boolean;
        urlOnly?: boolean;
        searchOnly?: boolean;
    }
) {
    function callback(percent: number, status: "analyzing" | "searching" | "checkAndDownloading" | "done" | "failed", playlist: Playlist[], option: {
        analyzed: number;
    }) { try { cb(percent, status, playlist, option); } catch { } };
    if (string === "") return;
    /** まずスペースで分割 */
    const words = string.split(/[ 　]+/);
    /** IDやURLとして認識できない単語をここにまとめる */
    let searchWords = "";
    const envData = new EnvData(guildData.guildId);
    const suminfo = { guildId: guildData.guildId, userId: guildData.member.user.id, functionName: "interaction add", textChannelId: message.channelId };
    let wordCheckProcessed = 0;
    /** まだ処理する前のURLです。 */
    const addQueue: {
        type: "youtube" | "niconico" | "applemusic" | "spotify" | "twitter";
        body: string;
        index: number;
        twitterIndex?: number;
    }[] = [];
    /** 処理済み */
    const addedPlaylist: Playlist[] = [];
    SumLog.log("キューに追加するためにテキストの分析を行います。テキストを分割し、された後のテキスト数は" + words.length + "個です。", suminfo);
    if (!option?.searchOnly) for (const word of words) {
        wordCheckProcessed++;
        callback((wordCheckProcessed / words.length) * 20, "analyzing", addedPlaylist, { analyzed: addQueue.length });
        if (word === "") continue;
        let videoIdData: string | undefined;
        const urlIs = word.startsWith("https://") || word.startsWith("http://");
        const resolvedId = await fetchPlaylistVideoIdsFromUrl(word);
        const niconicoMylist = await getNicoMylistIds(word);
        if (ytdl.validateURL(word))
            videoIdData = ytdl.getURLVideoID(word)
        if (!videoIdData && ytdl.validateURL("https://youtu.be/" + word))
            videoIdData = ytdl.getURLVideoID("https://youtu.be/" + word)
        if (videoIdData && !(resolvedId && resolvedId.videoIds.length !== 0 && priority === "youtubePlaylist")) {
            addQueue.push({ type: "youtube", body: videoIdData, index: addQueue.length });
            SumLog.log(word + "はYouTubeのIDとしてキューに追加されました。", suminfo);
            continue;
        }
        const nicovideoId = parseNicoVideo(word);
        if (nicovideoId) {
            addQueue.push({ type: "niconico", body: nicovideoId, index: addQueue.length });
            SumLog.log(word + "はニコニコ動画のIDとしてキューに追加されました。", suminfo);
        }
        const tweetId = await parseTweetId(word);
        if (tweetId) {
            addQueue.push({ type: "twitter", body: tweetId.id, twitterIndex: tweetId.index, index: addQueue.length });
            SumLog.log(word + "はXのIDとしてキューに追加されました。", suminfo);
        }
        const spotifyUrls = await parseSpotifyUrl(word);
        if (spotifyUrls) {
            SumLog.log(word + "はSpotify URLです。" + spotifyUrls.length + "個あります。一覧です。" + spotifyUrls.join(", "), suminfo);
            spotifyUrls.forEach(url => addQueue.push({ type: "spotify", body: url, index: addQueue.length }));
            continue;
        }
        const appleMusicUrls = await parseAppleMusicUrl(word);
        if (appleMusicUrls) {
            SumLog.log(word + "はApple Music URLです。" + appleMusicUrls.length + "個あります。一覧です。" + appleMusicUrls.join(", "), suminfo);
            appleMusicUrls.forEach(url => addQueue.push({ type: "applemusic", body: url, index: addQueue.length }));
            continue;
        }
        if (resolvedId) {
            SumLog.log(word + "はYouTubeプレイリストです。" + resolvedId.videoIds.length + "個あります。一覧です。" + resolvedId.videoIds.join(", "), suminfo);
            resolvedId.videoIds.forEach(url => addQueue.push({ type: "youtube", body: url, index: addQueue.length }));
            continue;
        }
        if (niconicoMylist) {
            SumLog.log(word + "はニコニコマイリストです。" + niconicoMylist.length + "個あります。一覧です。" + niconicoMylist.join(", "), suminfo);
            niconicoMylist.forEach(url => addQueue.push({ type: "niconico", body: url, index: addQueue.length }));
        }
        if (urlIs) continue;
        searchWords += searchWords === "" ? word : " " + word;
    }
    if (searchWords && !option?.urlOnly) {
        callback(30, "searching", addedPlaylist, { analyzed: addQueue.length });
        SumLog.log(searchWords + "はURLやIDとして分析できないため検索されます。", suminfo);
        const youtubeData = (await yts(searchWords)).videos[0].videoId;
        const niconicoData = (await searchNicoVideo(searchWords))?.[0]?.contentId;
        if (priority === "niconico") niconicoData ? addQueue.push({ type: "niconico", body: niconicoData, index: addQueue.length }) : youtubeData ? addQueue.push({ type: "youtube", body: youtubeData, index: addQueue.length }) : "";
        else youtubeData ? addQueue.push({ type: "youtube", body: youtubeData, index: addQueue.length }) : niconicoData ? addQueue.push({ type: "niconico", body: niconicoData, index: addQueue.length }) : "";
    }
    // 追加
    SumLog.log("解析・検索処理が完了したため、取得できたURL" + addQueue.length + "個の変換・有効性チェック・動画ダウンロードを開始します。一覧です。: " + addQueue.map(data => data.body).join(", "), suminfo);
    let parallelProcess = 1;
    addQueue.sort((a, b) => a.index - b.index);
    let sendTime = 0;
    let i = 0;
    while (i < addQueue.length) {
        const procData = addQueue.slice(i, i + parallelProcess);
        console.log(procData);
        const processedData: {
            index: number;
            playlist: Playlist;
        }[] = [];
        let failed = 0;
        send();
        function send() {
            const nowTime = Date.now();
            if (nowTime - sendTime > 1000) {
                callback(40 + ((addedPlaylist.length + processedData.length + failed) / addQueue.length) * 59, "checkAndDownloading", addedPlaylist, { analyzed: addQueue.length });
                sendTime = nowTime;
            }
        }
        const promise: (() => Promise<void>)[] = [];
        const youtube = procData.filter(data => data.type === "youtube");
        const niconico = procData.filter(data => data.type === "niconico");
        const applemusic = procData.filter(data => data.type === "applemusic");
        const spotify = procData.filter(data => data.type === "spotify");
        const twitter = procData.filter(data => data.type === "twitter");
        if (youtube.length !== 0) {
            youtube.forEach(data => {
                promise.push(async () => {
                    const playlist: Playlist = { type: "videoId", body: data.body };
                    const promiseResults = await Promise.allSettled([(async () => {
                        const meta = await videoMetaCacheGet(playlist);
                        if (meta && meta.body && meta.type === "videoId") {
                            await youtubeUserInfoGet(meta.body.author.url);
                        } else {
                            throw new Error("違う");
                        }
                    })(), sourcePathManager.getAudioPath(playlist).catch(e => console.error(e))]);
                    let failedIs = false;
                    for (const result of promiseResults) {
                        if (result.status === "rejected") {
                            failed++;
                            failedIs = true;
                            console.error(result.reason);
                        }
                    }
                    if (!failedIs) processedData.push({ index: data.index, playlist });
                    send();
                });
            });
        }
        if (niconico.length !== 0) {
            niconico.forEach(data => {
                promise.push(async () => {
                    const playlist: Playlist = { type: "nicovideoId", body: data.body };
                    const promiseResults = await Promise.allSettled([(async () => {
                        const meta = await videoMetaCacheGet(playlist);
                        if (meta && meta.body && meta.type === "nicovideoId") {
                            if (meta.body.userId) await niconicoUserInfoGet(meta.body.userId);
                            if (meta.body.channelId) await niconicoChannelInfoGet(meta.body.channelId);
                        } else {
                            throw new Error("違う");
                        }
                    })(), sourcePathManager.getAudioPath(playlist).catch(e => console.error(e))]);
                    let failedIs = false;
                    for (const result of promiseResults) {
                        if (result.status === "rejected") {
                            failed++;
                            failedIs = true;
                            console.error(result.reason);
                        }
                    }
                    if (!failedIs) processedData.push({ index: data.index, playlist });
                    send();
                });
            });
        }
        if (applemusic.length !== 0) {
            promise.push(async () => {
                for (let i = 0; i < applemusic.length; i += parallelProcess) {
                    const slice = applemusic.slice(i, i + parallelProcess);
                    const sorted = await appleChunkHelper(slice.map(data => data.body), i);
                    for (let i = 0; i < sorted.length; i++) {
                        const playlist = sorted[i];
                        const promiseResults = await Promise.allSettled([(async () => {
                            const meta = await videoMetaCacheGet(playlist);
                            if (meta && meta.body && meta.type === "videoId") {
                                await youtubeUserInfoGet(meta.body.author.url);
                            } else {
                                throw new Error("違う");
                            }
                        })(), sourcePathManager.getAudioPath(playlist).catch(e => console.error(e))]);
                        let failedIs = false;
                        for (const result of promiseResults) {
                            if (result.status === "rejected") {
                                failed++;
                                failedIs = true;
                                console.error(result.reason);
                            }
                        }
                        if (!failedIs) processedData.push({ index: slice[i]?.index || addedPlaylist.length + processedData.length, playlist });
                        send();
                    }
                }
            });
        }
        if (spotify.length !== 0) {
            promise.push(async () => {
                for (let i = 0; i < spotify.length; i += parallelProcess) {
                    const slice = spotify.slice(i, i + parallelProcess);
                    const sorted = await spotifyChunkHelper(slice.map(data => data.body), i);
                    for (let i = 0; i < sorted.length; i++) {
                        const playlist = sorted[i];
                        const promiseResults = await Promise.allSettled([(async () => {
                            const meta = await videoMetaCacheGet(playlist);
                            if (meta && meta.body && meta.type === "videoId") {
                                await youtubeUserInfoGet(meta.body.author.url);
                            } else {
                                throw new Error("違う");
                            }
                        })(), sourcePathManager.getAudioPath(playlist).catch(e => console.error(e))]);
                        let failedIs = false;
                        for (const result of promiseResults) {
                            if (result.status === "rejected") {
                                failed++;
                                failedIs = true;
                                console.error(result.reason);
                            }
                        }
                        if (!failedIs) processedData.push({ index: slice[i]?.index || addedPlaylist.length + processedData.length, playlist });
                        send();
                    }
                }
            });
        }
        if (twitter.length !== 0) {
            twitter.forEach(data => {
                promise.push(async () => {
                    const playlist: Playlist = { type: "twitterId", body: data.body };
                    const meta = await videoMetaCacheGet(playlist);
                    console.log(meta);
                    if (meta && meta.body && meta.type === "tweetId") {
                        let index = (data.twitterIndex || 0) - 1;
                        if (meta.body.media?.[index]?.type === "photo") throw new Error("これは写真であるため、取得ができません。");
                        if (index === -1) index = meta.body.media?.findIndex(data => data.type === "video" || data.type === "animated_gif") ?? -1;
                        if (index !== -1) {
                            const selected = meta.body.media?.[index];
                            const plIndex = meta.body.media?.filter(data => data.type === "video" || data.type === "animated_gif").findIndex(data => data.media_key === selected?.media_key) ?? -1;
                            if (plIndex !== -1) {
                                playlist.number = plIndex + 1;
                                await sourcePathManager.getAudioPath(playlist);
                                processedData.push({ index: data.index, playlist });
                            }
                        }
                    }
                    send();
                });
            });
        }
        const promiseResults = await Promise.allSettled(promise.map(fn => fn()));
        for (const result of promiseResults) {
            if (result.status === "rejected") {
                failed++;
                console.error(result.reason);
            }
        }
        const sorted = processedData.sort((a, b) => a.index - b.index).map(data => data.playlist);
        console.log(sorted)
        addedPlaylist.push(...sorted);
        if (option?.firstAdd) { envData.playlist.unshift(sorted[0]); break; } else envData.playlist.push(...sorted);
        i += parallelProcess;
        if (i > 0) parallelProcess = 5;
    }
    if (addedPlaylist.length <= 0) {
        SumLog.error(string + "はどのような手段を用いても取得ができませんでした。", suminfo);
        console.error("認識失敗: ", string);
        callback(100, "failed", addedPlaylist, { analyzed: addQueue.length });
        return;
    }
    SumLog.log(string + "を追加する処理が完了しました。一覧です。: " + addedPlaylist.map(data => data.body).join(", "), suminfo);
    callback(100, "done", addedPlaylist, { analyzed: addQueue.length });
}
