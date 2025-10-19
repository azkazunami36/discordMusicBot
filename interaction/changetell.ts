import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, Message } from "discord.js";
import { InteractionInputData } from "../interface.js";
import { EnvData } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { messageEmbedGet } from "../embed.js";

export const command = new SlashCommandBuilder()
    .setName("changetell")
    .setDescription("音楽の変更を常に連絡するかどうかを選択できます。")
    .addBooleanOption(option => option
        .setName("type")
        .setDescription("オンかオフかを切り替えることが可能です。")
        .setRequired(true)
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const type = interaction.options.getBoolean("type");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const envData = new EnvData(guildData.guildId);
        if (type) {
            envData.changeTellIs = true;
            message.edit({ embeds: [messageEmbedGet("常に曲の切り替えを伝えるように変更しました。", interaction.client)] });
        } else {
            envData.changeTellIs = false;
            message.edit({ embeds: [messageEmbedGet("曲の変更は常に通知なしで行われるように変更しました。", interaction.client)] })
        }

    }
}
