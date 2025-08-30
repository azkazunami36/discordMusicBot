import { Interaction, SlashCommandBuilder, CacheType, GuildMember } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { envJSON } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("volume")
    .setDescription("音量を調節します。")
    .addNumberOption(option => option
        .setName("vol")
        .setDescription("音量を設定します。")
        .setRequired(true)
    )

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName !== "volume") return;
        if (!interaction.guildId) return await interaction.editReply("サーバーでこのコマンドは実行してください。正しく処理ができません。");
        const number = interaction.options.getNumber("vol");
        if (number === null) return await interaction.editReply("番号が入力されていません。番号を入力してから再度実行してください。");
        if (!number || number < 0) return await interaction.editReply("番号が無効です。0以上の数字を入力してください。半角数字を使ってください。");
        if (!inputData.serversDataClass.serversData[interaction.guildId]) inputData.serversDataClass.serverDataInit(interaction.guildId);
        const serverData = inputData.serversDataClass.serversData[interaction.guildId];
        if (!serverData) return await interaction.editReply("謎のエラーです。管理者には「サーバーデータの処理に失敗」とお伝えください。");
        envJSON(interaction.guildId, "volume", String(number));
        serverData.discord.resource?.volume?.setVolume(number / 750);
        await interaction.editReply("音量を" + number + "%に変更しました。");
    }
}

