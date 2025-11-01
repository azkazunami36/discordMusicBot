import fs from "fs";

import { Interaction, SlashCommandBuilder, CacheType, EmbedBuilder, APIEmbedField, APIEmbed, Message, SlashCommandOptionsOnlyBuilder, RESTPostAPIApplicationCommandsJSONBody, REST, Routes } from "discord.js";
import { InteractionInputData } from "../funcs/interface.js";
import { messageEmbedGet } from "../funcs/embed.js";
import { musicBrainz } from "../worker/helper/createByChatGPT/musicBrainzInfoHelper.js";
import { getVoiceConnections, VoiceConnection } from "@discordjs/voice";
import { EnvData } from "../class/envJSON.js";

export const command = new SlashCommandBuilder()
    .setName("restart")
    .setDescription("音楽botを再起動します。")
    .addStringOption(option => option
        .setName("message")
        .setDescription("連絡したいメッセージを入力します。")
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
            const connections = getVoiceConnections();
            const list: VoiceConnection[] = [];
            connections.forEach(connection => list.push(connection));
            let i = 0;
            for (const data of list) {
                i++;
                await message.edit("再生を停止して再起動の旨を連絡中...(" + i + "/" + list.length + ")");
                try {
                    const serverData = inputData.serversDataClass.serversData[data.joinConfig.guildId];
                    const envData = new EnvData(data.joinConfig.guildId);
                    if (serverData && serverData.discord.calledChannel && data.joinConfig.channelId) {
                        const channel = interaction.client.guilds.cache.get(data.joinConfig.guildId)?.channels.cache.get(serverData.discord.calledChannel);
                        if (channel && channel.isTextBased()) {
                            const adminMessage = interaction.options.getString("message");
                            await channel.send({ embeds: [messageEmbedGet("お楽しみ中のところ大変申し訳ありません。音楽botは再起動を開始します。音楽botがオンラインになるまでしばらくお待ちください。再起動後に音楽botはVCに再接続します。" + (adminMessage ? "管理者から再起動理由について説明されています。\n\n**〜管理者よりメッセージ〜**\n\n" + adminMessage : "\n\n現在のメッセージから５分経ってもこのbotのオンラインステータスが復帰しない場合、X(旧Twitter)で@kazunami36_sum1のツイート情報をご確認ください。"), interaction.client)] });
                        }
                        envData.restartedPlayPoint = inputData.player.playtimeGet(data.joinConfig.guildId);
                        envData.restartedPlayIs = inputData.player.playStatusGet(data.joinConfig.guildId) === "play";
                        envData.restartedCalledChannel = serverData.discord.calledChannel;
                        envData.restartedVoiceChannel = data.joinConfig.channelId;
                    }
                    inputData.player.stop(data.joinConfig.guildId);
                } catch (e) {
                    console.error("再生停止処理中にエラー(処理は続行されます)", e)
                }
            }
            await message.edit("再起動の準備が整いました。システムが終了しているか確認してください。終了していない場合、手動でCtrl+Cを行なってください。");
            await interaction.client.destroy();
    }
}
