import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, Message } from "discord.js";
import { InteractionInputData } from "../funcs/interface.js";
import { EnvData } from "../class/envJSON.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("callch")
    .setDescription("音楽botを呼び出せるチャンネルを限定することができます。チャンネルを指定せず実行すると、制限を解除できます。")
    .addChannelOption(option => option
        .setName("channel")
        .setDescription("チャンネルを指定します。このチャンネルでのみbotを利用することが可能となります。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        const channel = interaction.options.getChannel("channel");
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const envData = new EnvData(guildData.guildId);
        if (channel) {
            if (guildData.guild.channels.cache.get(channel.id)) {
                envData.callchannelId = channel.id;
                message.edit({ embeds: [messageEmbedGet("このチャンネルでのみコマンドを受け付けるように設定しました。他のチャンネルではコマンドは使用できません。", interaction.client)] });
                return;
            }
        }
        envData.callchannelId = "";
        message.edit({ embeds: [messageEmbedGet("どのチャンネルでもコマンドが利用できるように設定しました。", interaction.client)] });

    }
}
