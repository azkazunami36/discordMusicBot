import { envJSON } from "./envJSON.js";
import * as DiscordVoice from "@discordjs/voice";
import { Client } from "discord.js";

import { ServersData } from "./interface.js";
import { PlayerSet } from "./playerSet.js";

export class ServersDataClass {
    /** サーバーごとに記録する必要のある一時データです。 */
    serversData: ServersData = {};
    /** サーバー内でプレイヤーを使っている時に、曲が停止した後の処理を行います。 */
    playSet?: PlayerSet;
    private client: Client;
    constructor(client: Client) { 
        this.client = client; 
    }
    /** サーバーデータに必要なデータを定義します。 */
    serverDataInit(guildId: string) {
        this.serversData[guildId] = { discord: { player: new DiscordVoice.AudioPlayer() } };
        this.serversData[guildId]?.discord.player.on(DiscordVoice.AudioPlayerStatus.Idle, async (oldState, newState) => {
        if (this.playSet === undefined) return;
            const serverData = this.serversData[guildId];
            if (!serverData || !serverData.discord.calledChannel) return;
            const playlist = envJSON(guildId, "playlist");
            if (!playlist) return;
            const playlistJSON: string[] = JSON.parse(playlist);
            const playType = Number(envJSON(guildId, "playType"));
            if ((playType && playType === 1 && playlistJSON.length > 1) || (playType && (playType === 2 || playType === 3) && playlistJSON.length > 0)) {
                this.playSet.playerSetAndPlay(guildId);
            } else {
                const channel = this.client.guilds.cache.get(guildId)?.channels.cache.get(serverData.discord.calledChannel);
                if (channel && channel.isTextBased()) {
                    channel.send("次の曲がなかったため切断しました。また`!music タイトルまたはURL`を行ってください。");
                }
                this.playSet.playerStop(guildId);
            }
        });
    }
}


