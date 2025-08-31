import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";
import { EnvData } from "../envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("skip")
    .setDescription("現在の曲をスキップして次の曲を再生します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        if (await variableExistCheck.playlistIsEmpty()) return;
        let statusTemp: {
            status: "loading" | "downloading" | "formatchoosing" | "converting" | "done",
            body: { percent?: number; };
        }
        let statuscallTime: number = Date.now();
        const envData = new EnvData(guildData.guildId);
        const playlist = envData.playlistGet();
        const startPlaylistData = playlist.shift();
        if (startPlaylistData) playlist.push(startPlaylistData);
        envData.playlistSave(playlist);
        await inputData.playerSet.playerSetAndPlay(guildData.guildId, async (status, body) => {
            const temp = { status, body }
            if (statusTemp && statusTemp === temp) return;
            if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
            statusTemp = temp;
            statuscallTime = Date.now();
            if (status === "loading") await interaction.editReply("音声ファイルを準備中..." + (body.percent ? Math.floor(body.percent) + "%" : ""));
            if (status === "downloading") await interaction.editReply("音声ファイルをダウンロード中..." + (body.percent ? Math.floor(body.percent) + "%" : ""));
            if (status === "converting") await interaction.editReply("音声ファイルを再生可能な形式に変換中...少々お待ちください..." + (body.percent ? Math.floor(body.percent) + "%" : ""));
            if (status === "formatchoosing") await interaction.editReply("YouTubeサーバーに保管されたフォーマットの調査中..." + (body.percent ? Math.floor(body.percent) + "%" : ""));
        });
        await interaction.editReply("次の曲にスキップしました。");
    }
}

