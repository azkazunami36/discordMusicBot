import { Interaction, SlashCommandBuilder, CacheType, Message } from "discord.js";
import { InteractionInputData } from "../funcs/interface.js";
import { EnvData } from "../funcs/envJSON.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("repeat")
    .setDescription("リピートモードを変更します。")
    .addStringOption(option => option
        .setName("mode")
        .setDescription("リピートモードを選んでください。")
        .addChoices({ name: "オフ", value: "off" })
        .addChoices({ name: "リピート", value: "repeat" })
        .addChoices({ name: "１曲リピート", value: "only" })
        .setRequired(true)
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const mode = interaction.options.getString("mode");
        if (mode === null) return await message.edit({ embeds: [messageEmbedGet("リピートモードが選択されていません。選択してからもう一度やり直してください。", interaction.client)] });
        let num: 1 | 2 | 3;
        switch (mode) {
            case "off": {
                await message.edit({ embeds: [messageEmbedGet("リピートをオフにしました。", interaction.client)] });
                num = 1;
                break;
            }
            case "repeat": {
                num = 2;
                await message.edit({ embeds: [messageEmbedGet("リピートをオンにしました。", interaction.client)] });
                break;
            }
            case "only": {
                num = 3;
                await message.edit({ embeds: [messageEmbedGet("リピートを１曲のみにしました。", interaction.client)] });
                break;
            }
            default: {
                return await message.edit({ embeds: [messageEmbedGet("正しい選択肢が入力されていません。入力してからもう一度やり直してください。", interaction.client)] });
            }
        }
        const envData = new EnvData(guildData.guildId);
        envData.playType = num;
    }
}
