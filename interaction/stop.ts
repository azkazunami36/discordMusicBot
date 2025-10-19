import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { EnvData } from "../envJSON.js";
import { messageEmbedGet } from "../embed.js";

export const command = new SlashCommandBuilder()
    .setName("stop")
    .setDescription("再生を停止します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const envData = new EnvData(guildData.guildId);
        const playlist = envData.playlistGet();
        if (!await variableExistCheck.voiceChannelId()) return;
        if (await variableExistCheck.playerIsNotPlaying(inputData.player)) return;
        if (envData.playType === 1) playlist.shift();
        envData.playlistSave(playlist);
        inputData.player.stop(guildData.guildId);
        await message.edit({ embeds: [messageEmbedGet("曲を停止しました。", interaction.client)] });
    }
}
