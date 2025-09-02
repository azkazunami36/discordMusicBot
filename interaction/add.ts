import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { CacheGetReturn, EnvData, Playlist, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { parseNicoVideo, searchNicoVideo } from "../ niconico.js";
import { numberToTimeString } from "../numberToTimeString.js";

export const command = new SlashCommandBuilder()
    .setName("add")
    .setDescription("曲を追加します。")
    .addStringOption(option => option
        .setName("text")
        .setDescription("音楽を追加することができます。URLまたはVideoIDまたは検索したいタイトルを入力してください。複数曲追加することは現時点ではできません。")
        .setRequired(true)
    )
    .addStringOption(option => option
        .setName("service")
        .setDescription("ダウンロードするサービスを優先して選びます。URLだった場合は自動で選択されます。")
        .addChoices({ name: "YouTube", value: "youtube" }, { name: "ニコニコ動画", value: "niconico" })
    )
export const commandExample = "/add text:[URLまたはVideoIDまたは検索したいタイトル]";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const data = interaction.options.getString("text");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        if (data === null) return await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription("追加したい曲が指定されませんでした。入力してから追加を行なってください。")
            ]
        });
        if (data === "") return await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription("内容が空です。入力してから追加をしてください。")
            ]
        });
        const priority = interaction.options.getString("service");
        const result = await (async function analysisStr(string: string, priority?: "youtube" | "niconico"): Promise<Playlist | undefined> {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("文字列を分析中...")
                ]
            });
            if (ytdl.validateURL(string)) return {
                type: "videoId",
                body: ytdl.getURLVideoID(string)
            };
            const nicovideoId = parseNicoVideo(string);
            if (nicovideoId) return {
                type: "nicovideoId",
                body: nicovideoId
            };
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("検索中...")
                ]
            });

            async function search(string: string, type: "youtube" | "niconico"): Promise<Playlist | undefined> {
                if (type === "youtube") {
                    const result = await yts(string);
                    return result.videos[0] ? {
                        type: "videoId",
                        body: result.videos[0].videoId
                    } : undefined;
                }
                if (type === "niconico") {
                    const result = await searchNicoVideo(string);
                    return (result && result[0]) ? {
                        type: "nicovideoId",
                        body: result[0].contentId
                    } : undefined;
                }
            }
            const one = priority ? (priority === "niconico" ? "niconico" : "youtube") : "youtube";
            const two = priority ? (priority === "niconico" ? "youtube" : "niconico") : "niconico";
            return await search(string, one) || await search(string, two);
        })(data, priority === null ? undefined : priority === "youtube" ? "youtube" : "niconico");
        if (!result) return await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription("「" + data + "」は有効な内容として認識することができず、追加ができませんでした。再度追加するか、botの作成者に相談してください。")
            ]
        });
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        // 追加
        playlist.push(result);
        const envData = new EnvData(guildData.guildId);
        envData.playlistSave(playlist);
        const videoMetaCache = new VideoMetaCache();
        async function videoInfoEmbedGet(playlistData: Playlist, message: string) {
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
        const embed = await videoInfoEmbedGet(result, "曲が追加されました。");
        await interaction.editReply({
            embeds: [embed]
        });
    }
}
