import { niconicoInfo, SoundCloudInfo, TwitterInfo, YouTubeInfo } from "./worker/infoGetHelper.js";
import { MusicBrainzRecordingInfo, MusicBrainzReleaseInfo } from "./worker/infoGetWorker.js";

/**
 * 音声データの情報です。
 */
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

export interface InfoDataTemplate<T> {
    id: string;
    videoInfo: T;
    sourceInfo: SourceInfo;
    musicBrainz: {
        releaseUuid?: string;
        recordingUuid?: string;
    };
}

export interface MultiInfoDataTemplate<T> {
    id: string;
    videoInfos: T[];
    sourceInfos: SourceInfo[];
    musicBrainzs: {
        releaseUuid?: string;
        recordingUuid?: string;
    }[];
}

export type YouTubeInfoData = InfoDataTemplate<YouTubeInfo>;

export type niconicoInfoData = InfoDataTemplate<niconicoInfo>;

export type TwitterInfoData = MultiInfoDataTemplate<TwitterInfo>;

export type SoundCloudInfoData = InfoDataTemplate<SoundCloudInfo>;

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


/**
 * Discordサーバー固有の設定です。Discordサーバーからセッションを開始する場合にここから復元されます。
 */
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

//
// ここからした制作中
//

interface NewMusicLibraryJSON {
    /** 全ての音楽の情報が入っています。 */
    musics: MusicInfo[];
}

interface MusicInfo {
    type: "MusicInfo";
    /** 連番ID */
    musicId: number;
    title: string;
    /** アーティストは稀に複数いる上に、役割がある */
    artists: Artists[];
    lyrics: Lyrics;
    melody: Melody;
    mbInfos: MBInfo[];
    /** この曲がデフォルトで指定するアルバム。ない場合はunknownなどのバグが起きうるが、整合性チェック時に書き込まれるか、手動で修正可能 */
    mainAlbum?: MusicLinker;
    // ...
    /** ソースリストからデフォルトで採用する音源を選択する */
    mainSourceNumber: number;
    sourceList: {
        /** ソース識別はコメントで。改行すると詳細を記述できる。１行目は長過ぎると端折られる。 */
        comment: string;
        /** 取得方法です。末尾が「Music」以外の場合、編集不可能です。また、基本的にsourceがメインです(例外ができれば追記予定)。 */
        importType: "youtube" | "niconico" | "soundcloud" | "twitter" | "singleMusic" | "trackMusic";
        source: SourceFileGroup[];
        track: {
            name: string;
            /** トラックが例えばアーティスト毎に分割できる場合、それぞれのトラックのアーティスト情報を書き込みます。 */
            artists: Artists[];
            type: "vocal" | "piano" | "guitar" | "bass" | "drum" | "other";
            source: SourceFileGroup[];
        }[];
    }[];
    /** その他アルバムに関する情報 */
    otherInfo: {
        /** Markdown形式ブログを制作可能。みはるブログと同じパース方法を利用する */
        wikiText: string;
        /** カバー元の曲 */
        coverOriginalMusicId?: MusicLinker;
        /** リミックス元の曲 */
        remixOriginalMusicId?: MusicLinker;
    };
}

interface MusicLinker { // 曲やアルバムに対してのリンクに最適。必要な項目が不足するとリンクが無効となる。
    type: "MusicLinker";
    musicId?: number;
    albumId?: number;
    artistId?: number;
}

interface Artists { // 複数アーティストのそれぞれの役割を区別するためのもの
    type: "Artists";
    artist: Artist;
    // 他にもアーティストの役割などの情報を記録する
}

interface Artist {
    type: "Artist";
    /** 連番ID */
    artistId: number;
    // 未定義
}

/** 
 * 歌詞データです。GUIで作成する前提です。
 * 
 * 歌詞自体には特にBPMの設定の必要はありません。単純記憶で問題ありません。speedやstartTimeなどでタイミングを調整するものです。
 */
interface Lyrics {
    type: "Lyrics";
    /** もし歌詞にアーティストが指定できる場合、指定します。 */
    artists: Artist[];
    /** 行テキストです。 */
    rows: {
        /** 曲のミリ秒と同期させます。 */
        time: number;
        /** この行が有効な期間です。 */
        viewTime: number;
        /** 
         * 区切られたテキストです。ひらがななどと漢字・記号などが分割されて入力されます。
         * 
         * 漢字を有効にしたい場合はルビが必須です。また、その要領で記号も読ませられます。
         */
        texts: {
            text: string;
            /** 
             * 有効な場合、テキストの中はa-z,A-Z,あ-ん,ア-ン,0-9のみが入ります。
             * 
             * 無効な場合、様々な記号などを入れることができます。
             */
            valid: boolean;
            /** ルビです。テキストの文字数がこれで上書きされます。あ-んのみが入ります。 */
            readText?: string;
        }[];
        /**
         * これは行の開始から特定の秒数が経過するまでの間にどれだけ進めるかを連続で管理します。
         * 
         * `nextTo`が0だと歌詞の進行を一時中断できます。
         * 
         * また、validがtrueの歌詞のみがなぞられます。
         */
        textTraceTimestamp: {
            /** もし前回の文字移動からそのミリ秒経過したら */
            time: number;
            /** この文字数進んだことにする */
            nextTo: number;
        }[];
        /** アーティストの番号です。これはartistsの配列番号を指定します。 */
        artistNumber: number[];
        /** 歌詞を小さく写すかどうかです。また、このエリアを明記することで歌い手はこのエリアを歌うかどうか選択可能になります(コーラスなどに最適)。 */
        lowVolume: boolean;
    }[];
}

interface Melody {
    type: "Melody";
    // 未定義
}

interface MBInfo { // MusicBrainzの頭文字
    type: "MBInfo";
    // 未定義
}

/** ノーマル再生用ソースです。配列は離れた音声イメージである場合に使われます。startTimeでソートされます。 */
interface SourceFileGroup {
    type: "SourceFileGroup";
    startTime: number;
    /** もしも存在する場合実時間。新しい音声が取得された場合に同期するために使う可能性がある。必要ないかもしれないけど */
    timeStamp?: number;
    /** ミリ秒の長さです。 */
    length: number;
    /** 相対パスが入ります。通常相対パスで運用します。 */
    path: string;
}
