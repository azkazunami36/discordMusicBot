import mysql from "mysql2/promise";
import { DBmgrAPI, Unidata } from "./dbmgrAPI.js";

interface ServerInfoRowDataPacket extends mysql.RowDataPacket, ServerInfo { };

interface ServerInfo {
    id: number;
    guildId: string;
    volume: number;
    tempo: number;
    pitch: number;
    changeTellIs: 0 | 1;
    repeatType: 0 | 1 | 2;
    callChannelId: string | null;
    restartPlayIs: 0 | 1;
    restartCallChannel: string;
    restartVoiceChId: string;
    queueAutoReset: 0 | 1;
    eqAutoReset: 0 | 1;
    playingNumber: number;
    playingMediaId: string | null;
    playingMediaType: ServiceTypeT | null;
    playingObjectNumber: number | null;
    searchTime: Date;
}

interface CountRowDataPacket extends mysql.RowDataPacket, CountRow { };

interface CountRow {
    count: number;
}

const ServiceType = ["youtube", "niconico", "twitter", "soundcloud"] as const;
type ServiceTypeT = typeof ServiceType[number];

export function serviceTypeCheck(str: string): str is ServiceTypeT {
    return ServiceType.includes(str as never);
}

export class ServerInfoAPI {
    #guildId: string;
    #db: mysql.Pool;
    id?: number;
    constructor(guildId: string, db: mysql.Pool) {
        this.#guildId = guildId;
        this.#db = db;
    }
    get db() { return this.#db }
    /** 
     * トランザクションを開始します。
     * 
     * エラーが発生するとこの関数からエラーが出るため、キャッチしてください。
     * 
     * returnを利用すると中身を簡単に取り出せます。オブジェクトで返し
     * ```ts
     * const { data1, data2 } = transaction(async connection => {
     *     return { data1, data2 };
     * });
     * ```
     * 
     * のように書くことも可能です。型保管は自動です。
     */
    async transaction<T>(call: (connection: mysql.PoolConnection) => Promise<T>) {
        const connection = await this.db.getConnection();
        await connection.beginTransaction();
        let result: T | undefined;
        let err;
        try {
            result = await call(connection);
            await connection.commit();
        } catch (e) {
            await connection.rollback();
            err = e;
        }
        connection.release();
        if (err !== undefined) throw err;
        return result as T;
    }
    async transactionCatched<T, U>(call: (connection: mysql.PoolConnection) => Promise<T>, errorFunc?: (e: any) => U) {
        try {
            return await this.transaction(call);
        } catch (e) {
            try { return errorFunc?.(e) } catch {}
        }
    }
    async connectionStart() {
        const connection = await this.db.getConnection();
        await connection.beginTransaction();
        return connection;
    }
    async connectionEnd(connection: mysql.PoolConnection) {
        await connection.commit();
        connection.release();
    }
    async #serverInfoGet(connection: mysql.PoolConnection, str: string | number, type: "id" | "guildId") {
        const [result] = await connection.query<ServerInfoRowDataPacket[]>(`
            SELECT *
            FROM serverInfo
            WHERE ${type} = ?
            `, [str]);
        return result;
    }
    async idGet(connection: mysql.PoolConnection): Promise<number> {
        const result = await this.#serverInfoGet(connection, this.#guildId, "guildId");
        if (result[0] === undefined) {
            await connection.query<ServerInfoRowDataPacket[]>(`
            INSERT INTO serverInfo (
                guildId
            ) VALUES (?)
            `, [this.#guildId]);
            const result = await this.#serverInfoGet(connection, this.#guildId, "guildId");
            if (result[0] === undefined) throw new Error("何でえ？");
            return result[0].id;
        }
        return result[0].id;
    }
    async infoGet<T extends keyof ServerInfo>(connection: mysql.PoolConnection, ...keys: T[]): Promise<Pick<ServerInfo, T>> {
        if (this.id === undefined) this.id = await this.idGet(connection);
        return (await this.#serverInfoGet(connection, this.id, "id"))[0];
    }
    async dataSet<T extends keyof ServerInfo>(connection: mysql.PoolConnection, prop: T, data: ServerInfo[T]) {
        if (this.id === undefined) this.id = await this.idGet(connection);
        await connection.query(`
            UPDATE serverInfo
            SET ${prop} = ?
            WHERE id = ?
            `, [data, this.id]
        )
    }
    async volume(connection: mysql.PoolConnection): Promise<number>;
    async volume(connection: mysql.PoolConnection, vol: number): Promise<undefined>;
    async volume(connection: mysql.PoolConnection, vol?: number) {
        const name = "volume";
        if (vol === undefined) return (await this.infoGet(connection, name)).volume;
        else await this.dataSet(connection, name, Math.min(Math.max(vol, 0), 4294967294));
    }
    async tempo(connection: mysql.PoolConnection): Promise<number>;
    async tempo(connection: mysql.PoolConnection, vol: number): Promise<undefined>;
    async tempo(connection: mysql.PoolConnection, vol?: number) {
        const name = "tempo";
        if (vol === undefined) return (await this.infoGet(connection, name)).tempo;
        else await this.dataSet(connection, name, Math.min(Math.max(vol, 0), 2147483647));
    }
    async pitch(connection: mysql.PoolConnection): Promise<number>;
    async pitch(connection: mysql.PoolConnection, vol: number): Promise<undefined>;
    async pitch(connection: mysql.PoolConnection, vol?: number) {
        const name = "pitch";
        if (vol === undefined) return (await this.infoGet(connection, name)).pitch;
        else await this.dataSet(connection, name, Math.min(Math.max(vol, 0), 2147483647));
    }
    async repeatType(connection: mysql.PoolConnection): Promise<0 | 1 | 2>;
    async repeatType(connection: mysql.PoolConnection, vol: 0 | 1 | 2): Promise<undefined>;
    async repeatType(connection: mysql.PoolConnection, vol?: 0 | 1 | 2) {
        const name = "repeatType";
        if (vol === undefined) return (await this.infoGet(connection, name)).repeatType;
        else await this.dataSet(connection, name, vol);
    }
    async eqAutoReset(connection: mysql.PoolConnection): Promise<0 | 1>;
    async eqAutoReset(connection: mysql.PoolConnection, vol: 0 | 1): Promise<undefined>;
    async eqAutoReset(connection: mysql.PoolConnection, vol?: 0 | 1) {
        const name = "eqAutoReset";
        if (vol === undefined) return (await this.infoGet(connection, name)).eqAutoReset;
        else await this.dataSet(connection, name, vol);
    }
    async queueAutoReset(connection: mysql.PoolConnection,): Promise<0 | 1>;
    async queueAutoReset(connection: mysql.PoolConnection, vol: 0 | 1): Promise<undefined>;
    async queueAutoReset(connection: mysql.PoolConnection, vol?: 0 | 1) {
        const name = "queueAutoReset";
        if (vol === undefined) return (await this.infoGet(connection, name)).queueAutoReset;
        else await this.dataSet(connection, name, vol);
    }
    async changeTellIs(connection: mysql.PoolConnection,): Promise<0 | 1>;
    async changeTellIs(connection: mysql.PoolConnection, vol: 0 | 1): Promise<undefined>;
    async changeTellIs(connection: mysql.PoolConnection, vol?: 0 | 1) {
        const name = "changeTellIs";
        if (vol === undefined) return (await this.infoGet(connection, name)).changeTellIs;
        else await this.dataSet(connection, name, vol);
    }
    playlist = new Playlist(this);
    searchList = new SearchList(this);
}

interface ServerPlaylistRowDataPacket extends mysql.RowDataPacket, ServerPlaylist { };

interface ServerPlaylist {
    id: number;
    number: number;
    mediaId: string;
    mediaType: string;
    objectNumber: number;
}

class Playlist {
    #serverInfo: ServerInfoAPI;
    #dbmgrAPI: DBmgrAPI;
    constructor(serverInfo: ServerInfoAPI) {
        this.#serverInfo = serverInfo;
        this.#dbmgrAPI = new DBmgrAPI();
    }
    /**
     * プレイリストを取得します。重要な挙動として、UnidataMediaとして返します。
     * 
     * 番号指定がないと0番目から表示されます。lengthで受け取る数を変えられます。0ですべて取得します。
     * 
     * 必ずnumberを起点に始まります。3から5つ取得したら、1番目の曲は4番目となります。
     * 
     * 配列が返ってこないことがあります。その場合、取得エラーです。
     * 
     * 取得時、修復が走ることがあります。その際、通常より取得に時間がかかります。以下の場合、取得に遅延が発生します。
     * - Unidataに変換できないデータ(mediaId, mediaType, objectNumberが無効、dbmgrに存在しない動画となったか破損した等)
     * - プレイリスト連番の整合性が取れない場合
     *      - 複数個取得した場合に空白がある(dbmgrの要因または連番エラー)
     *      - 一件の場合でも目的のデータが連番と異なる場合(目標のデータがたまたま存在しない連番エラー)
     *      - なぜかcountより大きな連番が存在する(連番エラーな上に連番全修正)
     */
    async playlistGet(connection: mysql.PoolConnection, number: number = 0, length: number = 5): Promise<Unidata<{}>[] | undefined> {
        if (this.#serverInfo.id === undefined) this.#serverInfo.id = await this.#serverInfo.idGet(connection);
        const [result] = await connection.query<ServerPlaylistRowDataPacket[]>(
            `
            SELECT *
            FROM serverPlaylist
            WHERE id = ?${length >= 0 ? (" AND number >= " + number) : ""}
            ORDER BY number ASC
            ${length !== 0 ? "LIMIT " + length : ""}
            `, [this.#serverInfo.id]
        );
        const unidatas: (Unidata<{ number: number; }>)[] = [];
        for (const res of result) {
            const serviceType = res.mediaType;
            if (!serviceTypeCheck(serviceType)) continue;
            const unidata = this.#dbmgrAPI.createUnidata<{ number: number; }>(res.mediaId, serviceType, res.objectNumber, { number: res.number });
            unidatas.push(unidata);
        }
        // 存在しない区間のチェック
        let oldNumber;
        const deletePl: {
            position: number;
            length: number;
        }[] = [];
        for (const unidata of unidatas) {
            if (oldNumber === undefined) {
                oldNumber = unidata.metadata.number;
                continue;
            }
            if (unidata.metadata.number - oldNumber > 1) deletePl.push({ position: oldNumber + 1, length: unidata.metadata.number - oldNumber - 1 });
            oldNumber = unidata.metadata.number;
        }
        for (const data of deletePl) await this.playlistDelete(connection, data.position, data.length);
        if (deletePl.length !== 0) return await this.playlistGet(connection, number, length);
        return unidatas;
    }
    /** ページのフォーカス番号は0から始まります。 */
    async playlistGetPage(connection: mysql.PoolConnection, page: number = 0, length: number = 5) {
        const count = await this.#playlistCountGet(connection);
        const pageLength = Math.max(Math.ceil(count / length), 1); // 12個あって5個区切りなら3が入る
        const focusPage = Math.min(Math.max(page, 0), pageLength - 1);
        const data = await this.playlistGet(connection, focusPage * length, length);
        if (!data) return;
        return {
            results: data,
            length: pageLength,
            focus: focusPage
        };
    }
    async #playlistCountGet(connection: mysql.PoolConnection) {
        if (this.#serverInfo.id === undefined) this.#serverInfo.id = await this.#serverInfo.idGet(connection);
        const [data] = await connection.query<CountRowDataPacket[]>(
            `
            SELECT COUNT(*) AS count
            FROM serverPlaylist
            WHERE id = ?
            `, [this.#serverInfo.id]
        );
        return data[0].count;
    }
    /**
     * プレイリストに追加します。
     * 
     * 基本的に再生ポイントの次などに追加されます。再生ポイントから相対的に追加をしていく場合は、`playlistsSet`を利用してください。
     * 
     * 再生ポイントより前に追加すると、再生ポイントがずれます。視聴状態を維持するためです。
     * 
     * 帰ってくるbooleanがステータスです。falseの場合、tryが失敗している場合のエラーを検出しているため、失敗の恐れがあります。
     */
    async playlistSet(connection: mysql.PoolConnection, unidata: Unidata<{}>, number: number = -1) {
        if (this.#serverInfo.id === undefined) this.#serverInfo.id = await this.#serverInfo.idGet(connection);
        const { playingNumber } = await this.#serverInfo.infoGet(connection, "playingNumber");
        const insertNumber = number <= 0 ? playingNumber + 1 : number;
        await connection.query(
            `
            UPDATE serverPlaylist
            SET number = number + 1
            WHERE id = ?
            AND number >= ?
            ORDER BY number DESC;
            `, [this.#serverInfo.id, insertNumber]
        );
        await connection.query(
            `
            INSERT INTO serverPlaylist (
                id,
                number,
                mediaId,
                mediaType,
                objectNumber
            )
            VALUES (
                ?, ?, ?, ?, ?
            )
            `, [this.#serverInfo.id, insertNumber, unidata.id, unidata.servicetype, unidata.index ?? 0]
        );
        if (playingNumber <= insertNumber) {
            await this.#serverInfo.dataSet(connection, "playingNumber", playingNumber + 1);
        }
    }
    async playlistsSet(connection: mysql.PoolConnection, unidatas: Unidata<{}>[], number: number = -1) {
        if (this.#serverInfo.id === undefined) this.#serverInfo.id = await this.#serverInfo.idGet(connection);
        const { playingNumber } = await this.#serverInfo.infoGet(connection, "playingNumber");
        const focus = number < 0 ? playingNumber : number;
        for (let i = 0; i < unidatas.length; i++) {
            const unidata = unidatas[i];
            await this.playlistSet(connection, unidata, focus + i + 1);
        }
    }
    /**
     * 現在再生中の曲が返ります。または、前回再生した曲が途中で中断された場合など残ります。
     * 
     * 最後まで再生した、リピートがオフだった、プレイリストをクリアした、などではここが空になります。
     */
    async playing(connection: mysql.PoolConnection) {
        const data = await this.#serverInfo.infoGet(connection, "playingMediaId", "playingMediaType", "playingNumber", "playingObjectNumber");
        if (data.playingMediaId !== null && data.playingMediaType !== null && data.playingObjectNumber !== null && serviceTypeCheck(data.playingMediaType)) {
            let unidata = this.#dbmgrAPI.createUnidata(data.playingMediaId, data.playingMediaType, data.playingObjectNumber, {});
            return {
                playingNumber: data.playingNumber,
                unidata
            };
        }
    }
    /**
     * プレイリストを`削除`します。
     * 
     * 番号指定がないと0番目から削除されます。lengthで消す数を変えられます。0ですべて削除します。
     * 
     * LIMITを使いません。壊れたプレイリストの場合、存在しない区間があったとしても、通常以上の範囲が削除されるといったことはありません。
     * 
     * 再生中のインデックスは以下の計算式で変更されます。
     * ```ts
     * Math.min(Math.max(number - playingNumber, -length), 0); // 再生中より前の場合、削除個数以下で、消したい点と再生中の点の間の数だけずらす
     * ```
     */
    async playlistDelete(connection: mysql.PoolConnection, number: number = 0, length: number = 1) {
        length = Math.max(length, 0);
        number = Math.max(number, 0);
        if (this.#serverInfo.id === undefined) this.#serverInfo.id = await this.#serverInfo.idGet(connection);
        const { playingNumber } = await this.#serverInfo.infoGet(connection, "playingNumber");
        let newPlayingNumber;
        await connection.query<ServerPlaylistRowDataPacket[]>(
            `
                DELETE FROM serverPlaylist
                WHERE id = ?
                ${length > 0 ? ("AND number >= " + number) : ""} ${/** lengthが0でないなら、numberが指定以上を含める。 */""}
                ${length > 0 ? ("AND number < " + (number + length)) : ""} ${/** lengthが0でないなら、number + lengthが指定未満を含める */""}
                ORDER BY number ASC
                `,
            [this.#serverInfo.id]
        );
        await connection.query(
            `
            UPDATE serverPlaylist
            SET number = number - ?
            WHERE id = ?
            AND number >= ?;
            `, [length, this.#serverInfo.id, number]);
        if (length === 0) {
            newPlayingNumber = 0;
            await this.#serverInfo.dataSet(connection, "playingMediaId", null);
            await this.#serverInfo.dataSet(connection, "playingMediaType", null);
            await this.#serverInfo.dataSet(connection, "playingObjectNumber", null);
        } else {
            newPlayingNumber = playingNumber + Math.min(Math.max(number - playingNumber, -length), 0);
        }
        if (playingNumber !== newPlayingNumber) {
            await this.#serverInfo.dataSet(connection, "playingNumber", newPlayingNumber);
        }
    }
    /**
     * 次の曲データを返します。もしchangeがtrueだと、データを返さずplayingの内容などを置き換えます。データを取得した後にこの関数にtrueを入れる方法をおすすめします。
     * 
     * なぜそのロジックなのかというと、情報を先に取得したのち、トランスフォームの途中に好きなタイミングで状態を反映させたい、といった需要のためです。
     * 
     */
    async nextMusic(connection: mysql.PoolConnection, change: boolean = false, target?: number) {
        const { repeatType, playingNumber, playingMediaId, playingMediaType, playingObjectNumber } = await this.#serverInfo.infoGet(connection, "repeatType", "playingNumber", "playingMediaType", "playingMediaId", "playingObjectNumber");
        const playingCheck = (await this.playlistGet(connection, playingNumber, 1))?.[0];
        const count = await this.#playlistCountGet(connection);
        /**
         * 新しい再生点を求めます。
         * 
         * リピートオフ・オンでは次の曲を参照します。リピート１曲のみは移動しません。
         * 
         * ターゲットがある場合はターゲットにフォーカスが当たります。
         * 
         * 例外として、現在再生している曲(保持している曲データ)と実際に参照している再生点の曲の内容が異なる場合、ポイントを次に移動しません。また、１曲リピートであっても再生点に一致する曲に切り替わる仕様です。
         * 
         * changeがtrueの場合、まずnewPlayPointを保存してからplaylistDeleteを利用し、再生点を補正します。
         */
        const newPlayPoint = (() => {
            if (playingCheck === undefined) return 0; // 再生中の情報が見つからない場合、とりあえずフォーカスをリセットします。
            let playPoint = playingNumber;
            if (playingCheck.id === playingMediaId
                && playingCheck.servicetype === playingMediaType
                && playingCheck.index === playingObjectNumber
            ) switch (repeatType) {
                case 0:
                case 1:
                    playPoint++;
                    break;
            }
            if (target !== undefined) playPoint = target;
            if (playPoint >= count) playPoint = 0; // 範囲以上になった時、必ず0にする。
            return playPoint;
        })();
        const nextMusic = await this.playlistGet(connection, newPlayPoint, 1);
        const nextMusicStatus = nextMusic?.[0] !== undefined // 次の曲がないことを示します。
        if (change) {
            await this.#serverInfo.dataSet(connection, "playingNumber", newPlayPoint);
            await this.#serverInfo.dataSet(connection, "playingMediaId", nextMusic?.[0]?.id ?? null);
            await this.#serverInfo.dataSet(connection, "playingMediaType", nextMusic?.[0]?.servicetype ?? null);
            await this.#serverInfo.dataSet(connection, "playingObjectNumber", nextMusic?.[0]?.index ?? null);
            if (repeatType === 0) await this.playlistDelete(connection, playingNumber, 1);
        } else return nextMusicStatus ? nextMusic : undefined;
    }
    async playingDelete(connection: mysql.PoolConnection) {
        await this.#serverInfo.dataSet(connection, "playingMediaId", null);
        await this.#serverInfo.dataSet(connection, "playingMediaType", null);
        await this.#serverInfo.dataSet(connection, "playingObjectNumber", null);
    }
}

interface SearchListsRowDataPacket extends mysql.RowDataPacket, ServerPlaylist { };

interface SearchLists {
    id: number;
    number: number;
    mediaId: string;
    mediaType: string;
    objectNumber: number;
}

class SearchList {
    #serverInfo: ServerInfoAPI;
    #dbmgrAPI: DBmgrAPI;
    constructor(serverInfo: ServerInfoAPI) {
        this.#serverInfo = serverInfo;
        this.#dbmgrAPI = new DBmgrAPI();
    }
    /**
     * 検索リストを返します。長さや基点を決められます。
     */
    async searchListGet(connection: mysql.PoolConnection, number: number = 0, length: number = 5): Promise<(Unidata<{}>)[] | undefined> {
        if (this.#serverInfo.id === undefined) this.#serverInfo.id = await this.#serverInfo.idGet(connection);
        const [result] = await connection.query<ServerPlaylistRowDataPacket[]>(
            `
            SELECT *
            FROM searchList
            WHERE id = ?${length >= 0 ? (" AND number >= " + number) : ""}
            ORDER BY number ASC
            ${length !== 0 ? "LIMIT " + length : ""}
            `, [this.#serverInfo.id]
        );
        const unidatas: (Unidata<{ number: number; }>)[] = [];
        for (const res of result) {
            const serviceType = res.mediaType;
            if (!serviceTypeCheck(serviceType)) continue;
            const unidata = this.#dbmgrAPI.createUnidata(res.mediaId, serviceType, res.objectNumber, { number: res.number });
            if (!unidata) continue;
            unidatas.push(unidata);
        }
        return unidatas;
    }
    async #searchListCountGet(connection: mysql.PoolConnection) {
        if (this.#serverInfo.id === undefined) this.#serverInfo.id = await this.#serverInfo.idGet(connection);
        const [data] = await connection.query<CountRowDataPacket[]>(
            `
            SELECT COUNT(*) AS count
            FROM searchList
            WHERE id = ?
            `, [this.#serverInfo.id]
        );
        return data[0].count;
    }
    /** ページのフォーカス番号は0から始まります。 */
    async searchListGetPage(connection: mysql.PoolConnection, page: number = 0, length: number = 5) {
        const count = await this.#searchListCountGet(connection);
        const pageLength = Math.max(Math.ceil(count / length), 1); // 12個あって5個区切りなら3が入る
        const focusPage = Math.min(Math.max(page, 0), pageLength - 1);
        const data = await this.searchListGet(connection, focusPage * length, length);
        if (!data) return;
        return {
            results: data,
            length: pageLength,
            focus: focusPage
        };
    }
    /**
     * 検索結果を保存します。過去の検索結果が上書きされたりなどがあります。
     * 
     * Unidataはfetchしてから渡してください。そうでない場合、indexはすべて0となります。
     */
    async searchListSet(connection: mysql.PoolConnection, unidatas: Unidata<{}>[]) {
        if (this.#serverInfo.id === undefined) this.#serverInfo.id = await this.#serverInfo.idGet(connection);
        await connection.query(
            `
            DELETE FROM searchList
            WHERE id = ?
            `, [this.#serverInfo.id]
        );
        for (let i = 0; i < unidatas.length; i++) {
            const unidata = unidatas[i];
            for (let j = 0; j < unidata.length; j++) await connection.query(
                `
                INSERT INTO searchList (
                    id,
                    number,
                    mediaId,
                    mediaType,
                    objectNumber
                )
                VALUES (
                    ?, ?, ?, ?, ?
                )
                `, [this.#serverInfo.id, i, unidata.id, unidata.servicetype, j]
            );
        }
        await this.#serverInfo.dataSet(connection, "searchTime", new Date());
    }
}
