import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { EnvData } from "../funcs/envJSON.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("volume")
    .setDescription("音量を調節します。")
    .addNumberOption(option => option
        .setName("vol")
        .setDescription("音量を設定します。")
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
        const number = interaction.options.getNumber("vol");
        if (number === null) return await message.edit({ embeds: [messageEmbedGet("番号が入力されていません。番号を入力してから再度実行してください。", interaction.client)] });
        if (!number || number < 0) return await message.edit({ embeds: [messageEmbedGet("番号が無効です。0以上の数字を入力してください。半角数字を使ってください。", interaction.client)] });
        const envData = new EnvData(guildData.guildId);
        envData.volume = number;
        inputData.player.volumeSet(guildData.guildId, number);
        await message.edit({ embeds: [messageEmbedGet("音量を" + number + "%に変更しました。", interaction.client)] });
    }
}
