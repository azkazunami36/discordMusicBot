/**
 * JWTヘッダー
 */
export interface AppleMusicJWTHeader {
    /** トークンの種類 (通常は "JWT") */
    typ: string;

    /** 署名アルゴリズム (例: ES256) */
    alg: string;

    /** 使用されたキーID */
    kid: string;
}

/**
 * JWTペイロード
 */
export interface AppleMusicJWTPayload {
    /** 発行者 */
    iss: string;

    /** 発行日時 (Unix秒) */
    iat: number;

    /** 有効期限 (Unix秒) */
    exp: number;

    /** 許可されたHTTPSオリジン */
    root_https_origin: string[];
}

/**
 * JWT解析結果
 */
export interface AppleMusicJWT {
    /** JWTヘッダー */
    header: AppleMusicJWTHeader;

    /** JWTペイロード */
    payload: AppleMusicJWTPayload;

    /** JWT署名(Base64URL) */
    signature: string;
}
/**
 * Apple Music Catalog API レスポンス
 */
export interface AppleMusicCatalogSongsResponse {
    /** 取得できた曲一覧（idsの順番に対応） */
    data: AppleMusicSong[];
}

/**
 * 曲情報
 */
export interface AppleMusicSong {
    /** 曲ID */
    id: string;

    /** リソース種類（通常 "songs"） */
    type: "songs";

    /** API内のURL */
    href: string;

    /** 曲属性 */
    attributes: AppleMusicSongAttributes;

    /** 関連リソース */
    relationships: AppleMusicSongRelationships;
}

/**
 * 曲属性
 */
export interface AppleMusicSongAttributes {
    /** アルバム名 */
    albumName: string;

    /** アーティスト名 */
    artistName: string;

    /** ジャケット画像 */
    artwork: AppleMusicArtwork;

    /** 作曲者 */
    composerName: string;

    /** ディスク番号 */
    discNumber: number;

    /** 曲長(ms) */
    durationInMillis: number;

    /** ジャンル一覧 */
    genreNames: string[];

    /** 歌詞の有無 */
    hasLyrics: boolean;

    /** Apple Digital Masterか */
    isAppleDigitalMaster: boolean;

    /** ISRC */
    isrc: string;

    /** 曲名 */
    name: string;

    /** 再生パラメータ */
    playParams: AppleMusicPlayParams;

    /** プレビュー音源 */
    previews: AppleMusicPreview[];

    /** リリース日 */
    releaseDate: string;

    /** トラック番号 */
    trackNumber: number;

    /** Apple Music URL */
    url: string;
}

/**
 * ジャケット画像
 */
export interface AppleMusicArtwork {
    bgColor: string;
    height: number;
    textColor1: string;
    textColor2: string;
    textColor3: string;
    textColor4: string;
    url: string;
    width: number;
}

/**
 * 再生情報
 */
export interface AppleMusicPlayParams {
    id: string;
    kind: "song";
}

/**
 * プレビュー音源
 */
export interface AppleMusicPreview {
    url: string;
}

/**
 * 関連情報
 */
export interface AppleMusicSongRelationships {
    albums: AppleMusicRelationship<"albums">;
    artists: AppleMusicRelationship<"artists">;
}

/**
 * 関連リソース
 */
export interface AppleMusicRelationship<T extends string> {
    href: string;
    data: AppleMusicRelationshipItem<T>[];
}

/**
 * 関連リソース1件
 */
export interface AppleMusicRelationshipItem<T extends string> {
    id: string;
    type: T;
    href: string;
}

export class AppleMusicInfo {
    static async jwtGet() {
        const html = await fetch("https://music.apple.com/")
            .then(r => r.text())
            .catch(() => undefined);

        if (!html) return undefined;

        const jsPath = html.match(/\/assets\/index~[^"]+\.js/)?.[0];
        if (!jsPath) return undefined;

        const js = await fetch(`https://music.apple.com${jsPath}`)
            .then(r => r.text())
            .catch(() => undefined);

        if (!js) return undefined;

        return js.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
    }
    static jwtInfo(jwt: string) {
        try {
            const parts = jwt.split(".");

            if (parts.length !== 3) {
                return undefined;
            }

            const decode = (value: string): unknown => {
                value = value.replace(/-/g, "+").replace(/_/g, "/");

                while (value.length % 4 !== 0) {
                    value += "=";
                }

                return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
            };

            const header = decode(parts[0]) as AppleMusicJWTHeader;
            const payload = decode(parts[1]) as AppleMusicJWTPayload;

            if (
                typeof header.typ !== "string" ||
                typeof header.alg !== "string" ||
                typeof header.kid !== "string"
            ) {
                return undefined;
            }

            if (
                typeof payload.iss !== "string" ||
                typeof payload.iat !== "number" ||
                typeof payload.exp !== "number" ||
                !Array.isArray(payload.root_https_origin) ||
                !payload.root_https_origin.every(v => typeof v === "string")
            ) {
                return undefined;
            }

            return {
                header,
                payload,
                signature: parts[2]
            };
        } catch {
            return undefined;
        }
    }
    static async getSongInfo(
        developerToken: string,
        songIds: string[]
    ): Promise<AppleMusicSong[] | undefined> {
        try {
            if (songIds.length === 0) {
                return [];
            }

            const response = await fetch(
                `https://api.music.apple.com/v1/catalog/jp/songs?ids=${encodeURIComponent(songIds.join(","))}`,
                {
                    headers: {
                        Authorization: `Bearer ${developerToken}`,
                        Origin: "https://music.apple.com",
                        Accept: "application/json",
                    },
                }
            );

            if (!response.ok) {
                return undefined;
            }

            const json =
                (await response.json()) as AppleMusicCatalogSongsResponse;

            return json.data;
        } catch {
            return undefined;
        }
    }
}
