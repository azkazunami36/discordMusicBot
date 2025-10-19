import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, Message } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { EnvData } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";

export const command = new SlashCommandBuilder()
    .setName("delete")
    .setDescription("キュー内の曲を削除します。")
    .addStringOption(option => option
        .setName("range")
        .setDescription("削除したい曲の番号を指定します。1-5と指定すると1から5まで全て削除されます。")
        .setRequired(true)
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        if (await variableExistCheck.playlistIsEmpty()) return;
        const number = interaction.options.getString("range")?.split("-");
        const start = Number(number ? number[0] : undefined);
        const end = Number(number ? number[1] : undefined);
        if (Number.isNaN(start)) return await message.edit({ embeds: [messageEmbedGet("番号が入力されていません。番号を入力してから再度実行してください。", interaction.client)] });
        if (playlist[start - 1]) {
            const playlistData = playlist.splice(start - 1, (!Number.isNaN(end) && end > start) ? end - (start - 1) : 1);
            const envData = new EnvData(guildData.guildId);
            envData.playlistSave(playlist);
            await message.edit({ embeds: [await videoInfoEmbedGet(playlistData, "曲を削除しました。", interaction.client)] });
        } else {
            await message.edit({ embeds: [messageEmbedGet("番号が無効です。`/status`を利用してどの番号にどの曲が入っているかを確認してください。", interaction.client)] });
        }
    }
}
