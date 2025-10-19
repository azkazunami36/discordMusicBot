import * as Discord from "discord.js";
import fs from "fs";
import "dotenv/config";
import "./createByChatGPT/logger.js"

process.on("uncaughtException", (err) => {
    console.error("キャッチされずグローバルで発生した例外:", err);
    SumLog.error("グローバルでエラーが発生しました。ログを確認してください。", { functionName: "process.on" });
});

process.on("unhandledRejection", (reason) => {
    console.error("未処理の拒否:", reason);
    SumLog.error("よくわからないけどunhandledRejectionっていうやつが発生しました。ログを見てください。", { functionName: "process.on" });
});

import { EnvData } from "./class/envJSON.js";
import { ServersDataClass } from "./class/serversData.js";
import { InteractionInputData } from "./funcs/interface.js";
import { WebPlayerAPI } from "./class/webAPI.js";
import { Player } from "./class/player.js";
import { messageEmbedGet, videoInfoEmbedGet } from "./funcs/embed.js";
import { progressBar } from "./createByChatGPT/progressBar.js";
import { getVoiceConnections, VoiceConnection } from "@discordjs/voice";
import { SumLog } from "./class/sumLog.js";

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
const player = new Player();


/** 再生をしきったあとにする操作です。たいていリピート操作や再生停止操作などが行われます。 */
player.on("playAutoEnd", async (guildId) => {
    const serverData = serversData[guildId];
    SumLog.log("音楽の再生の終了を示すコールバックが動作しました。", { guildId, client, functionName: "player.on playEnd", textChannelId: serverData?.discord.calledChannel });
    if (!serverData?.discord.calledChannel) return;
    const channel = client.guilds.cache.get(guildId)?.channels.cache.get(serverData.discord.calledChannel);
    const envData = new EnvData(guildId);
    const playlist = envData.playlistGet();
    const playType = envData.playType;
    switch (playType) {
        case 1: {
            playlist.shift();
            envData.playlistSave(playlist);
            break;
        }
        case 2: {
            const videoId = playlist.shift();
            if (videoId) playlist.push(videoId);
            envData.playlistSave(playlist);
            break;
        }
    }
    if (playlist.length < 1) {
        try {
            if (channel && channel.isTextBased()) {
                await channel.send({ embeds: [messageEmbedGet("次の曲がなかったため切断しました。また再生を行う場合は`/add text:[タイトルまたはURL]`を行い`/play`を実行してください。", client)] });
            }
            SumLog.log("プレイリストが空になり、退出の連絡をしました。", { guildId, client, functionName: "player.on playEnd", textChannelId: serverData?.discord.calledChannel });
        } catch (e) {
            SumLog.error("プレイリストが空になりましたが、エラーが発生しました。再生は停止できたはずです。", { guildId, client, functionName: "player.on playEnd", textChannelId: serverData?.discord.calledChannel });
            console.error(e);
        }
        player.stop(guildId);
        return;
    }
    const playlistData = playlist[0];
    if (envData.changeTellIs) {
        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(serverData.discord.calledChannel);
        try {
            if (channel && channel.isTextBased()) {
                const metaEmbed = await videoInfoEmbedGet([playlistData], "次の曲の再生準備中...\n0%`" + progressBar(0, 35) + "`", client);
                const message = await channel.send({ embeds: [metaEmbed] });
                try {
                    let statusTemp: {
                        status: "loading" | "downloading" | "formatchoosing" | "converting" | "done" | "queue",
                        percent: number;
                    }
                    let statuscallTime: number = Date.now();
                    const type = playlist[0].type;
                    await player.sourceSet(guildId, playlist[0], async (status, percent) => {
                        const temp = { status, percent }
                        if (statusTemp && statusTemp === temp) return;
                        if (statusTemp && statusTemp.status === status && Date.now() - statuscallTime < 500) return;
                        statusTemp = temp;
                        statuscallTime = Date.now();
                        if (status === "loading") { metaEmbed.setDescription("次の曲の音声ファイルを準備中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit({ embeds: [metaEmbed] }); }
                        if (status === "downloading") { metaEmbed.setDescription("次の曲の音声ファイルをダウンロード中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit({ embeds: [metaEmbed] }); }
                        if (status === "converting") { metaEmbed.setDescription("次の曲の音声ファイルを再生可能な形式に変換中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit({ embeds: [metaEmbed] }); }
                        if (status === "formatchoosing") { metaEmbed.setDescription("次の曲の" + (type ? (type === "videoId" ? "YouTube" : type === "nicovideoId" ? "ニコニコ動画" : "X") : "") + "サーバーに保管されたフォーマットの調査中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit({ embeds: [metaEmbed] }); }
                        if (status === "done") { metaEmbed.setDescription("次の曲の再生開始処理中...\n" + Math.floor(percent) + "%`" + progressBar(percent, 35) + "`"); await message.edit({ embeds: [metaEmbed] }); }
                    });
                    player.volumeSet(guildId, envData.volume);
                    metaEmbed.setDescription("次の曲の再生を開始しました。");
                    await message.edit({ embeds: [metaEmbed] });
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
            await player.sourceSet(guildId, playlist[0]);
            player.volumeSet(guildId, envData.volume);
            console.error(e);
        }
    } else {
        await player.sourceSet(guildId, playlist[0]);
    }
    SumLog.log("次の曲が存在したため、次の曲の再生を開始しました。", { guildId, client, functionName: "player.on playEnd", textChannelId: serverData?.discord.calledChannel });
})

/** インタラクションコマンドのデータです。 */
const interactionFuncs = (() => {
    const arr: {
        execute?: (interaction: Discord.Interaction, inputData: InteractionInputData, message: Discord.Message) => Promise<void>;
        command?: Discord.SlashCommandOptionsOnlyBuilder;
    }[] = [];
    fs.readdirSync("interaction").forEach(async str => {
        if (!str.endsWith(".js")) return;
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
        if (!str.endsWith(".js")) return;
        try {
            const { execute, command } = await import("./adminInteraction/" + str);
            arr.push({ execute, command });
        } catch (e) {
            console.error(e, str);
        }
    });
    return arr;
})();

/** コマンドの実行が早すぎる場合に阻止するために使うための変数です。 */
const runedServerTime: { guildId: string; runedTime: number; }[] = [];
/** コマンドの最短実行間隔です。 */
const runlimit = 1000;
client.on(Discord.Events.InteractionCreate, async interaction => {
    SumLog.log("インタラクションを受信しました。", { client, guildId: interaction.guildId || undefined, textChannelId: interaction.channelId || undefined, functionName: "client.on Interaction", userId: interaction.user.id });
    if (fs.existsSync("./log/userinteraction.log")) {
        const meta = fs.statSync("./log/userinteraction.log");
        if (meta.size > 10 * 1000 * 1000) {
            let num = 0;
            while (fs.existsSync("./log/userinteraction." + num + ".log")) num++;
            fs.renameSync("./log/userinteraction.log", "./log/userinteraction." + num + ".log")
        }
    }
    if (!fs.existsSync("./log/userinteraction.log")) fs.writeFileSync("./log/userinteraction.log", "");
    function formatDateJST(date = new Date()) {
        const offsetMs = 9 * 60 * 60 * 1000; // JST(+9時間)
        const jstDate = new Date(date.getTime() + offsetMs);

        const iso = jstDate.toISOString(); // 例: 2025-10-11T20:33:14.112Z
        return iso.replace('Z', '+09:00');
    }
    function summarizeInteraction(interaction: Discord.Interaction) {
        // ユーティリティ：安全にJSON化（循環・BigInt回避）
        const safe = (o: unknown) =>
            JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), "  ");

        // 1) ボタン
        if (interaction.isButton()) {
            return {
                type: 'Button',
                body: safe({
                    customId: interaction.customId,
                    messageId: interaction.message?.id,
                    channelId: interaction.channelId,
                }),
            };
        }

        // 2) モーダル
        if (interaction.isModalSubmit()) {
            return {
                type: 'ModalSubmit',
                body: safe({
                    customId: interaction.customId,
                    fields: interaction.fields.fields.map(f => ({
                        customId: f.customId,
                        value: interaction.fields.getTextInputValue(f.customId),
                    })),
                }),
            };
        }

        // 3) セレクトメニュー群
        if (interaction.isAnySelectMenu()) {
            // 種別名の見栄え整形
            const typeName =
                interaction.isStringSelectMenu() ? 'StringSelectMenu' :
                    interaction.isUserSelectMenu() ? 'UserSelectMenu' :
                        interaction.isRoleSelectMenu() ? 'RoleSelectMenu' :
                            interaction.isMentionableSelectMenu() ? 'MentionableSelectMenu' :
                                interaction.isChannelSelectMenu() ? 'ChannelSelectMenu' :
                                    'SelectMenu';

            return {
                type: typeName,
                body: safe({
                    customId: interaction.customId,
                    values:
                        'values' in interaction ? interaction.values : undefined, // string[]
                    users:
                        interaction.isUserSelectMenu()
                            ? interaction.users.map(u => ({ id: u.id, tag: u.tag }))
                            : undefined,
                    roles:
                        interaction.isRoleSelectMenu()
                            ? interaction.roles.map(r => ({ id: r.id, name: r.name }))
                            : undefined,
                    channels:
                        interaction.isChannelSelectMenu()
                            ? interaction.channels.map(c => ({ id: c.id, name: c.type }))
                            : undefined,
                    mentionables:
                        interaction.isMentionableSelectMenu()
                            ? interaction.values // mentionableはID配列
                            : undefined,
                }),
            };
        }

        // 4) メッセージコンポーネント（一般）
        if (interaction.isMessageComponent()) {
            // 上の個別分岐に引っかからなかったコンポーネント（稀）
            return {
                type: 'MessageComponent',
                body: "never",
            };
        }

        // 5) オートコンプリート
        if (interaction.isAutocomplete()) {
            const focused = interaction.options.getFocused(true);
            return {
                type: 'Autocomplete',
                body: safe({
                    commandName: interaction.commandName,
                    focusedOption: { name: focused.name, value: focused.value },
                }),
            };
        }

        // 6) Chat Input（スラッシュ）コマンド
        if (interaction.isChatInputCommand()) {
            // オプションを素直に展開
            const opts = interaction.options.data.map(o => ({
                name: o.name,
                type: o.type,
                value: o.value,
                focused: (o as any).focused ?? false,
                options: (o as any).options ?? undefined,
            }));
            return {
                type: 'ChatInputCommand',
                body: safe({
                    commandName: interaction.commandName,
                    options: opts,
                }),
            };
        }

        // 7) コンテキストメニューコマンド（メッセージ／ユーザー）
        if (interaction.isContextMenuCommand()) {
            const base = {
                commandName: interaction.commandName,
                targetId: interaction.targetId,
            };

            if (interaction.isMessageContextMenuCommand()) {
                return {
                    type: 'MessageContextMenuCommand',
                    body: safe({
                        ...base,
                        targetMessageId: interaction.targetMessage.id,
                        targetAuthorId: interaction.targetMessage.author?.id,
                    }),
                };
            }
            if (interaction.isUserContextMenuCommand()) {
                return {
                    type: 'UserContextMenuCommand',
                    body: safe({
                        ...base,
                        targetUserId: interaction.targetUser.id,
                        targetUserTag: interaction.targetUser.tag,
                    }),
                };
            }

            // 予備（将来型）
            return {
                type: 'ContextMenuCommand',
                body: safe(base),
            };
        }

        // 8) 一般の CommandInteraction（後方互換）
        if (interaction.isCommand && interaction.isCommand()) {
            return {
                type: 'Command',
                body: safe({
                    commandName: (interaction as any).commandName,
                }),
            };
        }

        // 9) PrimaryEntryPointCommand（対応環境向け）
        if ((interaction as any).isPrimaryEntryPointCommand?.()) {
            return {
                type: 'PrimaryEntryPointCommand',
                body: safe({
                    commandName: (interaction as any).commandName,
                }),
            };
        }

        // 10) Repliable（返信可能）かどうかのメタ
        if (interaction.isRepliable()) {
            return {
                type: 'Repliable',
                body: safe({
                    id: interaction.id,
                    channelId: interaction.channelId,
                }),
            };
        }

        // Fallback
        return {
            type: 'Unknown',
            body: safe({
                id: "never",
                type: (interaction as any).type,
            }),
        };
    }
    const stat = summarizeInteraction(interaction);
    fs.appendFileSync("./log/userinteraction.log", "\n[" + formatDateJST() + "] [" + stat.type + "] [" + interaction.guild?.name + "(" + interaction.guildId + ")" + "] [" + interaction.user.globalName + "(" + interaction.user.username + "/" + interaction.user.id + ")" + "] " + stat.body)

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
        if (!permissionIs) SumLog.log("このサーバーが権限が不足している箇所が多いようです。", { client, guildId: interaction.guildId || undefined, textChannelId: interaction.channelId, functionName: "client.on Interaction", userId: interaction.user.id });
        // 4. 必要なデータを整え、コマンドを実行します。
        const inputData: InteractionInputData = { serversDataClass, player };
        const response = await interaction.reply({
            embeds: [messageEmbedGet("コマンド「" + commandFunction.command.name + "」の処理を開始しています...", client)],
            withResponse: true
        });
        const message = response.resource?.message || undefined;
        if (!permissionIs) await interaction.followUp({
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
client.on(Discord.Events.ClientReady, async () => {
    console.log("OK " + client.user?.displayName);
    client.user?.setStatus("online");
    (await client.guilds.fetch()).forEach(async data => {
        try {
            const guild = client.guilds.cache.get(data.id);
            const envData = new EnvData(data.id);
            if (!serversDataClass.serversData[data.id]) serversDataClass.serverDataInit(data.id);
            const serverData = serversDataClass.serversData[data.id];
            if (guild && serverData && envData.restartedPlayPoint !== -1 && envData.restartedCalledChannel && envData.restartedVoiceChannel) {
                const channel = await guild?.channels.fetch(envData.restartedCalledChannel);
                const voiceChannel = await guild?.channels.fetch(envData.restartedVoiceChannel);
                if (channel?.isTextBased() && voiceChannel?.isVoiceBased() && voiceChannel.members.size > 0) {
                    const playlist = envData.playlistGet();
                    serverData.discord.calledChannel = envData.restartedCalledChannel;
                    await player.forcedPlay({
                        guildId: data.id,
                        channelId: envData.restartedVoiceChannel,
                        adapterCreator: guild.voiceAdapterCreator,
                        source: playlist[0],
                        playtime: envData.restartedPlayPoint,
                        tempo: envData.playTempo,
                        pitch: envData.playPitch,
                        volume: envData.volume
                    });
                    await channel.send({ embeds: [messageEmbedGet("音楽botは復帰しました。", client)] });
                    SumLog.log("再起動前に接続していたサーバーに参加しました。", { client, functionName: "client.on ready", guildId: guild.id, textChannelId: channel.id, voiceChannelId: voiceChannel.id });
                } else {
                    SumLog.log("再起動前に接続していたサーバーに参加しようとしましたが、情報が正しくなかったか、VCに誰もいなかったため参加しませんでした。", { client, functionName: "client.on ready", guildId: guild.id, textChannelId: envData.restartedCalledChannel, voiceChannelId: envData.restartedVoiceChannel });
                }
                envData.restartedPlayPoint = -1;
                envData.restartedCalledChannel = "";
                envData.restartedVoiceChannel = "";
            }
        } catch (e) {
            console.error("再生停止処理中にエラー(処理は続行されます)", e)
        }
    });
});
// VCの状態が変化したら実行します。
client.on(Discord.Events.VoiceStateUpdate, async (oldState, newState) => {
    /** 状態が変化したVCを取得 */
    const channel = newState.guild.channels.cache.get(newState.channelId || oldState.channelId || "");
    if (!channel || !channel.isVoiceBased() || !player.playingGet(channel.guildId)) return;
    // 1. VCにいる人数がBotを含め1人以下になったら退出します。
    if (channel.members.size <= 1) {
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
client.on(Discord.Events.GuildCreate, guild => {
    console.log("音楽botが新しいサーバーに参加。参加したサーバー名: " + guild.name + " 現在の参加数: " + client.guilds.cache.size);
    SumLog.log("新しいサーバーにbotが参加しました。現時点の参加数: " + client.guilds.cache.size, { client, functionName: "client.on guildcreate", guildId: guild.id });
});
client.on(Discord.Events.ShardDisconnect, (event, id) => {
    console.log(`Shard ${id} disconnected`, event);
    SumLog.log(`Shard ${id} disconnected ` + event.code + client.guilds.cache.size, { client, functionName: "client.on sharddisconnect" });
});
client.on(Discord.Events.ShardReconnecting, (id) => {
    console.log(`Shard ${id} reconnecting...`);
    SumLog.log(`Shard ${id} reconnecting...` + client.guilds.cache.size, { client, functionName: "client.on shardreconnenting" });
});
client.on(Discord.Events.ShardReady, (id) => {
    console.log(`Shard ${id} reconnecting...`);
    SumLog.log(`Shard ${id} connectied` + client.guilds.cache.size, { client, functionName: "client.on shardready" });
});
client.on(Discord.Events.MessageCreate, async message => {
    if (!message.author.bot) {
        if (fs.existsSync("./log/usermessage.log")) {
            const meta = fs.statSync("./log/usermessage.log");
            if (meta.size > 10 * 1000 * 1000) {
                let num = 0;
                while (fs.existsSync("./log/usermessage." + num + ".log")) num++;
                fs.renameSync("./log/usermessage.log", "./log/usermessage." + num + ".log")
            }
        }
        if (!fs.existsSync("./log/usermessage.log")) fs.writeFileSync("./log/usermessage.log", "");
        function formatDateJST(date = new Date()) {
            const offsetMs = 9 * 60 * 60 * 1000; // JST(+9時間)
            const jstDate = new Date(date.getTime() + offsetMs);

            const iso = jstDate.toISOString(); // 例: 2025-10-11T20:33:14.112Z
            return iso.replace('Z', '+09:00');
        }
        function extractMessageExtras(message: Discord.Message) {
            const results = [];

            // 添付ファイル（画像・動画・PDFなど）
            for (const [, attachment] of message.attachments) {
                results.push({
                    type: 'attachment',
                    body: attachment.url
                });
            }

            // ステッカー（スタンプ）
            for (const [, sticker] of message.stickers) {
                results.push({
                    type: 'sticker',
                    body: sticker.id
                });
            }

            // 埋め込み（リンクのメタ情報など）
            for (const embed of message.embeds) {
                results.push({
                    type: 'embed',
                    body: embed.url || embed.title || '[embed without url]'
                });
            }

            // ボタン・メニューなど（components）
            for (const row of message.components) {
                results.push({
                    type: 'component',
                    body: JSON.stringify(row.toJSON())
                });
            }

            // 投票（poll）
            if (message.poll) {
                results.push({
                    type: 'poll',
                    body: message.poll.question?.text ?? '[poll]'
                });
            }

            return results;
        }
        fs.appendFileSync("./log/usermessage.log", "\n[" + formatDateJST() + "] [" + message.guild?.name + "(" + message.guildId + ")" + "] [" + message.author.globalName + "(" + message.author.username + "/" + message.author.id + ")" + "] " + message.content + ", " + JSON.stringify(extractMessageExtras(message), null, "  "))

        SumLog.log(message.content, { client, functionName: "client.on message", guildId: message.guildId || undefined, textChannelId: message.channelId, userId: message.member?.id });
    }
    if (message.guildId === "926965020724691005") {
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
            const guildIds = ["926965020724691005"];
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
        if (message.content === client.user?.displayName + "のステータス") {
            const connections = getVoiceConnections();
            const list: VoiceConnection[] = [];
            connections.forEach(connection => list.push(connection));
            await message.reply("現在音楽botは" + list.length + "箇所で再生されています。: " + (() => {
                let string = "";
                for (const data of list) {
                    string += "\n" + (() => {
                        try {
                            return client.guilds.cache.get(data.joinConfig.guildId)?.name
                        } catch {
                            return "取得エラー"
                        }
                    })() + " / " + data.joinConfig.guildId
                }
                return string;
            })() + "\nこの音楽botは" + client.guilds.cache.size + "箇所に参加しています。: " + (() => {
                let string = "";
                client.guilds.cache.forEach(data => {
                    string += "\n" + (() => {
                        try {
                            return client.guilds.cache.get(data.id)?.name
                        } catch {
                            return "取得エラー"
                        }
                    })() + " / " + data.id
                })
                return string;
            })());
        }
        if (message.content.startsWith(client.user?.displayName + "をシャットダウンする")) {
            const connections = getVoiceConnections();
            const list: VoiceConnection[] = [];
            connections.forEach(connection => list.push(connection));
            const botmessage = await message.reply("再生を停止してシャットダウンの旨を連絡中...");
            let i = 0;
            for (const data of list) {
                i++;
                await botmessage.edit("再生を停止してシャットダウンの旨を連絡中...(" + i + "/" + list.length + ")");
                try {
                    const serverData = serversData[data.joinConfig.guildId];
                    if (serverData && serverData.discord.calledChannel) {
                        const channel = client.guilds.cache.get(data.joinConfig.guildId)?.channels.cache.get(serverData.discord.calledChannel);
                        if (channel && channel.isTextBased()) {
                            const adminMessage = message.content.split("♡")[1];
                            await channel.send({ embeds: [messageEmbedGet("お楽しみ中のところ大変申し訳ありません。音楽botはメンテナンス・再起動のため強制的にシャットダウン処理を開始します。音楽botがオンラインになるまでしばらくお待ちください。" + (adminMessage ? "管理者からシャットダウン理由について説明されています。\n\n**〜管理者よりメッセージ〜**\n\n" + adminMessage : "再起動理由について、管理者はメッセージを用意しませんでした。意図について詳しく説明できず、復旧タイミングも不明です。\n\n現在のメッセージから５分経ってもこのbotのオンラインステータスが復帰しない場合、X(旧Twitter)で@kazunami36_sum1のツイート情報をご確認ください。"), client)] });
                        }
                    }
                    player.stop(data.joinConfig.guildId);
                } catch (e) {
                    console.error("再生停止処理中にエラー(処理は続行されます)", e)
                }
            }
            await botmessage.edit("シャットダウンの準備が整いました。システムが終了しているか確認してください。");
            await client.destroy();
            process.exit(0);
        }
        if (message.content.startsWith(client.user?.displayName + "を再起動する")) {
            const connections = getVoiceConnections();
            const list: VoiceConnection[] = [];
            connections.forEach(connection => list.push(connection));
            const botmessage = await message.reply("再生を停止して再起動の旨を連絡中...");
            let i = 0;
            for (const data of list) {
                i++;
                await botmessage.edit("再生を停止して再起動の旨を連絡中...(" + i + "/" + list.length + ")");
                try {
                    const serverData = serversData[data.joinConfig.guildId];
                    const envData = new EnvData(data.joinConfig.guildId);
                    if (serverData && serverData.discord.calledChannel && data.joinConfig.channelId) {
                        const channel = client.guilds.cache.get(data.joinConfig.guildId)?.channels.cache.get(serverData.discord.calledChannel);
                        if (channel && channel.isTextBased()) {
                            const adminMessage = message.content.split("♡")[1];
                            await channel.send({ embeds: [messageEmbedGet("お楽しみ中のところ大変申し訳ありません。音楽botは再起動を開始します。音楽botがオンラインになるまでしばらくお待ちください。再起動後に音楽botはVCに再接続します。" + (adminMessage ? "管理者から再起動理由について説明されています。\n\n**〜管理者よりメッセージ〜**\n\n" + adminMessage : "\n\n現在のメッセージから５分経ってもこのbotのオンラインステータスが復帰しない場合、X(旧Twitter)で@kazunami36_sum1のツイート情報をご確認ください。"), client)] });
                        }
                        envData.restartedPlayPoint = player.playtimeGet(data.joinConfig.guildId);
                        envData.restartedCalledChannel = serverData.discord.calledChannel;
                        envData.restartedVoiceChannel = data.joinConfig.channelId;
                    }
                    player.stop(data.joinConfig.guildId);
                } catch (e) {
                    console.error("再生停止処理中にエラー(処理は続行されます)", e)
                }
            }
            await botmessage.edit("再起動の準備が整いました。システムが終了しているか確認してください。");
            await client.destroy();
            process.exit(0);
        }
    }
    // 1. bot呼び出しでないものをスキップする。
    if (!message.guildId || !message.member || !message.guild) return message.reply("ごめん！！エラーっす！www");
    if (message.content === "VCの皆、成仏せよ") {
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
