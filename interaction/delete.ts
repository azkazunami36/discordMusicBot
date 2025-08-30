import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { envJSON } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("delete")
    .setDescription("プレイリスト内の曲を削除します。")
    .addNumberOption(option => option
        .setName("number")
        .setDescription("削除したい曲の番号を指定します。")
        .setRequired(true)
    )

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        if (!interaction.guildId) return await interaction.editReply("サーバーでこのコマンドは実行してください。正しく処理ができません。");
        const number = interaction.options.getNumber("number");
        if (number === null) return await interaction.editReply("番号が入力されていません。番号を入力してから再度実行してください。");
        const playlist = (() => {
            const playlist = envJSON(interaction.guildId, "playlist");
            if (playlist === undefined) return envJSON(interaction.guildId, "playlist", "[]");
            return playlist;
        })();
        if (!playlist) return await interaction.editReply("謎のエラーです。管理者には「プレイリストの処理でエラーが発生した」とお伝えください。");
        const playlistJSON: string[] = JSON.parse(playlist);
        if (playlistJSON.length == 0) return await interaction.editReply("プレイリストが空っぽです。`!music タイトルまたはURL`で曲を追加してください。");
        if (playlistJSON[number - 1]) {
            const videoId = playlistJSON.splice(number - 1, 1)[0];
            envJSON(interaction.guildId, "playlist", JSON.stringify(playlistJSON));
            const cache = await inputData.videoCache.cacheGet(videoId);
            await interaction.editReply("曲「" + (cache ? cache.title : "タイトル取得エラー(VideoID: " + videoId + ")") + "」を削除しました。(VideoId: " + videoId + ")");
        } else {
            await interaction.editReply("番号が無効です。`!music-status`を利用してどの番号にどの曲が入っているかを確認してください。");
        }
    }
}

