import { niconicoInfo, SoundCloudInfo, TwitterInfo, YouTubeInfo } from "./worker/infoGetHelper.js";
import { MusicBrainzRecordingInfo, MusicBrainzReleaseInfo } from "./worker/infoGetWorker.js";

export interface SourceInfo {
    /** 情報を取得した時の時刻です。 */
    infoGetTimestamp: number;
    /** 音声を取得した時の時刻です。 */
    sourceGetTimestamp: number;
    /** 実際に存在するファイル名です。拡張子の調査の必要がなくなります。fsを使用せずにファイル名を検出できるため、速度が上がります。fsを使わずにファイル名を取得したい場合に使用する物です。これを配列にしている場合、順番を保証するものがないため、matchなどを使用してファイルを特定してください。 */
    filename: string;
    size: number;
    duration?: number;
}

export interface YouTubeInfoData {
    id: string;
    videoInfo: YouTubeInfo;
    sourceInfo: SourceInfo;
    musicBrainz: {
        releaseUuid?: string;
        recordingUuid?: string;
    };
}

export interface niconicoInfoData {
    id: string;
    videoInfo: niconicoInfo;
    sourceInfo: SourceInfo;
    musicBrainz: {
        releaseUuid?: string;
        recordingUuid?: string;
    };
}

export interface TwitterInfoData {
    id: string;
    videoInfos: TwitterInfo[];
    sourceInfos: SourceInfo[];
    musicBrainzs: {
        releaseUuid?: string;
        recordingUuid?: string;
    }[];
}

export interface SoundCloudInfoData {
    id: string;
    videoInfo: SoundCloudInfo;
    sourceInfo: SourceInfo;
    musicBrainz: {
        releaseUuid?: string;
        recordingUuid?: string;
    };
}

export interface MusicLibraryJSON {
    youtube: YouTubeInfoData[];
    niconico: niconicoInfoData[];
    twitter: TwitterInfoData[];
    soundcloud: SoundCloudInfoData[];
    musicBrainzReleaseInfo: MusicBrainzReleaseInfo[];
    musicBrainzRecordingInfo: MusicBrainzRecordingInfo[];
    youtubeUserIcons: {
        id: string;
        url: string | null;
    }[];
    niconicoUserIcons: {
        id: string;
        url: string | null;
    }[];
    twitterUserIcons: {
        id: string;
        url: string | null;
    }[];
    soundcloudUserIcons: {
        id: string;
        url: string | null;
    }[];
    users: UserData[];
    servers: ServerData[];
    /** v2からデータを移行した時の情報です。 */
    v2metadata: {
        serverInfoGetTimeStamp?: number;
    }
}

export interface UserData {
    userId: string;
    updatetimems: number;
}

export interface ServerData {
    guildId: string;
    updatetimems: number;
    callchannelId?: string;
    volume?: number;
    playType?: 0 | 1 | 2;
    playlist?: ({
        type: "youtube" | "niconico" | "twitter" | "soundcloud";
        id: string;
        index?: number;
    } | undefined)[];
    changeTellIs?: boolean;
    playSpeed?: number;
    playPitch?: number;
    restartInfo?: {
        playPoint: number;
        restartCalledChannel: string;
        restartedVoiceChannel: string;
        restartedPlayIs: boolean;
    }
    reverbType?: string;
    manualStartedIs?: boolean;
    recordedAudioFileSaveChannelTo?: string;
}
