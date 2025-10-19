import { APIEmbedField, Client, EmbedBuilder } from "discord.js";
import fs from "fs";
import { EnvData, Playlist, videoMetaCacheGet } from "./envJSON.js";
import { numberToTimeString } from "../createByChatGPT/numberToTimeString.js";
import { SumLog } from "../class/sumLog.js";
import { youtubeUserInfoGet } from "../worker/helper/createByChatGPT/youtubeUserInfoGetHelper.js";
import { niconicoUserInfoGet } from "../worker/helper/createByChatGPT/niconicoInfoUserGetHelper.js";
import { niconicoChannelInfoGet } from "../worker/helper/createByChatGPT/niconicoChannelInfoGetHelper.js";
import { youtubeThumbnailGet } from "../worker/helper/createByChatGPT/youtubeThumbnailGetHelper.js";
import { musicBrainz } from "../worker/helper/createByChatGPT/musicBrainzInfoHelper.js";

export async function videoInfoEmbedGet(playlistDatas: Playlist[], message: string, client: Client) {
    const startTime = Date.now();
    if (playlistDatas.length === 1) {
        const playlistData = playlistDatas[0];
        const meta = await videoMetaCacheGet(playlistData);
        let authorName = "取得ができませんでした。";
        let authorUrl: string | undefined;
        let authorIconUrl: string | undefined;
        let videoTitle = (meta?.type !== "tweetId" ? meta?.body?.title : meta.body?.text) || "取得ができませんでした。";
        let videoUrl: string | undefined;
        let videoThumbnail: string | undefined;
        let serviceColor: "NotQuiteBlack" | "Red" | "Grey" = "NotQuiteBlack";
        let serviceMessage = "エラー";
        let serviceIconUrl: string | undefined;
        if (meta?.body) if (meta.type === "videoId") {
            const data = await youtubeUserInfoGet(meta.body.author.url);
            if (data) {
                authorName = data?.snippet?.localized?.title || data?.snippet?.title || "取得に失敗";
                authorUrl = data?.id ? "https://youtube.com/channel/" + data?.id : "";
                authorIconUrl = data?.snippet?.thumbnails?.maxres?.url || data?.snippet?.thumbnails?.high?.url || data?.snippet?.thumbnails?.medium?.url || data?.snippet?.thumbnails?.standard?.url || data?.snippet?.thumbnails?.default?.url || "";
            }
            const albumInfoJson: {
                youtubeLink: {
                    videoId: {
                        [videoId: string]: {
                            recording: string;
                            release: string;
                        }
                    }
                }
            } = JSON.parse(String(fs.readFileSync("albumInfo.json")));
            if (albumInfoJson.youtubeLink.videoId[playlistData.body]) {
                const recordingInfo = await musicBrainz.recordingInfoGet(albumInfoJson.youtubeLink.videoId[playlistData.body].recording);
                const releaseInfo = await musicBrainz.releaseInfoGet(albumInfoJson.youtubeLink.videoId[playlistData.body].release);
                const artistInfo = releaseInfo["artist-credit"] ? await musicBrainz.artistInfoGet(releaseInfo["artist-credit"][0].artist.id) : undefined;
                videoTitle = recordingInfo.title;
                if (artistInfo) authorName = artistInfo.name;
            }

            videoUrl = meta.body.url;
            videoThumbnail = albumInfoJson.youtubeLink.videoId[playlistData.body] ? "https://coverartarchive.org/release/" + albumInfoJson.youtubeLink.videoId[playlistData.body].release + "/front" : await youtubeThumbnailGet(playlistData.body) || meta.body.thumbnail;
            serviceColor = "Red";
            serviceMessage = "Service by YouTube (ID: " + playlistData.body + ")";
            serviceIconUrl = "https://azkazunami36.github.io/URL-basedData/yt_icon_red_digital.png";
        } else if (meta.type === "nicovideoId") {
            if (meta.body.userId) {
                const userData = await niconicoUserInfoGet(meta.body.userId);
                if (userData) {
                    authorName = (userData?.name.endsWith(" - ニコニコ") ? userData.name.slice(0, userData.name.length - 7) : userData.name) || "取得に失敗";
                    authorUrl = userData?.id ? "https://www.nicovideo.jp/user/" + userData?.id : "";
                    authorIconUrl = userData?.iconUrl || "";
                }
            }
            if (meta.body.channelId) {
                const channelData = await niconicoChannelInfoGet(meta.body.channelId.startsWith("ch") ? meta.body.channelId : "ch" + meta.body.channelId);
                authorName = (channelData?.name.endsWith(" - ニコニコ") ? channelData.name.slice(0, channelData.name.length - 7) : channelData?.name) || "取得に失敗";
                authorUrl = channelData?.id ? "https://www.nicovideo.jp/user/" + channelData?.id : "";
                authorIconUrl = channelData?.iconUrl || "";
            }
            videoUrl = "https://www.nicovideo.jp/watch/" + meta.body.contentId;
            videoThumbnail = meta.body.thumbnailUrl || "";
            serviceColor = "Grey";
            serviceMessage = "Service by ニコニコ動画 (ID: " + playlistData.body + ")";
            serviceIconUrl = "https://azkazunami36.github.io/URL-basedData/nc296562_ニコニコ_シンボルマーク_白.png";
        } else if (meta.type === "tweetId") {
            if (meta.body.author?.id) {
                const userData = undefined;
                if (userData) {
                    authorName = userData || "取得に失敗";
                    authorUrl = userData ? "https://www.nicovideo.jp/user/" + userData : "";
                    authorIconUrl = userData || "";
                }
            }
            videoUrl = "https://www.x/com/i/web/status/" + meta.body.id;
            videoThumbnail = "";
            serviceColor = "Grey";
            serviceMessage = "Service by X (ID: " + playlistData.body + ")";
            serviceIconUrl = "https://azkazunami36.github.io/URL-basedData/x-logo.png";
        }
        const embed = new EmbedBuilder()
        if (authorIconUrl) embed.setAuthor({
            name: authorName,
            url: authorUrl,
            iconURL: authorIconUrl,
        })
        embed.setTitle(videoTitle);
        if (videoUrl) embed.setURL(videoUrl);
        embed.setDescription(message);
        embed.setColor(serviceColor);
        embed.setFooter({
            text: serviceMessage,
            iconURL: serviceIconUrl,
        });
        if (videoThumbnail) if (meta?.type === "videoId") embed.setImage(videoThumbnail);
        else embed.setThumbnail(videoThumbnail);
        SumLog.log("動画のサムネイルを表示するEmbedを作成しました。作成にかかった時間は" + Math.floor((Date.now() - startTime) / 1000) + "秒です。", { functionName: "videoInfoEmbedGet" });
        return embed;
    } else {
        const fields: APIEmbedField[] = [];
        for (let i = 0; i < playlistDatas.length; i++) {
            if (playlistDatas.length > 5 && i === 2) {
                fields.push({
                    name: (i + 1) + "-" + (playlistDatas.length - 2) + ". 省略",
                    value: "詳細は`/status`コマンドでチェック"
                });
                i = playlistDatas.length - 2;
            }
            const playlistData = playlistDatas[i];
            const meta = await videoMetaCacheGet(playlistData);
            let videoTitle = (meta?.type !== "tweetId" ? meta?.body?.title : meta.body?.text) || "取得ができませんでした。";
            if (meta?.body) {
                if (playlistData.type === "videoId") {
                    const albumInfoJson: {
                        youtubeLink: {
                            videoId: {
                                [videoId: string]: {
                                    recording: string;
                                    release: string;
                                }
                            }
                        }
                    } = JSON.parse(String(fs.readFileSync("albumInfo.json")));
                    if (albumInfoJson.youtubeLink.videoId[playlistData.body]) {
                        const recordingInfo = await musicBrainz.recordingInfoGet(albumInfoJson.youtubeLink.videoId[playlistData.body].recording);
                        videoTitle = recordingInfo.title;
                    }
                    fields.push({
                        name: (i + 1) + ". " + videoTitle,
                        value: "動画サービス: `YouTube` ID: `" + playlistData.body + "`"
                    })
                } else if (playlistData.type === "nicovideoId") {
                    fields.push({
                        name: (i + 1) + ". " + videoTitle,
                        value: "動画サービス: `ニコニコ動画` ID: `" + playlistData.body + "`"
                    });
                } else {
                    fields.push({
                        name: (i + 1) + ". " + videoTitle,
                        value: "動画サービス: `不明` ID: `" + playlistData.body + "`"
                    });
                }
            } else {
                fields.push({
                    name: (i + 1) + ". " + videoTitle,
                    value: "動画サービス: `不明` ID: `" + playlistData.body + "`"
                });
            }
        }
        const embed = new EmbedBuilder()
            .setAuthor({
                name: "音楽bot",
                iconURL: client.user?.avatarURL() || undefined,
            })
            .setDescription(message)
            .addFields(fields)
            .setColor("Purple");
        SumLog.log("複数の動画の情報を示すEmbedを作成しました。作成にかかった時間は" + Math.floor((Date.now() - startTime) / 1000) + "秒です。", { functionName: "videoInfoEmbedGet" });
        return embed;
    }
}

export async function statusEmbedGet(data: {
    guildId: string;
    page: number;
    client: Client;
    playlist: Playlist[];
    playing?: {
        playingPlaylist?: Playlist;
        playingTime?: number;
    }
}) {
    const startTime = Date.now();
    const { client, guildId, page, playlist } = data;
    const albumInfoJson: {
        youtubeLink: {
            videoId: {
                [videoId: string]: {
                    recording: string;
                    release: string;
                }
            }
        }
    } = JSON.parse(String(fs.readFileSync("albumInfo.json")));
    const playlistPage = Math.ceil(playlist.length / 5);
    const selectPlaylistPage = page < playlistPage ? page : playlistPage;
    const fields: APIEmbedField[] = [];
    const viewPlaylists = playlist.slice((selectPlaylistPage - 1) * 5, (selectPlaylistPage - 1) * 5 + 5);
    for (let i = 0; i < viewPlaylists.length; i++) {
        const playlistData = viewPlaylists[i];
        const meta = await videoMetaCacheGet(playlistData);
        if (meta?.body) if (meta.type === "videoId") {
            fields.push({
                name: ((selectPlaylistPage - 1) * 5 + i + 1) + ". " + (albumInfoJson.youtubeLink.videoId[playlistData.body] !== undefined ? (await musicBrainz.recordingInfoGet(albumInfoJson.youtubeLink.videoId[playlistData.body].recording)).title : meta.body.title),
                value: "動画時間: `" + numberToTimeString(meta.body.duration.seconds) + "` 動画サービス: `YouTube` ID: `" + playlistData.body + "`",
                inline: false
            });
        } else if (meta.type === "nicovideoId") {
            fields.push({
                name: ((selectPlaylistPage - 1) * 5 + i + 1) + ". " + meta.body.title,
                value: "動画時間: `" + (!Number.isNaN(Number(meta.body.lengthSeconds)) ? numberToTimeString(Number(meta.body.lengthSeconds)) : "不明") + "` 動画サービス: `ニコニコ動画` ID: `" + playlistData.body + "`",
                inline: false
            });
        } else if (meta.type === "tweetId") {
            fields.push({
                name: ((selectPlaylistPage - 1) * 5 + i + 1) + ". " + (meta.body.text),
                value: "動画時間: `" + (!Number.isNaN(Number(meta.body.media ? (meta.body.media[playlistData.number || 0].duration_ms || 0) / 1000 : 0)) ? numberToTimeString(Number(meta.body.media ? (meta.body.media[playlistData.number || 0].duration_ms || 0) / 1000 : 0)) : "不明") + "` 動画サービス: `X` ID: `" + playlistData.body + "`",
                inline: false
            });
        } else {
            fields.push({
                name: ((selectPlaylistPage - 1) * 5 + i + 1) + ". " + "不明",
                value: "動画時間: `不明` 動画サービス: `不明` ID: `" + playlistData.body + "`",
                inline: false
            });
        }
    }
    if (playlistPage === 0) fields.push({
        name: "曲を追加しましょう",
        value: "`/add text:[URLまたは検索したい文字列]`で追加できます。"
    })
    const envData = new EnvData(guildId);
    fields.push({
        name: "キューページ",
        value: playlistPage + "ページ中" + selectPlaylistPage + "ページ目",
        inline: false
    },
        {
            name: "その他の情報",
            value: "",
            inline: false
        },
        {
            name: "再生位置",
            value: data.playing?.playingTime ? numberToTimeString(data.playing.playingTime) : "再生していません。",
            inline: true
        },
        {
            name: "スピード",
            value: envData.playTempo + "倍速",
            inline: true
        },
        {
            name: "音程",
            value: String(envData.playPitch),
            inline: true
        },
        {
            name: "音量",
            value: envData.volume + "%",
            inline: true
        },
        {
            name: "リピート",
            value: (() => { switch (envData.playType) { case 1: return "オフ"; case 2: return "オン"; case 3: return "１曲のみ" } })(),
            inline: true
        })
    const embed = new EmbedBuilder()
        .setAuthor({
            name: "音楽bot",
            iconURL: client.user?.avatarURL() || undefined,
        })
        .setDescription("キュー")
        .addFields(fields)
        .setColor("Purple")
    if (data.playing?.playingPlaylist) {
        const meta = await videoMetaCacheGet(data.playing.playingPlaylist);
        if (meta?.body) {
            const thumbnail = meta.type === "videoId" ? (albumInfoJson.youtubeLink.videoId[data.playing.playingPlaylist.body] !== undefined ? "https://coverartarchive.org/release/" + albumInfoJson.youtubeLink.videoId[data.playing.playingPlaylist.body].release + "/front" : await youtubeThumbnailGet(data.playing.playingPlaylist.body) || meta.body.thumbnail) : meta.type === "nicovideoId" ? meta.body.thumbnailUrl : "";
            if (thumbnail) embed.setThumbnail(thumbnail);
            embed.setURL(data.playing.playingPlaylist.type === "videoId" ? "https://youtu.be/" + data.playing.playingPlaylist.body : data.playing.playingPlaylist.type === "nicovideoId" ? "https://www.nicovideo.jp/watch/" + data.playing.playingPlaylist.body : "https://www.x/com/i/web/status/" + data.playing.playingPlaylist.body);
        }
        embed.setTitle("再生中 - " + ((meta?.type !== "tweetId" ? meta?.type === "videoId" ? (albumInfoJson.youtubeLink.videoId[data.playing.playingPlaylist.body] !== undefined ? (await musicBrainz.recordingInfoGet(albumInfoJson.youtubeLink.videoId[data.playing.playingPlaylist.body].recording)).title : meta.body?.title) : meta?.body?.title : meta.body?.text) || "タイトル取得エラー"));
    } else {
        embed.setTitle("再生していません");
    }
    SumLog.log("/statusコマンド用Embedを作成しました。作成にかかった時間は" + Math.floor((Date.now() - startTime) / 1000) + "秒です。", { functionName: "statusEmbedGet" });
    return embed;
}

export function messageEmbedGet(message: string, client: Client) {
    return new EmbedBuilder()
        .setTitle("メッセージ")
        .setAuthor({
            name: "音楽bot",
            iconURL: client.user?.avatarURL() || undefined,
        })
        .setDescription(message)
        .setColor("Purple")
}
