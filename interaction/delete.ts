import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { EnvData, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";

export const command = new SlashCommandBuilder()
    .setName("delete")
    .setDescription("キュー内の曲を削除します。")
    .addNumberOption(option => option
        .setName("number")
        .setDescription("削除したい曲の番号を指定します。")
        .setRequired(true)
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        if (await variableExistCheck.playlistIsEmpty()) return;
        const number = interaction.options.getNumber("number");
        if (number === null) return await interaction.editReply({ embeds: [messageEmbedGet("番号が入力されていません。番号を入力してから再度実行してください。", interaction.client)] });
        if (playlist[number - 1]) {
            const playlistData = playlist.splice(number - 1, 1)[0];
            const envData = new EnvData(guildData.guildId);
            envData.playlistSave(playlist);
            const videoMetaCache = new VideoMetaCache();
            const meta = await videoMetaCache.cacheGet(playlistData);
            await interaction.editReply({ embeds: [await videoInfoEmbedGet(playlistData, "曲を削除しました。")] });
        } else {
            await interaction.editReply({ embeds: [messageEmbedGet("番号が無効です。`/status`を利用してどの番号にどの曲が入っているかを確認してください。", interaction.client)] });
        }
    }
}

