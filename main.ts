import * as Discord from "discord.js";
import fs from "fs";
import "dotenv/config";
import "./createByChatGPT/logger.js"

import { EnvData, GlobalEnvData } from "./class/envJSON.js";
import { ServersDataClass } from "./class/serversData.js";
import { InteractionInputData } from "./funcs/interface.js";
import { WebPlayerAPI } from "./class/webAPI.js";
import { Player } from "./class/player.js";
import { messageEmbedGet, videoInfoEmbedGet } from "./funcs/embed.js";
import { progressBar } from "./createByChatGPT/progressBar.js";
import { SumLog } from "./class/sumLog.js";
import { interactionLog, messageLog } from "./funcs/eventlog.js";

process.on("uncaughtException", (err) => {
    console.error("キャッチされずグローバルで発生した例外:", err);
    SumLog.error("グローバルでエラーが発生しました。ログを確認してください。", { functionName: "process.on" });
});

process.on("unhandledRejection", (reason) => {
    console.error("未処理の拒否:", reason);
    SumLog.error("よくわからないけどunhandledRejectionっていうやつが発生しました。ログを見てください。", { functionName: "process.on" });
});
const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Discord.Partials.Channel
    ]
});

/** Discordサーバーに関するデータを一時的に記録しているデータを扱うクラスです。 */
const serversDataClass = new ServersDataClass(client);
/** サーバーごとに記録する必要のある一時データです。 */
const serversData = serversDataClass.serversData;
const webPlayerAPI = new WebPlayerAPI(serversDataClass, client);
/** 全てのVCの動作を追いかけるクラスです。 */
const player = new Player(client);

/** インタラクションコマンドのデータです。 */
const interactionFuncs = (() => {
    const arr: {
        execute?: (interaction: Discord.Interaction, inputData: InteractionInputData, message: Discord.Message) => Promise<void>;
        command?: Discord.SlashCommandOptionsOnlyBuilder;
    }[] = [];
    fs.readdirSync("interaction").forEach(async str => {
        if (!str.endsWith(".ts")) return;
        try {
            const { execute, command } = await import("./interaction/" + str);
            arr.push({ execute, command });
        } catch (e) {
            console.error(e, str);
        }
    });
    return arr;
})();

/** インタラクションコマンドのデータです。 */
const adminInteractionFuncs = (() => {
    const arr: {
        execute?: (interaction: Discord.Interaction, inputData: InteractionInputData, message: Discord.Message) => Promise<void>;
        command?: Discord.SlashCommandOptionsOnlyBuilder;
    }[] = [];
    fs.readdirSync("adminInteraction").forEach(async str => {
        if (!str.endsWith(".ts")) return;
        try {
            const { execute, command } = await import("./adminInteraction/" + str);
            arr.push({ execute, command });
        } catch (e) {
            console.error(e, str);
        }
    });
    return arr;
})();

/** 再生をしきったあとにする操作です。たいていリピート操作や再生停止操作などが行われます。 */
player.on("playAutoEnd", async guildId => {
    const serverData = serversData[guildId];
    SumLog.log("音楽の再生の終了を示すコールバックが動作しました。", { guildId, client, functionName: "player.on playEnd", textChannelId: serverData?.discord.calledChannel });
    if (!serverData?.discord.calledChannel) return;
    const channel = client.guilds.cache.get(guildId)?.channels.cache.get(serverData.discord.calledChannel);
    const envData = new EnvData(guildId);
    const playlist = envData.playlist;
    const playType = envData.playType;
    switch (playType) {
        case 1: {
            playlist.shift();
            break;
        }
        case 2: {
            const videoId = playlist.shift();
            if (videoId) playlist.push(videoId);
            break;
        }
    }
    const playlistData = playlist.get(0);
    if (!playlistData) {
        try {
            if (envData.manualStartedIs) {
                if (channel && channel.isTextBased()) {
                    await channel.send({ embeds: [messageEmbedGet("次の曲がなかったため再生を一時停止中です。また再生を行う場合は`/add text:[タイトルまたはURL]`を行い`/play`を実行してください。", client)] });
                }
                SumLog.log("プレイリストが空になりました。しかしjoinを使っているため退出はしていません。", { guildId, client, functionName: "player.on playEnd", textChannelId: serverData?.discord.calledChannel });
            } else {
                if (channel && channel.isTextBased()) {
                    await channel.send({ embeds: [messageEmbedGet("次の曲がなかったため切断しました。また再生を行う場合は`/add text:[タイトルまたはURL]`を行い`/play`を実行してください。", client)] });
                }
                SumLog.log("プレイリストが空になり、退出の連絡をしました。", { guildId, client, functionName: "player.on playEnd", textChannelId: serverData?.discord.calledChannel });
            }
        } catch (e) {
            SumLog.error("プレイリストが空になりましたが、エラーが発生しました。再生は停止できたはずです。", { guildId, client, functionName: "player.on playEnd", textChannelId: serverData?.discord.calledChannel });
            console.error(e);
        }
        if (!envData.manualStartedIs) player.stop(guildId);
        return;
    }
    if (envData.changeTellIs) {
        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(serverData.discord.calledChannel);
        try {
            if (channel && channel.isTextBased()) {
                let embed: Discord.EmbedBuilder | undefined;
                const metaEmbed = await videoInfoEmbedGet([playlistData], "次の曲の再生準備中...\n0%`" + progressBar(0, 35) + "`", client, eb => { embed = eb; });
                const message = await channel.send(metaEmbed);
                try {
                    let statusTemp: {
                        status: "loading" | "downloading" | "formatchoosing" | "converting" | "done" | "queue",
                        percent: number;
                    }
                    let statuscallTime: number = Date.now();
                    const type = playlistData.type;
                    await player.sourceSet(guildId, playlistData, async (status, percent) => {
                        const temp = { status, percent }
                        if (statusTemp && statusTemp === temp) return;
                        if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
                        statusTemp = temp;
                        statuscallTime = Date.now();
                        if (embed) {
                            if (status === "loading") { embed.setDescription("次の曲の音声ファイルを準備中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                            if (status === "downloading") { embed.setDescription("次の曲の音声ファイルをダウンロード中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                            if (status === "converting") { embed.setDescription("次の曲の音声ファイルを再生可能な形式に変換中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                            if (status === "formatchoosing") { embed.setDescription("次の曲の" + (type ? (type === "videoId" ? "YouTube" : type === "nicovideoId" ? "ニコニコ動画" : "X") : "") + "サーバーに保管されたフォーマットの調査中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                            if (status === "done") { embed.setDescription("次の曲の再生開始処理中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit(metaEmbed); }
                        }
                    });
                    player.volumeSet(guildId, envData.volume);
                    player.play(guildId);
                    if (embed) embed.setDescription("次の曲の再生を開始しました。");
                    await message.edit(metaEmbed);
                } catch (e) {
                    try {
                        await message.edit({
                            embeds: [new Discord.EmbedBuilder()
                                .setTitle("エラー")
                                .setAuthor({
                                    name: "音楽bot",
                                    iconURL: client.user?.avatarURL() || undefined,
                                })
                                .setDescription("このbotで次の曲を再生する処理をしている途中でエラーが発生しました。以下のエラーは管理者側でも確認可能です。修正まで放置しておくか、`/skip`コマンドや`/delete`コマンドを使用してこのエラーを回避してください。\n```" + e + "\n```")
                                .setColor("Purple")
                            ]
                        });
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        } catch (e) {
            await player.sourceSet(guildId, playlistData);
            player.volumeSet(guildId, envData.volume);
            player.play(guildId);
            console.error(e);
        }
    } else {
        await player.sourceSet(guildId, playlistData);
        player.play(guildId);
    }
    SumLog.log("次の曲が存在したため、次の曲の再生を開始しました。", { guildId, client, functionName: "player.on playEnd", textChannelId: serverData?.discord.calledChannel });
})

/** コマンドの実行が早すぎる場合に阻止するために使うための変数です。 */
const runedServerTime: { guildId: string; runedTime: number; }[] = [];
/** コマンドの最短実行間隔です。 */
const runlimit = 1000;
client.on(Discord.Events.InteractionCreate, async interaction => {
    interactionLog(interaction);
    if (!interaction.isCommand()) return;
    if (!interaction.guild) return await interaction.reply({
        embeds: [messageEmbedGet("ここではコマンドは実行できません。", client)]
    });
    /** 1. コマンドを検索します。ヒットしたコマンドがここに記録されます。 */
    const data = interactionFuncs.find(d => d.command?.name === interaction.commandName);
    const adminData = adminInteractionFuncs.find(d => d.command?.name === interaction.commandName);
    // 2. コマンドが正しく検索され、そのコマンドが正しく取得できていた場合実行します。
    const commandFunction = data || adminData;
    if (commandFunction && commandFunction.command && commandFunction.execute) {
        if (adminData && interaction.user.id !== process.env.DISCORD_ADMIN_USER_ID) return interaction.reply({
            embeds: [messageEmbedGet("このコマンドは管理者用です。管理者にコマンドを利用させてください。もし、管理者のいないサーバーでこのコマンドを実行したら...「え？なんで実行できてるの！？」って管理者である@kazunami36_sum1は驚きを隠せなくなります。ログで見ているので、修正される予定です。", client)],
            flags: "Ephemeral"
        });
        // 3. サーバー内で実行されている場合、専用チャンネルであるかどうかやそのサーバーで間隔内でチャットが行われているかどうかの検査をします。
        if (interaction.guildId) {
            const envData = new EnvData(interaction.guildId);
            const callchannelId = envData.callchannelId;
            if (callchannelId && callchannelId != interaction.channelId) return await interaction.reply({
                embeds: [messageEmbedGet("ここで操作することはできません。特定のチャンネルでやり直してください。", client)],
                flags: "Ephemeral"
            });
            if (!runedServerTime.find(data => data.guildId === interaction.guildId)) runedServerTime.push({ guildId: interaction.guildId, runedTime: 0 });
            const runed = runedServerTime.find(data => data.guildId === interaction.guildId);
            if (runed) {
                if (Date.now() - runed.runedTime < runlimit) return interaction.reply({
                    embeds: [messageEmbedGet("コマンドは" + (runlimit / 1000) + "秒に1回までです。もう少しお待ちください。", client)]
                });
                runed.runedTime = Date.now();
            }
        }
        let permissionIs = true;
        if (!interaction.channel) permissionIs = false;
        const isThread = interaction.channel?.type === Discord.ChannelType.PublicThread ||
            interaction.channel?.type === Discord.ChannelType.PrivateThread ||
            interaction.channel?.type === Discord.ChannelType.AnnouncementThread;
        const checkPermission = [Discord.PermissionsBitField.Flags.SendMessages, isThread ? Discord.PermissionsBitField.Flags.SendMessagesInThreads : Discord.PermissionsBitField.Flags.ViewChannel];
        if (interaction.channel?.type === Discord.ChannelType.GuildText) {
            const me = interaction.guild.members.me;
            if (!me) permissionIs = false;
            else if (!interaction.channel.permissionsFor(me).has(checkPermission)) permissionIs = false;
        }
        SumLog.log("コマンド「/" + interaction.commandName + "」の実行を開始しました。", { client, guildId: interaction.guildId || undefined, textChannelId: interaction.channelId, functionName: "client.on Interaction", userId: interaction.user.id });
        // 4. 必要なデータを整え、コマンドを実行します。
        const inputData: InteractionInputData = { serversDataClass, player };
        const response = await interaction.reply({
            embeds: [messageEmbedGet("コマンド「" + commandFunction.command.name + "」の処理を開始しています...", client)],
            withResponse: true
        });
        const message = response.resource?.message || undefined;
        if (!permissionIs) {
            SumLog.warn("このサーバーでは権限のないエリアでbotを実行しています。エラーの原因となる可能性が高いです。", { client, guildId: interaction.guildId || undefined, textChannelId: interaction.channelId, functionName: "client.on Interaction", userId: interaction.user.id });
            await interaction.followUp({
                embeds: [new Discord.EmbedBuilder()
                    .setTitle("警告")
                    .setAuthor({
                        name: "音楽bot",
                        iconURL: client.user?.avatarURL() || undefined,
                    })
                    .setDescription("この音楽botはテキスト送信権限のないチャンネルでコマンドを実行しています。権限を付与しない場合、様々な機能が利用できません。ご注意ください。この警告は改善されるまで常に表示されます。")
                    .setColor("Purple")
                ]
            });
        }
        if (!message) return SumLog.error("メッセージを取得できなかったため、コマンドは実行されませんでした。", { functionName: "client.on Interaction", guildId: interaction.guildId || undefined, textChannelId: interaction.channelId, userId: interaction.user.id });
        try {
            await commandFunction.execute(interaction, inputData, message);
        } catch (e) {
            SumLog.error("コマンド「/" + interaction.commandName + "」の実行でエラーが発生しました。", { client, guildId: interaction.guildId || undefined, textChannelId: interaction.channelId || undefined, functionName: "client.on Interaction", userId: interaction.user.id });
            console.error(e);
            await interaction.editReply({
                embeds: [new Discord.EmbedBuilder()
                    .setTitle("エラー")
                    .setAuthor({
                        name: "音楽bot",
                        iconURL: client.user?.avatarURL() || undefined,
                    })
                    .setDescription("このbotでコマンドの処理をしている途中でエラーが発生しました。以下のエラーは生のエラー内容です。これは管理者側でもチェックが可能です。修正までしばらくお待ちください。\n```" + e + "\n```")
                    .setColor("Purple")
                ]
            });
        }
    }
});
client.on(Discord.Events.ShardResume, () => {
    try {
        const status: Discord.PresenceData = {};
        status.status = "online";
        status.activities = [{ name: (new GlobalEnvData()).botMessage }];
        client.user?.setPresence(status);
    } catch { }
});
client.on(Discord.Events.ClientReady, async () => {
    console.log("OK " + client.user?.displayName);
    try {
        const status: Discord.PresenceData = {};
        status.status = "online";
        status.activities = [{ name: (new GlobalEnvData()).botMessage }];
        client.user?.setPresence(status);
    } catch { }
    // サーバーリストを全部実行し、起動前に接続していたかどうかを取得して、接続していた場合その設定を復元します。
    (await client.guilds.fetch()).forEach(async data => {
        try {
            const guild = client.guilds.cache.get(data.id);
            const envData = new EnvData(data.id);
            if (!serversDataClass.serversData[data.id]) serversDataClass.serverDataInit(data.id);
            const serverData = serversDataClass.serversData[data.id];
            if (guild && serverData && envData.restartedPlayPoint >= -1 && envData.restartedCalledChannel && envData.restartedVoiceChannel) {
                const channel = await guild?.channels.fetch(envData.restartedCalledChannel);
                const voiceChannel = await guild?.channels.fetch(envData.restartedVoiceChannel);
                if (channel?.isTextBased() && voiceChannel?.isVoiceBased() && voiceChannel.members.size > 0) {
                    const playlist = envData.playlist.get(0);
                    if (!playlist) return;
                    serverData.discord.calledChannel = envData.restartedCalledChannel;
                    await player.join({
                        guildId: data.id,
                        channelId: envData.restartedVoiceChannel,
                        adapterCreator: guild.voiceAdapterCreator
                    })
                    await player.sourceSet(data.id, playlist);
                    player.playtimeSet(data.id, envData.restartedPlayPoint);
                    player.pitchSet(data.id, envData.playPitch);
                    player.speedSet(data.id, envData.playTempo);
                    player.volumeSet(data.id, envData.volume);
                    player.reverbSet(data.id, envData.reverbType);
                    if (envData.restartedPlayIs) player.play(data.id);
                    await channel.send({ embeds: [messageEmbedGet("音楽botは復帰しました。", client)] });
                    SumLog.log("再起動前に接続していたサーバーに参加しました。", { client, functionName: "client.on ready", guildId: guild.id, textChannelId: channel.id, voiceChannelId: voiceChannel.id });
                } else {
                    SumLog.log("再起動前に接続していたサーバーに参加しようとしましたが、情報が正しくなかったか、VCに誰もいなかったため参加しませんでした。", { client, functionName: "client.on ready", guildId: guild.id, textChannelId: envData.restartedCalledChannel, voiceChannelId: envData.restartedVoiceChannel });
                }
                envData.restartedPlayPoint = -1;
                envData.restartedCalledChannel = "";
                envData.restartedVoiceChannel = "";
                envData.restartedPlayIs = false;
            }
        } catch (e) {
            console.error("再生停止処理中にエラー(処理は続行されます)", e)
        }
    });
});
// VCの状態が変化したら実行します。
client.on(Discord.Events.VoiceStateUpdate, async (oldState, newState) => {
    await newState.guild.fetch();
    SumLog.log("VCの状態が変化しました。oldStateの情報を梱包しています。", { client, voiceChannelId: oldState.channelId || undefined, guildId: oldState.guild.id, userId: oldState.member?.id, functionName: "voicestatechange" });
    SumLog.log("VCの状態が変化しました。newStateの情報を梱包しています。", { client, voiceChannelId: newState.channelId || undefined, guildId: newState.guild.id, userId: newState.member?.id, functionName: "voicestatechange" });
    /** 状態が変化したVCを取得 */
    const channel = await newState.guild.channels.fetch(newState.channelId || oldState.channelId || "");
    const newChannel = await newState.channel?.fetch(false);
    if (!channel || !channel.isVoiceBased?.()) return;
    if (newChannel && player.playStatusGet(newChannel.guildId) === "stop") {
        if (newChannel.members.filter(member => member.user.bot === false).size >= 1) {
            const envData = new EnvData(newState.guild.id);
            if (envData.recordedAudioFileSaveChannelTo) {
                await player.join({ guildId: newState.guild.id, channelId: newChannel.id, adapterCreator: newState.guild.voiceAdapterCreator });
            }
        }
    } else if (player.playStatusGet(channel.guildId) !== "stop") {
        // 1. VCにいる人数がBotを含めず0人になったら退出します。
        if (channel.members.filter(member => member.user.bot === false).size <= 0) {
            const serverData = serversData[newState.guild.id];
            // 退出チャットが表示できそうなら表示します。
            if (serverData && serverData.discord.calledChannel) {
                const channel = newState.guild.channels.cache.get(serverData.discord.calledChannel);
                if (channel && channel.isTextBased()) {
                    channel.send({
                        embeds: [messageEmbedGet("全員が退出したため、再生を停止します。また再度VCに参加して`/play`を実行すると再生できます。", client)]
                    });
                }
            }
            SumLog.log("VCからメンバーが退出し、botも退出しました。", { client, functionName: "client.on voiceupdate", guildId: newState.guild.id, voiceChannelId: newState.channelId || undefined });
            // 実際に退出します。
            player.stop(channel.guildId);
        }
    }
});
client.on(Discord.Events.GuildCreate, guild => {
    console.log("音楽botが新しいサーバーに参加。参加したサーバー名: " + guild.name + " 現在の参加数: " + client.guilds.cache.size);
    SumLog.log("新しいサーバーにbotが参加しました。現時点の参加数: " + client.guilds.cache.size, { client, functionName: "client.on guildcreate", guildId: guild.id });
});
client.on(Discord.Events.ShardDisconnect, (event, id) => {
    console.log(`Shard ${id} disconnected`, event);
    SumLog.log(`Shard ${id} disconnected ` + event.code + client.guilds.cache.size, { client, functionName: "client.on sharddisconnect" });
});
client.on(Discord.Events.ShardReconnecting, (id) => {
    try {
        const status: Discord.PresenceData = {};
        status.status = "online";
        status.activities = [{ name: (new GlobalEnvData()).botMessage }];
        client.user?.setPresence(status);
    } catch { }
    console.log(`Shard ${id} reconnecting...`);
    SumLog.log(`Shard ${id} reconnecting...` + client.guilds.cache.size, { client, functionName: "client.on shardreconnenting" });
});
client.on(Discord.Events.ShardReady, (id) => {
    console.log(`Shard ${id} reconnected...`);
    SumLog.log(`Shard ${id} connected` + client.guilds.cache.size, { client, functionName: "client.on shardready" });
});

client.login(process.env.DISCORD_TOKEN);

// ここから下は至って重要なコードではありません。

const bt = [
    {
        name: "音割れポッター",
        videoId: "OwN6FwkSWwY"
    },
    {
        name: "威風堂々",
        videoId: "-Tyy3zTbVWc"
    },
    {
        name: "ソ連",
        videoId: "rwAns-qsMPo"
    },
    {
        name: "ココナッツモール池崎",
        videoId: "kgJ3K1keWGU"
    },
    {
        name: "BIG HSI",
        videoId: "Ai4g34CTdA0"
    },
    {
        name: "タドコロ電機",
        videoId: "1kAZdsQrO4s"
    },
]
let joubutuNumber = Math.floor(Math.random() * bt.length);
client.on(Discord.Events.MessageCreate, async message => {
    messageLog(message);
    if (message.guildId === process.env.DISCORD_ADMIN_GUILD_ID || "926965020724691005") {
        if (message.content === client.user?.displayName + "のコマンドを再定義する") {
            // JSON へ変換（REST 配信用）
            function toJSONBody(builders: Discord.SlashCommandOptionsOnlyBuilder[]): Discord.RESTPostAPIApplicationCommandsJSONBody[] {
                return builders.map((b) => (b as any).toJSON ? (b as any).toJSON() : (b as unknown as Discord.RESTPostAPIApplicationCommandsJSONBody));
            }
            const botmessage = await message.reply("処理を開始します...");
            const token = process.env.DISCORD_TOKEN;
            const clientId = client.user?.id;

            if (!token || !clientId) return await botmessage.edit("トークンまたはクライアントIDが無効だったよ。");
            const commands = interactionFuncs.map(func => func.command).filter((cmd): cmd is Discord.SlashCommandOptionsOnlyBuilder => cmd !== undefined);
            const body = toJSONBody(commands);
            const adminCommands = adminInteractionFuncs.map(func => func.command).filter((cmd): cmd is Discord.SlashCommandOptionsOnlyBuilder => cmd !== undefined);
            const adminBody = toJSONBody(adminCommands);
            const rest = new Discord.REST({ version: "10" }).setToken(token);

            botmessage.edit("グローバルコマンドをセットしています...");
            await rest.put(Discord.Routes.applicationCommands(clientId), { body: body });

            // サーバーのID一覧
            const guildIds = [process.env.DISCORD_ADMIN_GUILD_ID || "926965020724691005"];
            for (let i = 0; i < guildIds.length; i++) {
                const guildId = guildIds[i];
                botmessage.edit("サーバーコマンドを" + guildIds.length + "中" + (i + 1) + "つ目の「" + client.guilds.cache.get(guildId)?.name + "/" + guildId + "」に登録しています...時間がかかります。");
                await rest.put(Discord.Routes.applicationGuildCommands(clientId, guildId), { body: body });
                botmessage.edit("サーバーコマンドを" + guildIds.length + "中" + (i + 1) + "つ目の「" + client.guilds.cache.get(guildId)?.name + "/" + guildId + "」から削除しています...");
                await rest.put(Discord.Routes.applicationGuildCommands(clientId, guildId), { body: adminBody });
            }
            botmessage.edit("グローバルコマンドを登録しました。");
            return;
        }
    }
    // 1. bot呼び出しでないものをスキップする。
    if (message.content === "VCの皆、成仏せよ") {
        if (!message.guildId || !message.member || !message.guild) return message.reply("ごめん！！エラーっす！www");
        if (!serversData[message.guildId]) serversDataClass.serverDataInit(message.guildId);
        const serverData = serversData[message.guildId];
        if (!serverData) return message.reply("ごめん！！エラーっす！www");
        const envData = new EnvData(message.guildId);
        const callchannelId = envData.callchannelId;
        if (callchannelId && callchannelId !== message.channelId) return console.log("専用チャンネルでないところで成仏させようとしました。ID: " + message.guildId, typeof callchannelId, callchannelId)
        if (!message.member.voice.channelId) return console.log("チャンネルに参加していない人が成仏させようとしました。ID: " + message.guildId)
        if (!runedServerTime.find(data => data.guildId === message.guildId)) runedServerTime.push({ guildId: message.guildId, runedTime: 0 });
        const runed = runedServerTime.find(data => data.guildId === message.guildId);
        if (runed) {
            if (Date.now() - runed.runedTime < runlimit) return message.reply("コマンドは" + (runlimit / 1000) + "秒に1回までです。もう少しお待ちください。");
            runed.runedTime = Date.now();
        }
        if ((joubutuNumber++) >= bt.length - 1) joubutuNumber = 0;
        const { name, videoId } = bt[joubutuNumber];
        await player.forcedPlay({
            guildId: message.guildId,
            channelId: message.member.voice.channelId,
            adapterCreator: message.guild.voiceAdapterCreator,
            source: { type: "videoId", body: videoId },
            playtime: 0,
            tempo: envData.playTempo,
            pitch: envData.playPitch,
            volume: 1145141919
        });
        await message.reply(name + "の日です。音量を" + 1145141919 + "%にしました。音割れをお楽しみください。キューや設定は変更していないため、次の曲からは音量は" + envData.volume + "%に戻ります。");
    }
})
