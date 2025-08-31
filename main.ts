import * as Discord from "discord.js";
import * as DiscordVoice from "@discordjs/voice";
import fs from "fs";
import "dotenv/config";
import { Writable } from "stream";

import { EnvData } from "./envJSON.js";
import { PlayerSet } from "./playerSet.js";
import { ServersDataClass } from "./serversData.js";
import { InteractionInputData } from "./interface.js";
import { sourcePathManager } from "./sourcePathManager.js";

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
/** サーバーに記録されたプレイリストの内容をセットしたり、プレイヤーを設定したりするのを自動で行います。 */
const playerSet = new PlayerSet(serversData);
serversDataClass.playSet = playerSet;
const { playerSetAndPlay } = playerSet;

/** インタラクションコマンドのデータです。 */
const interactionFuncs = (() => {
    const arr: {
        execute?: (interaction: Discord.Interaction, inputData: InteractionInputData) => Promise<void>;
        command?: Discord.SlashCommandOptionsOnlyBuilder;
    }[] = [];
    fs.readdirSync("interaction").forEach(async str => {
        if (str.endsWith(".ts") || str.endsWith(".d.ts")) return;
        try {
            const { execute, command } = await import("./interaction/" + str);
            arr.push({ execute, command });
        } catch (e) {
            console.log(e);
        }
    });
    return arr;
})();

/** コマンドの実行が早すぎる場合に阻止するために使うための変数です。 */
const runedServerTime: { guildId: string; runedTime: number; }[] = [];
/** コマンドの最短実行間隔です。 */
const runlimit = 1000;
client.on(Discord.Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;
    /** 1. コマンドを検索します。ヒットしたコマンドがここに記録されます。 */
    const data = interactionFuncs.find(d => d.command?.name === interaction.commandName);
    // 2. コマンドが正しく検索され、そのコマンドが正しく取得できていた場合実行します。
    if (data && data.command && data.execute) {
        // 3. サーバー内で実行されている場合、専用チャンネルであるかどうかやそのサーバーで間隔内でチャットが行われているかどうかの検査をします。
        if (interaction.guildId) {
            const envData = new EnvData(interaction.guildId);
            const callchannelId = envData.callchannelId;
            if (callchannelId && callchannelId != interaction.channelId) return await interaction.reply({
                content: "ここで曲を追加することはできません。特定のチャンネルでやり直してください。",
                flags: "Ephemeral"
            })
            if (!runedServerTime.find(data => data.guildId === interaction.guildId)) runedServerTime.push({ guildId: interaction.guildId, runedTime: 0 });
            const runed = runedServerTime.find(data => data.guildId === interaction.guildId);
            if (runed) {
                if (Date.now() - runed.runedTime < runlimit) return interaction.reply("コマンドは" + (runlimit / 1000) + "秒に1回までです。もう少しお待ちください。");
                runed.runedTime = Date.now();
            }
        }
        // 4. 必要なデータを整え、コマンドを実行します。
        const inputData: InteractionInputData = { serversDataClass, playerSet };
        await interaction.reply("コマンド「" + data.command.name + "」の処理を開始しています...");
        await data.execute(interaction, inputData);
    }
});
client.on(Discord.Events.ClientReady, () => {
    console.log("OK " + client.user?.displayName);
    client.user?.setStatus("online");
});
// VCの状態が変化したら実行します。
client.on(Discord.Events.VoiceStateUpdate, async (oldState, newState) => {
    const channel = newState.guild.channels.cache.get(newState.channelId || oldState.channelId || "");
    if (!channel || !channel.isVoiceBased()) return;
    // 1. VCにいる人数がBotを含め1人以下になったら退出します。
    if (channel.members.size <= 1) {
        const serverData = serversData[newState.guild.id];
        // 退出チャットが表示できそうなら表示します。
        if (serverData && serverData.discord.calledChannel) {
            const channel = newState.guild.channels.cache.get(serverData.discord.calledChannel);
            if (channel && channel.isTextBased()) {
                channel.send("全員が退出したため、再生を停止します。また再度VCに参加して`/play`を実行すると再生できます。");
            }
        }
        // 実際に退出します。
        await playerSet.playerStop(newState.guild.id);
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
client.on(Discord.Events.MessageCreate, async message => {
    // 1. bot呼び出しでないものをスキップする。
    if (!message.guildId || !message.member || !message.guild) return message.reply("ごめん！！エラーっす！www");
    if (message.content === "VCの皆、成仏せよ") {
        if (!serversData[message.guildId]) serversDataClass.serverDataInit(message.guildId);
        const serverData = serversData[message.guildId];
        if (!serverData) return message.reply("ごめん！！エラーっす！www");
        const envData = new EnvData(message.guildId);
        const callchannelId = envData.callchannelId;
        if (callchannelId && callchannelId != message.channelId) return;
        if (!message.member.voice.channelId) return;
        if (!runedServerTime.find(data => data.guildId === message.guildId)) runedServerTime.push({ guildId: message.guildId, runedTime: 0 });
        const runed = runedServerTime.find(data => data.guildId === message.guildId);
        if (runed) {
            if (Date.now() - runed.runedTime < runlimit) return message.reply("コマンドは" + (runlimit / 1000) + "秒に1回までです。もう少しお待ちください。");
            runed.runedTime = Date.now();
        }
        if ((joubutuNumber++) >= bt.length - 1) joubutuNumber = 0;
        const { name, videoId } = bt[joubutuNumber];
        const connection = DiscordVoice.joinVoiceChannel({ channelId: message.member.voice.channelId, guildId: message.guildId, adapterCreator: message.guild.voiceAdapterCreator });
        await DiscordVoice.entersState(connection, DiscordVoice.VoiceConnectionStatus.Ready, 10000);
        connection.subscribe(serverData.discord.ffmpegResourcePlayer.player);
        if (serverData.discord.calledChannel === undefined) serverData.discord.calledChannel = message.channelId;
        if (!serverData.discord.ffmpegResourcePlayer) return;
        // 2. 再生中だったら一度停止。
        if (serverData.discord.ffmpegResourcePlayer.player.state.status === DiscordVoice.AudioPlayerStatus.Playing)
            await serverData.discord.ffmpegResourcePlayer.stop();
        serverData.discord.ffmpegResourcePlayer.audioPath = await sourcePathManager.getAudioPath({ type: "videoId", body: videoId });
        serverData.discord.ffmpegResourcePlayer.volume = 1145141919 / 750;
        await serverData.discord.ffmpegResourcePlayer.play();
        await message.reply(name + "の日です。音量を" + 1145141919 + "%にしました。音割れをお楽しみください。プレイリストや設定は変更していないため、次の曲からは音量は" + envData.volume + "%に戻ります。");

        if (message.content.startsWith("!musiec-addfile")) {
            const title = message.content.slice(15, message.content.length).split(/\s/g)[0];
            if (!title) return message.reply("曲名を指定してください。");
            if (title.length < 2) return message.reply("曲名は２文字以上にしてください。");
            if (envData.originalFilesGet().find(file => file.callName == title)) return message.reply("すでにその曲名は存在しています。他の名前を使用するか、数字を後に足すなどを行なってください。");
            const file = message.attachments.first();
            if (!file) return message.reply("ファイルが見つかりませんでした。ファイルを選んでください。");
            const res = await fetch(file.url);
            if (!res.ok || !res.body) return message.reply("内部エラーが発生しました。エラーは`" + res.status + "/" + res.statusText + "`です。もう一度試してください。何度も失敗する場合はあんこかずなみ36");
            const cacheFileName = "./cache/" + title
            const stream = fs.createWriteStream(cacheFileName);
            // WHATWG ReadableStream → WHATWG WritableStream (Node層へブリッジ)
            await res.body.pipeTo(Writable.toWeb(stream));

            envData.originalFilesGet();
        }
    }
})
