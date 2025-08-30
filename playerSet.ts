import * as DiscordVoice from "@discordjs/voice";

import { envJSON } from "./envJSON.js";
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
        const playlist = envJSON(guildId, "playlist");
        if (!playlist) return;
        const playlistJSON: string[] = JSON.parse(playlist);
        if (!serverData.discord.ffmpegResourcePlayer) return;
        // 2. 再生中だったら一度停止。
        if (serverData.discord.ffmpegResourcePlayer.player.state.status === DiscordVoice.AudioPlayerStatus.Playing)
            await serverData.discord.ffmpegResourcePlayer.stop();
        serverData.discord.ffmpegResourcePlayer.audioPath = "./cache/" + await sourcePathManager.getAudioPath(playlistJSON[0], statuscall);
        const volume = envJSON(guildId, "volume");
        serverData.discord.ffmpegResourcePlayer.volume = (volume ? Number(volume) : 100) / 750;
        serverData.discord.ffmpegResourcePlayer.guildId = guildId;
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
