import { AudioReceiveStream, AudioReceiveStreamOptions, entersState, VoiceConnection, VoiceConnectionStatus, VoiceReceiver } from "@discordjs/voice";
import { AttachmentBuilder, Client, Events, GuildMember, SendableChannels, VoiceState } from "discord.js";
import { EnvData } from "./envJSON.js";
import { spawn } from "child_process";
import prism from "prism-media";
import fsP from "fs/promises";

function startRecording(receiver: VoiceReceiver, member: GuildMember, channel: SendableChannels) {
    const option: Partial<AudioReceiveStreamOptions> = {};
    const stream = receiver.subscribe(member.id, option);
    stream.on("error", e => { console.error("receiverStreamError", e) });
    const pcm = new prism.opus.Decoder({
        frameSize: 960,
        channels: 2,
        rate: 48000,
    });
    stream.pipe(pcm);
    pcm.on("error", e => console.error("pcm error", e));
    const ffmpeg = spawn("ffmpeg", [
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "-i", "-",
        "-c:a", "libopus",
        "-b:a", "256k",
        "-ar", "48000",
        "-ac", "1",
        "-f", "ogg",
        "-"
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const ffmpeg2 = spawn("ffmpeg", [
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "-i", "-",
        "-c:a", "libopus",
        "-b:a", "96k",
        "-ar", "48000",
        "-ac", "2",
        "voiceFolder/" + member.user.username + "-" + Date.now() + "-" + member.guild.id + "-" + member.id + ".ogg"
    ], { stdio: ["pipe", "pipe", "pipe"] });
    pcm.on("data", chunk => {
        ffmpeg.stdin.write(chunk);
        ffmpeg2.stdin.write(chunk);
    });
    let size = 0;
    let overed = false;
    let restart = false;
    ffmpeg.stdout.on("data", chunk => {
        const buf = chunk as Buffer;
        size += buf?.length ?? 0;
        if (size > 5 * 1024 * 1024) {
            if (overed) return;
            overed = true;
            stream.destroy();
            console.log("サイズが5MBを超えました。");
            restart = true;
        }
    });
    let interval: NodeJS.Timeout | undefined;
    const zerosound = Buffer.alloc(960 * 2 * 2);
    receiver.speaking.on("start", userId => {
        if (userId === member.id && interval) {
            clearInterval(interval);
            interval = undefined;
        }
    })
    receiver.speaking.on("end", userId => {
        if (userId === member.id) {
            if (interval) {
                clearInterval(interval);
                interval = undefined;
            }
            interval = setInterval(() => {
                ffmpeg.stdin.write(zerosound);
                ffmpeg2.stdin.write(zerosound);
            }, 20);
        }
    })
    const attachment = new AttachmentBuilder(ffmpeg.stdout);
    attachment.setName(member.user.username + ".ogg");
    channel.send({ files: [attachment] }).catch(e => console.error("音声ファイルの送信に失敗", e)).finally(() => {
        if (restart) startRecording(receiver, member, channel);
    });
    stream.on("end", () => { pcm.end(); console.log("stream end") });
    stream.on("close", () => { pcm.end(); console.log("stream close") });
    pcm.on("close", () => { ffmpeg.stdin.end(); ffmpeg.kill(0); ffmpeg2.stdin.end(); ffmpeg2.kill(0); console.log("pcm close") });
    pcm.on("unpipe", () => { ffmpeg.stdin.end(); ffmpeg.kill(0); ffmpeg2.stdin.end(); ffmpeg2.kill(0); console.log("pcm unpipe") });
    ffmpeg.stdout.on("end", () => { console.log("ffmpeg end"); });
    ffmpeg.on("error", e => console.error(e));
    ffmpeg2.stdout.on("end", () => { console.log("ffmpeg2 end"); });
    ffmpeg2.on("error", e => console.error(e));
    return stream;
}

export function voiceChatRecorder(guildId: string, client: Client, connection: VoiceConnection) {
    const envData = new EnvData(guildId);
    if (!envData.recordedAudioFileSaveChannelTo) return;
    (async () => {
        if (!await fsP.access("./voiceFolder", fsP.constants.R_OK).then(() => true).catch(() => false)) await fsP.mkdir("./voiceFolder");
        const guild = await client.guilds.fetch(guildId);
        const textChannel = await guild.channels.fetch(envData.recordedAudioFileSaveChannelTo);
        const voiceChannel = connection.joinConfig.channelId ? await guild.channels.fetch(connection.joinConfig.channelId) : undefined;
        const me = client.user?.id ? await guild.members.fetch(client.user.id) : undefined;
        if (!voiceChannel || !voiceChannel.isVoiceBased() || !textChannel || !textChannel.isTextBased() || !me) return;
        connection.rejoin({
            channelId: voiceChannel.id,
            selfDeaf: false,
            selfMute: false
        });
        await entersState(connection, VoiceConnectionStatus.Ready, 10000);
        const joined: { [userId: string]: AudioReceiveStream } = {};
        const receiver = connection.receiver;
        for (const [, member] of voiceChannel.members) {
            if (member.user.bot || joined[member.id]) continue;
            joined[member.id] = startRecording(receiver, member, textChannel);
        }
        function voiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
            const joinMember = oldState.channelId === null && newState.channelId !== null ? newState.member : undefined;
            const leaveMember = oldState.channelId !== null && newState.channelId === null ? newState.member : undefined;
            if (joinMember && !joinMember.user.bot && textChannel?.isTextBased() && !joined[joinMember.id]) {
                joined[joinMember.id] = startRecording(receiver, joinMember, textChannel);
            }
            if (leaveMember && !leaveMember.user.bot && textChannel?.isTextBased() && joined[leaveMember.id]) {
                joined[leaveMember.id].destroy();
                delete joined[leaveMember.id];
            }
        }
        client.on(Events.VoiceStateUpdate, voiceStateUpdate);
        connection.on("stateChange", () => {
            if (connection.state.status === VoiceConnectionStatus.Destroyed) {
                console.log("ボイスステートアップデートは破棄");
                client.off(Events.VoiceStateUpdate, voiceStateUpdate);
            }
        });
        envData.manualStartedIs = true;
    })();
}

