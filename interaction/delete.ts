import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { EnvData, VideoMetaCache } from "../envJSON.js";
import { VariableExistCheck } from "../variableExistCheck.js";

export const command = new SlashCommandBuilder()
    .setName("delete")
    .setDescription("プレイリスト内の曲を削除します。")
    .addNumberOption(option => option
        .setName("number")
        .setDescription("削除したい曲の番号を指定します。")
        .setRequired(true)
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const playlist = await variableExistCheck.playlist();
        if (!playlist) return;
        if (await variableExistCheck.playlistIsEmpty()) return;
        const number = interaction.options.getNumber("number");
        if (number === null) return await interaction.editReply("番号が入力されていません。番号を入力してから再度実行してください。");
        if (playlist[number - 1]) {
            const playlistData = playlist.splice(number - 1, 1)[0];
            const envData = new EnvData(guildData.guildId);
            envData.playlistSave(playlist);
            const videoMetaCache = new VideoMetaCache();
            const meta = await videoMetaCache.cacheGet(playlistData);
            const title = (meta ? meta.title : "タイトル取得エラー(ID: " + playlistData.body + ")");
            await interaction.editReply("曲「" + title + "」を削除しました。(ID: " + playlistData.body + ")");
        } else {
            await interaction.editReply("番号が無効です。`/status`を利用してどの番号にどの曲が入っているかを確認してください。");
        }
    }
}

