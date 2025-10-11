import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { EnvData, Playlist } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { parseNicoVideo, searchNicoVideo } from "../niconico.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";
import { parseTweetId } from "../twitter.js";

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
        .addChoices({ name: "YouTube", value: "youtube" }, { name: "ニコニコ動画", value: "niconico" }, { name: "X", value: "twitter" })
    )
export const commandExample = "/add text:[URLまたはVideoIDまたは検索したいタイトル]";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const data = interaction.options.getString("text");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        if (data === null) return await interaction.editReply({ embeds: [messageEmbedGet("追加したい曲が指定されませんでした。入力してから追加を行なってください。", interaction.client)] });
        if (data === "") return await interaction.editReply({ embeds: [messageEmbedGet("内容が空です。入力してから追加をしてください。", interaction.client)] });
        const priority = interaction.options.getString("service");
        const result = await (async function analysisStr(string: string, priority?: "youtube" | "niconico" | "twitter"): Promise<Playlist | undefined> {
            await interaction.editReply({ embeds: [messageEmbedGet("文字列を分析中...", interaction.client)] });
            if (ytdl.validateURL(string)) return {
                type: "videoId",
                body: ytdl.getURLVideoID(string)
            };
            const nicovideoId = parseNicoVideo(string);
            if (nicovideoId) return {
                type: "nicovideoId",
                body: nicovideoId
            };
            const twitterId = await parseTweetId(string);
            if (0 && twitterId) return {
                type: "twitterId",
                body: twitterId
            }
            await interaction.editReply({ embeds: [messageEmbedGet("検索中...", interaction.client)] });

            async function search(string: string, type: "youtube" | "niconico" | "twitter"): Promise<Playlist | undefined> {
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
        if (!result) return await interaction.editReply({ embeds: [messageEmbedGet("「" + data + "」は有効な内容として認識することができず、追加ができませんでした。再度追加するか、botの作成者に相談してください。", interaction.client)] });
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        // 追加
        playlist.push(result);
        const envData = new EnvData(guildData.guildId);
        envData.playlistSave(playlist);

        const embed = await videoInfoEmbedGet(result, "曲が追加されました。");
        await interaction.editReply({ embeds: [embed] });
    }
}
