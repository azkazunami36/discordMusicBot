import * as DiscordVoice from "@discordjs/voice";
import { videoCache } from "./videoMetaCache.js";
import { ServersDataClass } from "./serversData.js";
import { PlayerSet } from "./playerSet.js";
import { FfmpegResourcePlayer } from "./ffmpegResourcePlayer.js";

export interface ServersData {
    [guildId: string]: {
        discord: {
            calledChannel?: string;
            ffmpegResourcePlayer: FfmpegResourcePlayer;
        }
    } | undefined;
}

export interface InteractionInputData {
    serversDataClass: ServersDataClass;
    videoCache: typeof videoCache;
    playerSet: PlayerSet;
}
