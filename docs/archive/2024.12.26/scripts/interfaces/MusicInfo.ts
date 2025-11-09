import { BaseInfo } from "./BaseInfo.js";
import { InfoInArtist } from "./InfoInArtist.js";

export interface MusicInfo extends BaseInfo {
    _id?: string;
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
        filelist?: {
            filename?: string;
            filetypename?: string;
            filetype?: "default" | "instrumental" | "vocalonly";
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
    /** 作成日 */
    createdate?: string;
    /** 編集日 */
    updatedate?: string;
}
