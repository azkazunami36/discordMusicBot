import { BaseInfo } from "./BaseInfo.js";
import { InfoInArtist } from "./InfoInArtist.js";
export interface MusicInfo extends BaseInfo {
    /** 曲を識別するUUID */
    musicuuid?: string;
    /** アーティスト一覧 */
    artists?: InfoInArtist[];
    /** リミックス元の曲のUUID */
    remixoriginaluuid?: string;
    /** カバー元の曲のUUID */
    coveroriginaluuid?: string;
    /** ミュージック写真 */
    musicpictures?: {
        languagetype?: string;
        filename?: string;
        main?: boolean;
    }[];
    /** ミュージック情報 */
    infos?: {
        languagetype?: string;
        musicname?: string;
        musicnamereadchar?: {
            languagetype?: string;
        }[];
    }[];
    /** 音声 */
    sounds?: {
        languagetype?: string;
        /** ファイルのデフォルトストリーム */
        defaultstream?: number;
        /** ファイルリスト */
        filelist?: {
            /** ファイル名 */
            filename?: string;
            /** ファイルタイプ */
            filetype?: "default" | "instrumental" | "vocalonly";
            /** 遅延 */
            timediff?: number;
        }[];
        lyrics?: {
            text?: string;
            startTime?: number;
            endTime?: number;
            timepertext?: {
                length?: number;
                time?: number;
            }[];
        };
    }[];
    /** デフォルトの音声 */
    defaultsound?: number;
    /** 作成日 */
    createdate?: string;
    /** 編集日 */
    updatedate?: string;
}
