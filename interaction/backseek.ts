import { Interaction, SlashCommandBuilder, CacheType, GuildMember } from "discord.js";
import * as DiscordVoice from "@discordjs/voice";

import { InteractionInputData } from "../interface.js";
import { envJSON } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("backseek")
    .setDescription("再生位置を１０秒前にずらします。")
    .addNumberOption(option => option
        .setName("second")
        .setDescription("時間を指定して巻き戻します。")
    )

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        if (!interaction.guildId || !interaction.guild) return await interaction.editReply("サーバーでこのコマンドは実行してください。正しく処理ができません。");
        if (!interaction.member) return await interaction.editReply("謎のエラーです。メンバーが取得できませんでした。");
        if (!inputData.serversDataClass.serversData[interaction.guildId]) inputData.serversDataClass.serverDataInit(interaction.guildId);
        const serverData = inputData.serversDataClass.serversData[interaction.guildId];
        if (!serverData) return await interaction.editReply("謎のエラーです。管理者には「サーバーデータの処理に失敗」とお伝えください。");
        if (!serverData.discord.resource) return await interaction.editReply("再生されていません。");
        serverData.discord.resource
    }
}

