import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("pause")
    .setDescription("再生を一時停止します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        if (!await variableExistCheck.voiceChannelId()) return;
        if (await variableExistCheck.playerIsNotPlaying(inputData.player)) return;
        inputData.player.pause(guildData.guildId);
        await message.edit({ embeds: [messageEmbedGet("曲を一時停止しました。", interaction.client)] });
    }
}
