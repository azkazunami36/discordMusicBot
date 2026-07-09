export interface Playlist {
    type: "videoId" | "originalFileId" | "nicovideoId" | "twitterId";
    body: string;
    /** IDに含まれた動画または音声が複数個ある場合指定します。 */
    number?: number;
}


type resulttype = "media" | "info" | "APIURL";
type mediaservicetype = "youtube" | "niconico" | "twitter" | "soundcloud";
type gservicetype = "url" | "noturl" | "supportedytdlp";
/** サービスタイプ */
type servicetype = mediaservicetype | "mbrelease" | "mbrecording" | gservicetype;

/**
 * dbmgrにおいてSourceManagerが返す返り値`{result, unidata}`のうちunidataにあたる、不変または共通して修正・追加される型定義です。
 */
export interface SourceManagerResultUnidata {
    /** ソースを識別するID */
    id: string;
    /** 動画トラックごとの情報。単独がメインの場合、0が必ず入っています。稀に0が入っていません。マルチの場合、複数入っています。 */
    data: {
        title?: string;
        userName?: string;
        userId?: string;
        description?: string;
        id?: string;
        audiourl?: string;
        thumbnailUrl?: string;
        userIconUrl?: string;
    }[];
    /** ダウンロード・変換・返答処理中に限り存在します。0-100です。 */
    progress?: number;
    /** 返却された情報のタイプ。動画なのか、ただのJSONデータなのかの識別です。 */
    resulttype: resulttype;
    /** サービスタイプ */
    servicetype: servicetype;
    /** メタデータです。各環境で好きなように使ってください。少なくともAPIではこれは帰ってきません。 */
    metadata?: any;
};
