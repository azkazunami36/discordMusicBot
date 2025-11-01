import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet, videoInfoEmbedGet } from "../funcs/embed.js";
import { progressBar } from "../createByChatGPT/progressBar.js";
import { SumLog } from "../class/sumLog.js";

export const command = new SlashCommandBuilder()
    .setName("skip")
    .setDescription("現在の曲をスキップして次の曲を再生します。")
    .addNumberOption(option => option
        .setName("skipnum")
        .setDescription("指定した番号だけキューを進めます。キューより多い数でも機能はしますが、負荷がかかるのでおやめください。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        // vcidは使わないが、VCに参加していないことをはっきりするために用意。
        const vchannelId = await variableExistCheck.voiceChannelId();
        if (!vchannelId) return;
        if (await variableExistCheck.playlistIsEmpty()) return;
        const envData = new EnvData(guildData.guildId);
        let skipnumber = ((interaction.options.getNumber("skipnum") || 2) - 1);
        while (skipnumber >= envData.playlist.length()) skipnumber = - envData.playlist.length();
        if (skipnumber < 0) return message.edit({ embeds: [messageEmbedGet("プレイリストに次の曲がないため、スキップすることができません。", interaction.client)] });
        const play = envData.playlist.get(skipnumber);
        if (!play) return message.edit({ embeds: [messageEmbedGet("プレイリストに次の曲がないため、スキップすることができません。", interaction.client)] });
        for (let i = 0; i < skipnumber; i++) {
            const startPlaylistData = envData.playlist.shift();
            if ((envData.playType !== 1 || i !== 0) && startPlaylistData) envData.playlist.push(startPlaylistData);
        }
        let embed: EmbedBuilder | undefined;
        const metaEmbed = await videoInfoEmbedGet([play], "次の曲の再生準備中...\n0%`" + progressBar(0, 35) + "`", interaction.client, eb => { embed = eb; });
        await message.edit(metaEmbed);
        SumLog.log(play.body + "へスキップ処理を開始します。", { functionName: "skip", guildId: interaction.guildId || undefined, textChannelId: interaction.channelId, voiceChannelId: vchannelId, userId: interaction.user.id });
        let statusTemp: {
            status: "loading" | "downloading" | "formatchoosing" | "converting" | "done" | "queue",
            percent: number;
        }
        let statuscallTime: number = Date.now();
        await inputData.player.sourceSet(guildData.guildId, play, async (status, percent) => {
            const temp = { status, percent }
            if (statusTemp && statusTemp === temp) return;
            if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
            statusTemp = temp;
            statuscallTime = Date.now();
            if (embed) {
                if (status === "loading") { embed.setDescription("次の曲の音声ファイルを準備中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                if (status === "downloading") { embed.setDescription("次の曲の音声ファイルをダウンロード中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                if (status === "converting") { embed.setDescription("次の曲の音声ファイルを再生可能な形式に変換中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                if (status === "formatchoosing") { embed.setDescription("次の曲の" + (play.type ? (play.type === "videoId" ? "YouTube" : play.type === "nicovideoId" ? "ニコニコ動画" : "X") : "") + "サーバーに保管されたフォーマットの調査中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                if (status === "done") { embed.setDescription("次の曲の再生開始処理中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
            }
        });
        inputData.player.volumeSet(guildData.guildId, envData.volume);
        if (embed) embed.setDescription("次の曲にスキップしました。");
        await message.edit(metaEmbed);
    }
}
