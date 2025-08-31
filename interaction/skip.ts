import { Interaction, SlashCommandBuilder, CacheType } from "discord.js";

import { InteractionInputData } from "../interface.js";
import { VariableExistCheck } from "../variableExistCheck.js";

export const command = new SlashCommandBuilder()
    .setName("skip")
    .setDescription("現在の曲をスキップして次の曲を再生します。")

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        if (await variableExistCheck.playlistIsEnpty()) return;
        let statusTemp: {
            status: "loading" | "downloading" | "formatchoosing" | "converting" | "done",
            body: { percent?: number; };
        }
        let statuscallTime: number = Date.now();
        await inputData.playerSet.playerSetAndPlay(guildData.guildId, async (status, body) => {
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

