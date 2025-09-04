import { ServersDataClass } from "./serversData.js";
import { Player } from "./player.js";

export interface ServersData {
    [guildId: string]: {
        discord: {
            calledChannel?: string;
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
    player: Player;
}
