import fs from "fs";

import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";
import { InteractionInputData } from "../interface.js";
import { envJSON } from "../envJSON.js";

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

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        if (!interaction.guildId) return await interaction.editReply("サーバーでこのコマンドは実行してください。正しく処理ができません。");
        const mode = interaction.options.getString("mode");
        if (mode === null) return await interaction.editReply("リピートモードが選択されていません。選択してからもう一度やり直してください。");
        let num = 0;
        switch (mode) {
            case "off": {
                await interaction.editReply("リピートをオフにしました。");
                num = 1;
                break;
            }
            case "repeat": {
                num = 2;
                await interaction.editReply("リピートをオンにしました。");
                break;
            }
            case "only": {
                num = 3;
                await interaction.editReply("リピートを１曲のみにしました。");
                break;
            }
            default: {
                return await interaction.editReply("正しい選択肢が入力されていません。入力してからもう一度やり直してください。");
            }
        }
        envJSON(interaction.guildId, "playType", String(num));
    }
}
