import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { EnvData } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";

export const command = new SlashCommandBuilder()
    .setName("status")
    .setDescription("プレイリスト・再生状態を確認できます。")
    .addNumberOption(option => option
        .setName("page")
        .setDescription("ページを指定します。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        const startPlaylist = serverData.discord.ffmpegResourcePlayer.playing;
        let replyText = "このサーバーでのプレイリストや設定です。\n- 現在再生中: " + (startPlaylist ? startPlaylist.type === "videoId" ? (await inputData.videoCache.cacheGet(startPlaylist.body) || { title: "タイトル取得エラー(VideoID: " + startPlaylist.body + ")" }).title : startPlaylist.body : "なし") + "\n- プレイリスト\n```\n";
        for (let i = 0; i < playlist.length; i++) {
            const playlistData = playlist[i];
            const title = playlistData.type === "videoId" ? (await inputData.videoCache.cacheGet(playlistData.body) || { title: "タイトル取得エラー(VideoID: " + playlistData.body + ")" }).title : playlistData.body;
            replyText += (i + 1) + ". " + title + "\n";
        }
        if (playlist.length == 0) replyText += "プレイリストが空です。";
        const envData = new EnvData(guildData.guildId);
        replyText += "```\n- 音量: " + envData.volume + "\n- リピート: ";
        switch (envData.playType) {
            default: replyText += "オフ"; break;
            case 2: replyText += "オン"; break;
            case 3: replyText += "１曲のみ"; break;
        }
        await interaction.editReply(replyText);
    }
}
