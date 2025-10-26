import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("vcrecorder")
    .setDescription("ボイスチャット内を録音します。有効になっている場合、VCに誰かが参加すると自動で音楽botが参加します。")
    .addChannelOption(option => option
        .setName("channel")
        .setDescription("録音した音声を保存する場所を設定します。これを指定しなければ、録音機能がオフになります。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const envData = new EnvData(guildData.guildId);
        const channel = interaction.options.getChannel("channel");
        if (channel) {
            envData.recordedAudioFileSaveChannelTo = channel.id;
            await message.edit({ embeds: [messageEmbedGet("チャンネル「" + channel.name + "」に音声ファイルを保存するように設定しました。すでに音楽botを使っている場合、一度`/stop`してから`/join`または`/play`を行うことで、録音を開始できます。", interaction.client)] });
        } else {
            envData.recordedAudioFileSaveChannelTo = "";
            await message.edit({ embeds: [messageEmbedGet("録音機能を無効にしました。すでに音楽botを使っている場合、一度`/stop`をするまで録音は続きます。", interaction.client)] });
        }
    }
}
