import { Interaction, SlashCommandBuilder, CacheType, GuildMember } from "discord.js";
import * as DiscordVoice from "@discordjs/voice";

import { InteractionInputData } from "../interface.js";
import { envJSON } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("stop")
    .setDescription("再生を停止します。")

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        if (!interaction.guildId) return await interaction.editReply("サーバーでこのコマンドは実行してください。正しく処理ができません。");
        if (!interaction.member) return await interaction.editReply("謎のエラーです。メンバーが取得できませんでした。");
        const vchannelId = (interaction.member as GuildMember).voice.channelId;
        if (!vchannelId) return await interaction.editReply("くぁwせdrftgyふじこlp。ボイチャに入ってないとどこに入ればいいかわかりません。できればボイチャ入っててください。");
        const connection = DiscordVoice.getVoiceConnection(interaction.guildId);
        if (!connection) return await interaction.editReply("え？まじで？曲再生してないのに！？！？");
        await inputData.playerSet.playerStop(interaction.guildId);
        await interaction.editReply("曲を停止しました。");
    }
}
