import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { EnvData } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";

export const command = new SlashCommandBuilder()
    .setName("add")
    .setDescription("曲を追加します。")
    .addStringOption(option => option
        .setName("text")
        .setDescription("音楽を追加することができます。URLまたはVideoIDまたは検索したいタイトルを入力してください。複数曲追加することは現時点ではできません。")
        .setRequired(true)
    )
export const commandExample = "/add text:[URLまたはVideoIDまたは検索したいタイトル]";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const data = interaction.options.getString("text");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        if (data === null) return await interaction.editReply("追加したい曲が指定されませんでした。入力してから追加を行なってください。");
        if (data === "") return await interaction.editReply("内容が空です。入力してから追加をしてください。");
        let videoId = data;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        await interaction.editReply("文字列を分析中...");
        // URLはVideoIDに変換
        if (ytdl.validateURL(videoId)) videoId = ytdl.getURLVideoID(videoId);
        // まだVideoIDではなかった場合
        if (!ytdl.validateID(videoId)) {
            await interaction.editReply("検索中...");
            // 検索
            const result = await yts(videoId);
            // 追加
            videoId = result.videos[0].videoId;
            // まだVideoIDではなかった場合
            if (!ytdl.validateID(videoId)) return await interaction.editReply("「" + data + "」は有効な内容として認識することができず、追加ができませんでした。再度追加するか、botの作成者に相談してください。");
        }
        // 追加
        playlist.push({
            type: "videoId",
            body: videoId
        });
        const envData = new EnvData(guildData.guildId);
        envData.playlistSave(playlist);
        const cache = await inputData.videoCache.cacheGet(videoId);
        await interaction.editReply("「" + (cache ? cache.title : "タイトル取得エラー(VideoID: " + videoId + ")") + "」を追加しました。")
    }
}
