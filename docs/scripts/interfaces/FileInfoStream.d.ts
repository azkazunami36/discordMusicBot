export interface FileInfoStream {
    /** GridFSに保存されているファイル名です。 */
    originalfilename?: string;
    /** 非圧縮で変換したものです。 */
    flacfilename?: string;
    /** 圧縮で変換したものです。 */
    aacfilename?: string;
}
