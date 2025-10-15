import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { EnvData, Playlist, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { parseNicoVideo, searchNicoVideo } from "../niconico.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";
import { parseTweetId } from "../twitter.js";
import { fetchPlaylistVideoIdsFromUrl } from "../youtube.js";

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
        .setDescription("優先するサービスです。動画URLだけどプレイリストがあったら取得したいときはプレイリストを選択します。検索次に優先したいサービスがあれば、それを選択します。")
        .addChoices(
            { name: "YouTube", value: "youtube" },
            { name: "YouTubeプレイリスト", value: "youtubePlaylist" },
            { name: "ニコニコ動画", value: "niconico" }
        )
    )
export const commandExample = "/add text:[URLまたはVideoIDまたは検索したいタイトル]";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        /** 検索するテキストデータ */
        const data = interaction.options.getString("text");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        if (data === null) return await interaction.editReply({ embeds: [messageEmbedGet("追加したい曲が指定されませんでした。入力してから追加を行なってください。", interaction.client)] });
        if (data === "") return await interaction.editReply({ embeds: [messageEmbedGet("内容が空です。入力してから追加をしてください。", interaction.client)] });
        const priority = interaction.options.getString("service");
        /** まずスペースで分割 */
        const words = data.split(/[ 　]+/);
        /** IDやURLとして認識できない単語をここにまとめる */
        let searchWords = "";
        /** 取得できたVideoIDやニコニコ動画のIDをここにまとめます。 */
        const getContents: Playlist[] = [];
        await interaction.editReply({ embeds: [messageEmbedGet("文字列を分析中...", interaction.client)] });
        let playlistCheckingStatusSendedIs = false;
        const videoMetaCache = new VideoMetaCache();
        for (const word of words) {
            if (word === "") continue;
            let videoIdData: Playlist | undefined;
            const resolvedId = await fetchPlaylistVideoIdsFromUrl(word);
            console.log(resolvedId);
            let nicovideoIdData: Playlist | undefined;
            if (ytdl.validateURL(word)) videoIdData = {
                type: "videoId",
                body: ytdl.getURLVideoID(word)
            };
            const nicovideoId = parseNicoVideo(word);
            if (nicovideoId) nicovideoIdData = {
                type: "nicovideoId",
                body: nicovideoId
            };
            if (videoIdData && !(resolvedId && resolvedId.videoIds.length !== 0 && priority === "youtubePlaylist")) {
                getContents.push(videoIdData);
                continue;
            }
            if (resolvedId) {
                if (!playlistCheckingStatusSendedIs) {
                    playlistCheckingStatusSendedIs = true;
                }
                for (const item of resolvedId.videoIds) {
                    const playlistData: {
                        type: "videoId";
                        body: string;
                    } = {
                        type: "videoId",
                        body: item
                    };
                    if (item && ytdl.validateID(item)) getContents.push(playlistData);
                }
                continue;
            }
            searchWords += searchWords === "" ? word : " " + word;
        }
        if (searchWords) {
            await interaction.editReply({ embeds: [messageEmbedGet("検索中...", interaction.client)] });
            const youtubeResult = await yts(searchWords);
            const youtubeData: {
                type: "videoId",
                body: string
            } | undefined = youtubeResult.videos[0] ? {
                type: "videoId",
                body: youtubeResult.videos[0].videoId
            } : undefined;
            const niconicoResult = await searchNicoVideo(searchWords);
            const niconicoData: {
                type: "nicovideoId",
                body: string
            } | undefined = (niconicoResult && niconicoResult[0]) ? {
                type: "nicovideoId",
                body: niconicoResult[0].contentId
            } : undefined;
            if (priority === "niconico") niconicoData ? getContents.push(niconicoData) : youtubeData ? getContents.push(youtubeData) : "";
            else if (priority === "youtube") youtubeData ? getContents.push(youtubeData) : niconicoData ? getContents.push(niconicoData) : "";
        }

        if (getContents.length <= 0) return await interaction.editReply({ embeds: [messageEmbedGet("「" + data + "」は有効な内容として認識することができず、追加ができませんでした。再度追加するか、botの作成者に相談してください。", interaction.client)] });
        // 追加
        const truePlaylist: Playlist[] = [];
        let processed = 0;
        let sendTime = 0;
        for (const playlistData of getContents) {
            processed++;
            const nowTime = Date.now();
            if (nowTime - sendTime > 2000) {
                sendTime = nowTime;
                await interaction.editReply({ embeds: [messageEmbedGet("取得した動画の有効性をチェック中...(" + processed + "/" + getContents.length + ")", interaction.client)] });
            }
            if (await videoMetaCache.cacheGet(playlistData)) truePlaylist.push(playlistData);
        }
        playlist.push(...truePlaylist);
        const envData = new EnvData(guildData.guildId);
        envData.playlistSave(playlist);

        await interaction.editReply({ embeds: [messageEmbedGet("取得操作が完了し、結果レポート作成中...", interaction.client)] });
        const embed = await videoInfoEmbedGet(truePlaylist, (truePlaylist.length === 1 ? "" : truePlaylist.length) + "曲が追加されました。", interaction.client);
        await interaction.editReply({ embeds: [embed] });
    }
}
