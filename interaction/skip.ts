import { Interaction, SlashCommandBuilder, CacheType, GuildMember } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { envJSON } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("skip")
    .setDescription("現在の曲をスキップして次の曲を再生します。")

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
        if (playlistJSON.length == 0) return await interaction.editReply("プレイリストが空っぽです。`/add text:[タイトルまたはURL]`で曲を追加してください。");

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
        await interaction.editReply("次の曲にスキップしました。");
    }
}

