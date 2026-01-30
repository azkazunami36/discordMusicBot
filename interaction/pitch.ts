import { Interaction, SlashCommandBuilder, CacheType, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("pitch")
    .setDescription("曲の音程を変更します。")
    .addNumberOption(option => option
        .setName("num")
        .setDescription("0、1、12など、さまざまな音程にすることができます。キーを調整する感じです。")
        .setRequired(true)
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        const num = interaction.options.getNumber("num");
        if (num === null || num < -100 || num > 100) return await message.edit({ embeds: [messageEmbedGet("数字が指定されておらず、そして正しい指定ではありません。正しい数字を入力してください。", interaction.client)] });
        const envdata = new EnvData(guildData.guildId);
        envdata.playPitch = num;
        await inputData.player.pitchSet(guildData.guildId, num);
        await message.edit({ embeds: [messageEmbedGet("ピッチを" + num + "にしました。", interaction.client)] });
    }
}
