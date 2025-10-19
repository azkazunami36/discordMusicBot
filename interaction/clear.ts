import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, Message } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { EnvData, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../embed.js";

export const command = new SlashCommandBuilder()
    .setName("clear")
    .setDescription("キュー内の曲を削除します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        if (await variableExistCheck.playlistIsEmpty()) return;
        playlist.length = 0;
        const envData = new EnvData(guildData.guildId);
        envData.playlistSave(playlist);
        await message.edit({ embeds: [messageEmbedGet("キューから全ての曲を削除しました。", interaction.client)] });
    }
}
