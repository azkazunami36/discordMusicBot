/**
 * ユーザーマネージャー
 * 
 * ユーザーIDは連番、クライアント識別はセッションIDを用います。
 * 
 * ログインAPIの設計や挙動を司ります。通常外部利用したい場合はREST APIを使用します。
 */

interface UserLoginData {
    /** 連番です。内部で利用するものです。 */
    id: number;
    /** ユーザーがログインに使用する識別IDです。 */
    userId: string;
    /** アカウント名です。 */
    name?: string;
    /** DiscordのユーザーIDです。 */
    discordUserId?: string;
    /** メールアドレスです。 */
    email?: string;
    /** アカウントが削除されたものかどうかです。 */
    deleted?: boolean;
    /** パスワード情報です。 */
    passwordHash?: string;
    /** 復元に必要なコードのハッシュです。ショート版で、復元を開始するための鍵です。 */
    repairShortCodeHash?: string;
    /** 復元に必要なコードのハッシュです。ロング版で、実際にアカウントに変更を行うことができるキーです。 */
    repairLongCodeHash?: string;
    /** パスキーの公開鍵が入ると予測されます(パスキーの仕組みをまだ理解してない) */
    passKey?: string;
    /**
     * ログインセッションです。ログインという行為を行うとIDは作成されます。
     * 
     * 以前のセッションIDを使ってログインをすると新しいIDが発行され、過去のIDが削除されます。その際にデバイス識別の一部データが引き継がれます。
     */
    sessions: {
        /** base64で文字の長さ64文字のランダムIDです。userIdとsessionIdが一致した時に限り利用可能です。 */
        sessionId: string;
        /** セッション情報をユーザーが識別するための情報です。 */
        info: {
            /** ユーザーがつけた名前 */
            name?: string;
            /** セッションIDが失効しても、デバイスIDが一致するとセッション識別情報を引き継ぎます。 */
            deviceId?: string;
            userAgent?: string;
        }
        /** 作成された日です。UTCのmtimeを/86400000しfloorしたた数字が入ります。 */
        createdDay: number;
        /** 最後にログインされた日です。UTCのmtimeを/86400000しfloorした数字が入ります。 */
        lastLoginDay: number;
    }[];
}

class UserManager {
    users: UserLoginData[] = [];
    cache: {
        userIds: Map<string, number>;
    } = {
            userIds: new Map()
        }
    /**
     * ユーザーを作成します。制約が存在します。
     * - 同じユーザーIDはNG
     * - セキュリティ解決方法が１つ以上必要
     * - メールアドレス、Googleで続行などの別のアカウントを所有している必要がある(不正にアカウントを大量生成しないように)
     *   - すでにそのアカウントの有効性が確かめられているものを入力する。もしかしたら有効性を内部で調査するロジックがつくられるかも。
     */
    createUser(userId: string, account: { email?: string; discordUserId?: string; }, cert: { passwordHash?: string; passKey?: string; }) {
        if (this.cache.userIds.has(userId)) return false;
        if (!cert.passKey && !cert.passwordHash) return false;
        const id = this.users.length;
        this.users[id] = { id, userId, sessions: [], ...cert };
        this.cache.userIds.set(userId, id);
        return true;
    }
}
