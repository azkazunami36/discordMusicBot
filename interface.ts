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
        users?: {
            [userId: string]: {
                /** 曲を聴き始めた時間です。再生時間を算出するのに役立ちます。 */
                startTime?: number;
            };
        }
    } | undefined;
}

export interface InteractionInputData {
    serversDataClass: ServersDataClass;
    videoCache: typeof videoCache;
    playerSet: PlayerSet;
}
