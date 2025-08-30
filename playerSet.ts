import * as DiscordVoice from "@discordjs/voice";

import { envJSON } from "./envJSON.js";
import { sourcePathManager } from "./sourcePathManager.js";
import { ServersData } from "./interface.js";

export class PlayerSet {
    serversData: ServersData;
    constructor(serversData: ServersData) {
        this.serversData = serversData;
        this.playerSetAndPlay = this.playerSetAndPlay.bind(this);
        this.playerStop = this.playerStop.bind(this);
    }
    /** 
     * 再生を開始します。もしすでに再生中なら次の曲にいきます。再生不可の時は無音でスキップします。
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
        // 2. 再生中だったら再生種類の状態によって曲を変更する。
        if (serverData.discord.resource) {
            const playType = Number(envJSON(guildId, "playType"));
            if (playType !== undefined && playType > 1 && playType < 3) {
                switch (playType) {
                    case 1: {
                        playlistJSON.shift();
                        envJSON(guildId, "playlist", JSON.stringify(playlistJSON));
                        break;
                    }
                    case 2: {
                        const videoId = playlistJSON.shift();
                        if (videoId) playlistJSON.push(videoId);
                        envJSON(guildId, "playlist", JSON.stringify(playlistJSON));
                        break;
                    }
                    case 3: {
                        break;
                    }
                }
            } else {
                playlistJSON.shift();
                envJSON(guildId, "playlist", JSON.stringify(playlistJSON));
            }
        }
        if (playlistJSON[0] === undefined) return;
        serverData.discord.resource = DiscordVoice.createAudioResource("./cache/" + await sourcePathManager.getAudioPath(playlistJSON[0], statuscall), {
            inlineVolume: true
        });
        const volume = envJSON(guildId, "volume");
        serverData.discord.resource.volume?.setVolume((volume ? Number(volume) : 100) / 750);
        serverData.discord.player.play(serverData.discord.resource);
    }
    /**
     * 再生を停止します。
     */
    async playerStop(guildId: string) {
        const serverData = this.serversData[guildId];
        if (!serverData) return;
        const connection = DiscordVoice.getVoiceConnection(guildId);
        if (!connection) return;
        serverData.discord.player.pause();
        connection.destroy();
        serverData.discord.resource = undefined;
        serverData.discord.calledChannel = undefined;
    }

}
