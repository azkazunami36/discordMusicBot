import fs from "fs";

import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";
import { InteractionInputData } from "../interface.js";

export const command = new SlashCommandBuilder()
    .setName("help")
    .setDescription("ヘルプを表示します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName !== "help") return;
        interaction.editReply(String(fs.readFileSync("helpCommandText.txt")));
    }
}
