import { Interaction, SlashCommandBuilder, CacheType, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("reverb")
    .setDescription("音の反響を設定します。")
    .addStringOption(option => option
        .setName("type")
        .setDescription("反響のタイプを選びます。")
        .setChoices(
            { name: "オフ", value: "undefined" },
            { name: "教会", value: "church" },
            { name: "トンネル", value: "tunnel" },
            { name: "U字谷", value: "ushapedvalley" }
        )
        .setRequired(true)
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const serverData = await variableExistCheck.serverData(inputData.serversDataClass);
        if (!serverData) return;
        const envdata = new EnvData(guildData.guildId);
        const type = interaction.options.getString("type");
        switch (type) {
            case "church": {
                envdata.reverbType = "church";
                await message.edit({ embeds: [messageEmbedGet("リバーブを教会モードにしました。", interaction.client)] });
                break;
            }
            case "tunnel": {
                envdata.reverbType = "tunnel";
                await message.edit({ embeds: [messageEmbedGet("リバーブをトンネルモードにしました。", interaction.client)] });
                break;
            }
            case "ushapedvalley": {
                envdata.reverbType = "ushapedvalley";
                await message.edit({ embeds: [messageEmbedGet("リバーブをU字谷モードにしました。", interaction.client)] });
                break;
            }
            default: {
                envdata.reverbType = undefined;
                await message.edit({ embeds: [messageEmbedGet("リバーブをオフにしました。", interaction.client)] });
                break;
            }
        }
        await inputData.player.reverbSet(guildData.guildId, envdata.reverbType);
    }
}
