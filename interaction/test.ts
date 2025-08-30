import { Interaction, SlashCommandBuilder, CacheType } from 'discord.js';

import { InteractionInputData } from "../interface.js";

export const command = new SlashCommandBuilder()
    .setName("test")
    .setDescription("Botのテストです。基本的にさまざまな機能の検証に使用するため、特に意味はなしません。")

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName !== "test") return;
        await interaction.editReply('Pong!');
    }
}
