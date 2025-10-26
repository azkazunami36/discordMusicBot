import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("join")
    .setDescription("VCに参加します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const voiceChannelId = await variableExistCheck.voiceChannelId()
        if (!voiceChannelId) return;
        if (await variableExistCheck.playerIsNotStopping(inputData.player)) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        serverData.discord.calledChannel = interaction.channelId;
        inputData.player.join({guildId: guildData.guildId, channelId: voiceChannelId, adapterCreator: guildData.guild.voiceAdapterCreator});
        await message.edit({ embeds: [messageEmbedGet("ボイスチャットに接続しました。", interaction.client)] });
        const envData = new EnvData(guildData.guildId);
        envData.manualStartedIs = true;
    }
}
