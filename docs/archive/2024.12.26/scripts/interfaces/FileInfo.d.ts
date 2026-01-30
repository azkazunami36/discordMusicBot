import { FFmpeg } from "./FFmpeg.js";
import { FileInfoStream } from "./FileInfoStream.js";
export interface FileInfo {
    /** ユーザーに表示されるファイル名です。実際のGridFSに保存されているファイル名ではありません。 */
    filename?: string;
    /** GridFSに保存されているファイル名です。かつ、ユーザーから受け取り、何も変更を加えられていないファイルです。 */
    originalfilename?: string;
    info?: {};
    /** 変更を加える前に取得したFFmpeg情報です。 */
    ffmpeginfo?: FFmpeg.FfprobeStream[];
    /** このファイルの主なファイル分類です。あくまで参考程度です。 */
    type?: "video" | "audio" | "image" | "other";
    /** このファイルのグローバルなメタデータです。 */
    ffmpegmetadata?: {
        [metaname: string]: string;
    };
    /** このファイルのストリーム・チャプター毎のメタデータです。 */
    ffmpegsectionmetadata?: {
        [metaname: string]: string;
    }[];
    /** 変更を加える前に取得したメタデータの生情報です。 */
    ffmpegmetadataoriginal?: string;
    /** ストリーム毎の情報です。 */
    streams?: FileInfoStream[];
    ffmpegdetection?: "no" | "yes";
}
