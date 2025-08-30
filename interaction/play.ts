import { Interaction, SlashCommandBuilder, CacheType, GuildMember } from "discord.js";
import * as DiscordVoice from "@discordjs/voice";

import { InteractionInputData } from "../interface.js";
import { envJSON } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("play")
    .setDescription("プレイリスト内の曲を再生します。")

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        if (!interaction.guildId || !interaction.guild) return await interaction.editReply("サーバーでこのコマンドは実行してください。正しく処理ができません。");
        if (!interaction.member) return await interaction.editReply("謎のエラーです。メンバーが取得できませんでした。");
        const playlist = (() => {
            const playlist = envJSON(interaction.guildId, "playlist");
            if (playlist === undefined) return envJSON(interaction.guildId, "playlist", "[]");
            return playlist;
        })();
        if (!playlist) return await interaction.editReply("謎のエラーです。管理者には「プレイリストの処理でエラーが発生した」とお伝えください。");
        const playlistJSON: string[] = JSON.parse(playlist);
        if (playlistJSON.length == 0) return await interaction.editReply("プレイリストが空っぽです。`/add text:[タイトルまたはURL]`で曲を追加してください。");
        const vchannelId = (interaction.member as GuildMember).voice.channelId;
        if (!vchannelId) return await interaction.editReply("くぁwせdrftgyふじこlp。ボイチャに入ってないとどこに入ればいいかわかりません。できればボイチャ入っててください。");
        if (!inputData.serversDataClass.serversData[interaction.guildId]) inputData.serversDataClass.serverDataInit(interaction.guildId);
        const serverData = inputData.serversDataClass.serversData[interaction.guildId];
        if (serverData === undefined) return await interaction.editReply("謎のエラーです。管理者には「サーバーデータの処理に失敗」とお伝えください。");
        if (serverData.discord.ffmpegResourcePlayer.player.state.status === DiscordVoice.AudioPlayerStatus.Playing) return await interaction.editReply("すでに再生中です。`/help`で使い方をみることができます。");
        await interaction.editReply("VCの状態をチェック中...");
        const oldConnection = DiscordVoice.getVoiceConnection(interaction.guildId);
        oldConnection?.disconnect();
        oldConnection?.destroy();
        const connection = DiscordVoice.joinVoiceChannel({ channelId: vchannelId, guildId: interaction.guildId, adapterCreator: interaction.guild.voiceAdapterCreator });
        await DiscordVoice.entersState(connection, DiscordVoice.VoiceConnectionStatus.Ready, 10000);
        connection.subscribe(serverData.discord.ffmpegResourcePlayer.player);
        serverData.discord.calledChannel = interaction.channelId;
        let statusTemp: {
            status: "loading" | "downloading" | "formatchoosing" | "converting" | "done",
            body: { percent?: number; };
        }
        let statuscallTime: number = Date.now();
        await inputData.playerSet.playerSetAndPlay(interaction.guildId, async (status, body) => {
            const temp = { status, body }
            if (statusTemp && statusTemp === temp) return;
            if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
            statusTemp = temp;
            statuscallTime = Date.now();
            if (status === "loading") await interaction.editReply("音声ファイルを準備中...");
            if (status === "downloading") await interaction.editReply("音声ファイルをダウンロード中..." + (body.percent ? Math.floor(body.percent) + "%" : ""));
            if (status === "converting") await interaction.editReply("音声ファイルを再生可能な形式に変換中...少々お待ちください...");
            if (status === "formatchoosing") await interaction.editReply("YouTubeサーバーに保管されたフォーマットの調査中...");
        });
        await interaction.editReply("再生を開始しました。");

    }
}

