import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";
import { InteractionInputData } from "../interface.js";
import { EnvData } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { messageEmbedGet } from "../embed.js";

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

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const mode = interaction.options.getString("mode");
        if (mode === null) return await interaction.editReply({ embeds: [messageEmbedGet("リピートモードが選択されていません。選択してからもう一度やり直してください。")] });
        let num: 1 | 2 | 3;
        switch (mode) {
            case "off": {
                await interaction.editReply({ embeds: [messageEmbedGet("リピートをオフにしました。")] });
                num = 1;
                break;
            }
            case "repeat": {
                num = 2;
                await interaction.editReply({ embeds: [messageEmbedGet("リピートをオンにしました。")] });
                break;
            }
            case "only": {
                num = 3;
                await interaction.editReply({ embeds: [messageEmbedGet("リピートを１曲のみにしました。")] });
                break;
            }
            default: {
                return await interaction.editReply({ embeds: [messageEmbedGet("正しい選択肢が入力されていません。入力してからもう一度やり直してください。")] });
            }
        }
        const envData = new EnvData(guildData.guildId);
        envData.playType = num;
    }
}
