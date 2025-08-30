import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { envJSON } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("status")
    .setDescription("プレイリスト・再生状態を確認できます。")
    .addNumberOption(option => option
        .setName("page")
        .setDescription("ページを指定します。")
    )

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        if (!interaction.guildId) return await interaction.editReply("サーバーでこのコマンドは実行してください。正しく処理ができません。");
        const playlist = (() => {
            const playlist = envJSON(interaction.guildId, "playlist");
            if (playlist === undefined) return envJSON(interaction.guildId, "playlist", "[]");
            return playlist;
        })();
        if (!playlist) return await interaction.editReply("謎のエラーです。管理者には「プレイリストの処理でエラーが発生した」とお伝えください。");
        const playlistJSON: string[] = JSON.parse(playlist);
        const cache = await inputData.videoCache.cacheGet(playlistJSON[0]);
        let replyText = "このサーバーでのプレイリストや設定です。\n- 現在再生中: " + (playlistJSON[0] ? (cache ? cache.title : "タイトル取得エラー(VideoID: " + playlistJSON + ")") : "なし") + "\n- プレイリスト\n```\n";
        for (let i = 0; i < playlistJSON.length; i++) {
            const videoId = playlistJSON[i];
            const cache = await inputData.videoCache.cacheGet(videoId);
            replyText += (i + 1) + ". " + (cache ? cache.title : "タイトル取得エラー(VideoID: " + videoId + ")") + "\n";
        }
        if (playlistJSON.length == 0) replyText += "プレイリストが空です。";
        replyText += "```\n- 音量: " + (envJSON(interaction.guildId, "volume") || "100") + "\n- リピート: ";
        switch (Number(envJSON(interaction.guildId, "playType"))) {
            case 1: replyText += "オフ"; break;
            case 2: replyText += "オン"; break;
            case 3: replyText += "１曲のみ"; break;
            default: replyText += "オフ"; break;
        }
        await interaction.editReply(replyText);
    }
}
