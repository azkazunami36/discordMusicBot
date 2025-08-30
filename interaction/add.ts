import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";
import ytdl from "ytdl-core";
import yts from "yt-search";

import { InteractionInputData } from "../interface.js";
import { envJSON } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("add")
    .setDescription("曲を追加します。")
    .addStringOption(option => option
        .setName("text")
        .setDescription("URLまたはVideoIDまたは検索したいタイトルを入力してください。")
        .setRequired(true)
    )

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const data = interaction.options.getString("text");
        if (!interaction.guildId) return await interaction.editReply("サーバーでこのコマンドは実行してください。正しく処理ができません。");
        if (data === null) return await interaction.editReply("追加したい曲が指定されませんでした。入力してから追加を行なってください。");
        if (data === "") return await interaction.editReply("内容が空です。入力してから追加をしてください。");
        let videoId = data;
        const playlist = (() => {
            const playlist = envJSON(interaction.guildId, "playlist");
            if (playlist === undefined) return envJSON(interaction.guildId, "playlist", "[]");
            return playlist;
        })();
        if (!playlist) return await interaction.editReply("謎のエラーです。管理者には「プレイリストの処理でエラーが発生した」とお伝えください。");
        const playlistJSON: string[] = JSON.parse(playlist);
        await interaction.editReply("文字列を分析中...");
        // URLはVideoIDに変換
        if (ytdl.validateURL(videoId)) videoId = ytdl.getURLVideoID(videoId);
        // まだVideoIDではなかった場合
        if (!ytdl.validateID(videoId)) {
            await interaction.editReply("検索中...");
            // 検索
            const result = await yts(videoId);
            // 追加
            videoId = result.videos[0].videoId;
            // まだVideoIDではなかった場合
            if (!ytdl.validateID(videoId)) return await interaction.editReply("「" + data + "」は有効な内容として認識することができず、追加ができませんでした。再度追加するか、botの作成者に相談してください。");
        }
        // 追加
        playlistJSON.push(videoId);
        envJSON(interaction.guildId, "playlist", JSON.stringify(playlistJSON));
        const cache = await inputData.videoCache.cacheGet(videoId);
        await interaction.editReply("「" + (cache ? cache.title : "タイトル取得エラー(VideoID: " + videoId + ")") + "」を追加しました。")
    }
}
