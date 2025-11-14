import { Interaction, SlashCommandBuilder, CacheType, GuildMember, Message } from "discord.js";

import { InteractionInputData } from "../funcs/interface.js";
import { VariableExistCheck } from "../class/variableExistCheck.js";
import { EnvData } from "../class/envJSON.js";
import { messageEmbedGet } from "../funcs/embed.js";

export const command = new SlashCommandBuilder()
    .setName("settings")
    .setDescription("設定コマンドです。様々な設定を行うことができます。ベータ版です。")
    .addSubcommand(command => command
        .setName("channelset")
        .setDescription("チャンネルを指定する必要のある設定を行います。")
        .addStringOption(option => option
            .setName("type")
            .setDescription("typeについての詳細はhelpコマンドに掲載する予定です。")
            .addChoices({ name: "呼び出し可能チャンネル", value: "callch" }, { name: "収録保存チャンネル", value: "vcrecorder" })
            .setRequired(true)
        )
        .addChannelOption(option => option
            .setName("channel")
            .setDescription("チャンネルを設定します。")
        )
    )
    .addSubcommand(command => command
        .setName("statusset")
        .setDescription("オンオフを設定する必要のある設定を行います。")
        .addStringOption(option => option
            .setName("type")
            .setDescription("typeについての詳細はhelpコマンドに掲載する予定です。")
            .addChoices({ name: "キュー自動リセット", value: "queueautoreset" }, { name: "イコライザ自動リセット", value: "eqautoreset" })
            .setRequired(true)
        )
        .addBooleanOption(option => option
            .setName("boolean")
            .setDescription("オンオフを設定します。")
            .setRequired(true)
        )
    )
export const commandExample = "";

export async function execute(interaction: Interaction<CacheType>, inputData: InteractionInputData, message: Message) {
    if (interaction.isChatInputCommand()) {
        // 1. 必要な変数があるかチェック
        const variableExistCheck = new VariableExistCheck(interaction);
        const guildData = await variableExistCheck.guild();
        if (!guildData) return;
        const envData = new EnvData(guildData.guildId);
        switch (interaction.options.getSubcommand(false)) {
            case "channelset": {
                const channel = interaction.options.getChannel("channel");
                switch (interaction.options.getString("type")) {
                    case "callch": {
                        if (channel) {
                            envData.callchannelId = channel.id;
                            message.edit({ embeds: [messageEmbedGet("<#" + channel.id + "> でのみコマンドを受け付けるように設定しました。他のチャンネルではコマンドは使用できません。", interaction.client)] });
                        } else {
                            envData.callchannelId = "";
                            message.edit({ embeds: [messageEmbedGet("どのチャンネルでもコマンドが利用できるように設定しました。", interaction.client)] });
                        }
                        break;
                    }
                    case "vcrecorder": {
                        if (channel) {
                            envData.recordedAudioFileSaveChannelTo = channel.id;
                            await message.edit({ embeds: [messageEmbedGet("チャンネル <#" + channel.id + "> に音声ファイルを保存するように設定しました。すでに音楽botを使っている場合、一度`/stop`してから`/join`または`/play`を行うことで、録音を開始できます。", interaction.client)] });
                        } else {
                            envData.recordedAudioFileSaveChannelTo = "";
                            await message.edit({ embeds: [messageEmbedGet("録音機能を無効にしました。すでに音楽botを使っている場合、一度`/stop`をするまで録音は続きます。", interaction.client)] });
                        }
                        break;
                    }
                }
                break;
            }
            case "statusset": {
                const boolean = interaction.options.getBoolean("boolean");
                switch (interaction.options.getString("type")) {
                    case "queueautoreset": {
                        envData.queueAutoReset = boolean || false;
                        await message.edit({ embeds: [messageEmbedGet("キューをbot退出時に自動でリセット" + (boolean ? "する" : "しない") + "ように設定しました。", interaction.client)] });
                        break;
                    }
                    case "eqautoreset": {
                        envData.eqAutoReset = boolean || false;
                        await message.edit({ embeds: [messageEmbedGet("イコライザなどをbot退出時に自動でリセット" + (boolean ? "する" : "しない") + "ように設定しました。", interaction.client)] });
                        break;
                    }
                }
                break;
            }
        }
    }
}
