import * as DiscordVoice from "@discordjs/voice";

import { EnvData } from "./envJSON.js";
import { sourcePathManager } from "./sourcePathManager.js";
import { ServersData } from "./interface.js";
import { FfmpegResourcePlayer } from "./ffmpegResourcePlayer.js";

export class PlayerSet {
    serversData: ServersData;
    constructor(serversData: ServersData) {
        this.serversData = serversData;
        this.playerSetAndPlay = this.playerSetAndPlay.bind(this);
        this.playerStop = this.playerStop.bind(this);
    }
    /** 
     * 再生を開始します。再生不可の時は無音でスキップします。
     */
    async playerSetAndPlay(guildId: string, statusCallback?: (status: "loading" | "downloading" | "formatchoosing" | "converting" | "done", body: { percent?: number; }) => void) {
        const statuscall = statusCallback || (st => { });
        const serverData = this.serversData[guildId];
        if (!serverData) return;
        const connection = DiscordVoice.getVoiceConnection(guildId);
        if (!connection) return;
        const envData = new EnvData(guildId);
        const playlist = envData.playlistGet();
        if (!serverData.discord.ffmpegResourcePlayer) return;
        // 2. 再生中だったら一度停止。
        if (serverData.discord.ffmpegResourcePlayer.player.state.status === DiscordVoice.AudioPlayerStatus.Playing)
            await serverData.discord.ffmpegResourcePlayer.stop();
        serverData.discord.ffmpegResourcePlayer.audioPath = await sourcePathManager.getAudioPath(playlist[0], statuscall);
        const volume = envData.volume;
        serverData.discord.ffmpegResourcePlayer.volume = (volume ? Number(volume) : 100) / 750;
        await serverData.discord.ffmpegResourcePlayer.play();
    }
    /**
     * 再生を停止します。
     */
    async playerStop(guildId: string) {
        const serverData = this.serversData[guildId];
        if (!serverData) return;
        const connection = DiscordVoice.getVoiceConnection(guildId);
        if (!connection) return;
        serverData.discord.calledChannel = undefined;
        await serverData.discord.ffmpegResourcePlayer.stop();
        connection.destroy();
    }

}
