import fs from "fs";

import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";
import { InteractionInputData } from "../interface.js";
import { EnvData } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";

export const command = new SlashCommandBuilder()
    .setName("callch")
    .setDescription("音楽botを呼び出せるチャンネルを限定することができます。チャンネルを指定せず実行すると、制限を解除できます。")
    .addChannelOption(option => option
        .setName("channel")
        .setDescription("チャンネルを指定します。このチャンネルでのみbotを利用することが可能となります。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const channel = interaction.options.getChannel("channel");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const envData = new EnvData(guildData.guildId);
        if (channel) {
            if (guildData.guild.channels.cache.get(channel.id)) {
                envData.callchannelId = channel.id;
                interaction.editReply("このチャンネルでのみコマンドを受け付けるように設定しました。他のチャンネルではコマンドは使用できません。");
                return;
            }
        }
        envData.callchannelId = "";
        interaction.editReply("どのチャンネルでもコマンドが利用できるように設定しました。");

    }
}

