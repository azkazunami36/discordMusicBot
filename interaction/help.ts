import fs from "fs";

import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, Message } from "discord.js";
import { InteractionInputData } from "../interface.js";

export const command = new SlashCommandBuilder()
    .setName("help")
    .setDescription("ヘルプを表示します。")
    .addBooleanOption(option => option
        .setName("full")
        .setDescription("README-short.mdを出力するかどうかを選択できます。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName !== "help") return;
        if (interaction.options.getBoolean("full")) {
            message.edit({
                embeds: [new EmbedBuilder()
                    .setTitle("音楽bot v" + JSON.parse(String(fs.readFileSync("package.json"))).version + "のヘルプ")
                    .setAuthor({
                        name: "音楽bot",
                        iconURL: interaction.client.user?.avatarURL() || undefined,
                    })
                    .setDescription(String(fs.readFileSync("README-short.md")))
                    .setColor("Purple")]
            });
        } else message.edit({
            embeds: [new EmbedBuilder()
                .setTitle("音楽bot v" + JSON.parse(String(fs.readFileSync("package.json"))).version + "のヘルプ")
                .setAuthor({
                    name: "音楽bot",
                    iconURL: interaction.client.user?.avatarURL() || undefined,
                })
                .setDescription(String(fs.readFileSync("helpCommandText.txt")))
                .setColor("Purple")]
        });
    }
}
