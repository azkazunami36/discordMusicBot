import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, Message } from 'discord.js';

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from '../variableExistCheck.js';

export const command = new SlashCommandBuilder()
    .setName("test")
    .setDescription("Botのテストです。基本的にさまざまな機能の検証に使用するため、特に意味はなしません。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        message.edit({
            content: "実行完了",
            embeds: [
                new EmbedBuilder()
                    .setTitle("タイトル")
            ]
        });
    }
}
