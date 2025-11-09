import { Interaction, SlashCommandBuilder, CacheType, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("speed")
    .setDescription("曲の再生速度を変更します。")
    .addNumberOption(option => option
        .setName("num")
        .setDescription("1倍速や2倍速、0.5倍速など、さまざまな倍速にすることができます。")
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
        if (!num || num <= 0) return await message.edit({ embeds: [messageEmbedGet("数字が指定されておらず、そして正しい指定ではありません。正しい数字を入力してください。", interaction.client)] });
        const envdata = new EnvData(guildData.guildId);
        envdata.playTempo = num;
        await inputData.player.speedSet(guildData.guildId, num);
        await message.edit({ embeds: [messageEmbedGet(num + "倍速にしました。", interaction.client)] });
    }
}
