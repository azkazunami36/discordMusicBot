import { Interaction, SlashCommandBuilder, CacheType, GuildMember } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";

export const command = new SlashCommandBuilder()
    .setName("stop")
    .setDescription("再生を停止します。")

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        if (!await variableExistCheck.voiceChannelId()) return;
        if (await variableExistCheck.playerIsPlaying(inputData.serversDataClass)) return;
        await inputData.playerSet.playerStop(guildData.guildId);
        await interaction.editReply("曲を停止しました。");
    }
}
