import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("stop")
    .setDescription("再生を停止します。")
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const envData = new EnvData(guildData.guildId);
        const playlist = envData.playlist;
        if (!await variableExistCheck.voiceChannelId()) return;
        if (await variableExistCheck.playerIsStopping(inputData.player)) return;
        if (envData.playType === 1) playlist.shift();
        inputData.player.stop(guildData.guildId);
        const resetArr: string[] = [];
        if (envData.queueAutoReset) {
            resetArr.push("キュー");
            envData.playlist.clear();
        }
        if (envData.eqAutoReset) {
            resetArr.push("イコライザ等");
            envData.playPitch = 0;
            envData.playTempo = 1;
            envData.reverbType = undefined;
        }
        await message.edit({ embeds: [messageEmbedGet("曲を停止しました。" + (resetArr.join("、")) + (resetArr[0] ? "はリセット済みです。利用する際は再度設定するか、リセットされないように設定を変更することができます。" : ""), interaction.client)] });
        envData.manualStartedIs = false;
    }
}
