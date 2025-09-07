import { APIEmbedField, Client, EmbedBuilder } from "discord.js";
import { EnvData, Playlist, VideoMetaCache } from "./envJSON.js";
import { numberToTimeString } from "./numberToTimeString.js";

export async function videoInfoEmbedGet(playlistData: Playlist, message: string) {
    const videoMetaCache = new VideoMetaCache();
    const meta = await videoMetaCache.cacheGet(playlistData);
    let authorName = "取得ができませんでした。";
    let authorUrl: string | undefined;
    let authorIconUrl: string | undefined;
    let videoTitle = (meta?.body?.title || "取得ができませんでした。");
    let videoUrl: string | undefined;
    let videoThumbnail: string | undefined;
    let serviceColor: "NotQuiteBlack" | "Red" | "Grey" = "NotQuiteBlack";
    let serviceMessage = "エラー";
    let serviceIconUrl: string | undefined;
    if (meta?.body) if (meta.type === "videoId") {
        const data = await videoMetaCache.youtubeUserInfoGet(meta.body.author.url);
        if (data) {
            authorName = data?.snippet?.localized?.title || data?.snippet?.title || "取得に失敗";
            authorUrl = data?.id ? "https://youtube.con/channel/" + data?.id : "";
            authorIconUrl = data?.snippet?.thumbnails?.maxres?.url || data?.snippet?.thumbnails?.high?.url || data?.snippet?.thumbnails?.medium?.url || data?.snippet?.thumbnails?.standard?.url || data?.snippet?.thumbnails?.default?.url || "";
        }
        videoUrl = meta.body.url;
        videoThumbnail = meta.body.thumbnail;
        serviceColor = "Red";
        serviceMessage = "Service by YouTube";
        serviceIconUrl = "https://azkazunami36.github.io/URL-basedData/yt_icon_red_digital.png";
    } else if (meta.type === "nicovideoId") {
        if (meta.body.userId) {
            const userData = await videoMetaCache.niconicoUserInfoGet(meta.body.userId);
            if (userData) {
                authorName = userData?.name || "取得に失敗";
                authorUrl = userData?.id ? "https://www.nicovideo.jp/user/" + userData?.id : "";
                authorIconUrl = userData?.iconUrl || "";
            }
        }
        if (meta.body.channelId) {
            const channelData = await videoMetaCache.niconicoChannelInfoGet(meta.body.channelId.startsWith("ch") ? meta.body.channelId : "ch" + meta.body.channelId);
            authorName = channelData?.name || "取得に失敗";
            authorUrl = channelData?.id ? "https://www.nicovideo.jp/user/" + channelData?.id : "";
            authorIconUrl = channelData?.iconUrl || "";
        }
        videoUrl = "https://www.nicovideo.jp/watch/" + meta.body.contentId;
        videoThumbnail = meta.body.thumbnailUrl || "";
        serviceColor = "Grey";
        serviceMessage = "Service by ニコニコ動画";
        serviceIconUrl = "https://azkazunami36.github.io/URL-basedData/nc296562_ニコニコ_シンボルマーク_白.png";
    };
    const embed = new EmbedBuilder()
    if (authorUrl && authorIconUrl) embed.setAuthor({
        name: authorName,
        url: authorUrl,
        iconURL: authorIconUrl,
    })
    embed.setTitle(videoTitle)
    if (videoUrl) embed.setURL(videoUrl)
    embed.setDescription(message)
    if (serviceColor) embed.setColor(serviceColor)
    embed.setFooter({
        text: serviceMessage,
        iconURL: serviceIconUrl,
    });
    if (videoThumbnail) if (meta?.type === "videoId") embed.setImage(videoThumbnail);
    else embed.setThumbnail(videoThumbnail);
    return embed;
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
    const { client, guildId, page, playlist } = data;
    const videoMetaCache = new VideoMetaCache();
    const playlistPage = Math.ceil(playlist.length / 5);
    const selectPlaylistPage = page < playlistPage ? page : playlistPage;
    const fields: APIEmbedField[] = [];
    const viewPlaylists = playlist.slice((selectPlaylistPage - 1) * 5, (selectPlaylistPage - 1) * 5 + 5);
    for (let i = 0; i < viewPlaylists.length; i++) {
        const playlistData = viewPlaylists[i];
        const meta = await videoMetaCache.cacheGet(playlistData);
        if (meta?.body) if (meta.type === "videoId") {
            fields.push({
                name: ((selectPlaylistPage - 1) * 5 + i + 1) + ". " + meta.body.title,
                value: "動画時間: `" + numberToTimeString(meta.body.duration.seconds) + "` 動画サービス: `YouTube`",
                inline: false
            });
        } else if (meta.type === "nicovideoId") {
            fields.push({
                name: (i + 1) + ". " + meta.body.title,
                value: "動画時間: `" + (!Number.isNaN(Number(meta.body.lengthSeconds)) ? numberToTimeString(Number(meta.body.lengthSeconds)) : "不明") + "` 動画サービス: `ニコニコ動画`",
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
        name: "プレイリストページ",
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
            value: envData.playSpeed + "倍速",
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
            iconURL: client.user?.avatarURL() || "",
        })
        .setDescription("プレイリスト")
        .addFields(fields)
        .setColor("Purple")
    if (data.playing?.playingPlaylist) {
        const meta = await videoMetaCache.cacheGet(data.playing.playingPlaylist);
        if (meta?.body) {
            const thumbnail = meta.type === "videoId" ? meta.body.thumbnail : meta.body.thumbnailUrl;
            if (thumbnail) embed.setThumbnail(thumbnail);
            embed.setURL(meta?.type === "videoId" ? meta.body.url : "https://www.nicovideo.jp/user/" + meta.body.userId);
        }
        embed.setTitle("再生中 - " + (meta?.body?.title || "タイトル取得エラー"));
    } else {
        embed.setTitle("再生していません")
    }
    return embed;
}

export function messageEmbedGet(message: string) {
    return new EmbedBuilder()
        .setDescription(message)
        .setColor("Purple")
}
