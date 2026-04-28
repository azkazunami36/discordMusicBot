import * as Discord from "discord.js";
import { EventEmitter } from "stream";

/**
 * プレイヤークラスです。
 * 
 * 主にこのクラスを使ってさまざまなクライアントに対して再生状態を変更したりすることができます。
 * 
 * 再生状態の追跡・アクティビティ記録・Discord.jsのプレイヤーを管理するクラスを同梱しています。
 * 
 * このクラス単体の役割は、全ての抽象化されたクラスを統合し、外部から操作できるようにするためのものです。しかし、ほとんどの場合このクラスで完結する思想です。
 */
class Player {
    discordClient: Discord.Client;
    constructor(discordClient: Discord.Client) {
        this.discordClient = discordClient;
    }
}

/**
 * 再生に使用するソースを識別するための情報です。
 * 
 * 以後１つの曲にボーカルトラックやドラムトラックといった具合で分割された音声ファイルを提供する場合がありますが、それをここに含める必要は現時点でありません。しかし、プレイリストにそれら情報を記録するといった手段が現れた場合、この型定義を削除して、そのプレイリストの型定義を使用することで拡張できます。
 */
interface FocusSource {
    /** 使用するサービス名です。例: YouTube、アップロードされたファイル等 */
    service: string;
    /** 識別するためのIDです。 */
    id: string;
    /** 存在する場合、ソース番号です。 */
    item: number;
}

/**
 * デバイスと接続するためのシステムをここに定義します。関数が呼ばれた際に、どのように行動するかをここで決定します。
 * 
 * デバイスを破棄する場合は必ずこのクラスのdestroyを呼び出してください。
 */
interface ConnectSystemFunctions {
    device: Device;
    deviceType: DeviceType;
    get destroyed(): boolean;
    /** システムの状態を示します。readyの場合正しく関数を受け付けますが、notworkingの場合関数を送信しても処理はクライアントに届きません。 */
    get status(): "ready" | "notworking";
    play(): void;
    pause(): void;
    volume(vol: number): void;
    repeat(mode: "off" | "normal" | "only"): void;
    speed(vol: number): void;
    equalizer(): void;
    pitch(vol: number): void;
    seek(msec: number): void;
    changeSource(source: FocusSource): void;
    destroy(): void;
}

/**
 * 現在未完成のイベントです。設計が明確になり次第実装します。
 */
interface PlaySessionEvent {
    play: [];
    repeat: [];
    error: [error: { error?: Error; unknown?: unknown; }];
}

declare interface PlaySession {
    on<K extends keyof PlaySessionEvent>(event: K, listener: (...args: PlaySessionEvent[K]) => void): this;
    once<K extends keyof PlaySessionEvent>(event: K, listener: (...args: PlaySessionEvent[K]) => void): this;
    off<K extends keyof PlaySessionEvent>(event: K, listener: (...args: PlaySessionEvent[K]) => void): this;
    emit<K extends keyof PlaySessionEvent>(event: K, ...args: PlaySessionEvent[K]): boolean;
}

/**
 * セッションという概念です。１人１台のデバイスに再生する場合にも使用し、複数人で曲を楽しむ場合も、１人で複数台のデバイスで音楽を楽しむ場合も、Discord.jsで音楽を楽しむ場合も使用します。
 * 
 * セッションでは同じ曲を全てのデバイスで楽しめるように設計します。同期と複数人の操作を正しく扱う必要があります。
 * 
 * ここに用意されている関数は全てデバイスに送信される関数です。しかし、デバイスIDを指定すると目的のデバイスに送信できます。
 * 
 * 再生に関するイベントを取り出せます。リピート操作やイベント操作などの取得が可能です。
 */
class PlaySession extends EventEmitter {
    player: Player;
    /**
     * このセッションのID。
     */
    readonly sessionId;
    /**
     * セッションに接続しているデバイス。また、ユーザーID同梱。
     * 
     * アクティビティ監視のため、整合性を高めてください。
     */
    #devices: Device[] = [];
    /**
     * セッションが破棄されたかどうか。クラスを利用できなくしたりするためのものでもあります。
     */
    #destroyed = false;
    /**
     * セッションが破棄されたかどうか。
     */
    get destroyed() { return this.#destroyed; }
    /**
     * セッションで共有される再生リスト。
     */
    playlist: FocusSource[] = [];

    constructor(player: Player, sessionId: string, devices?: Device[]) {
        super();
        this.player = player;
        this.sessionId = sessionId;
        if (devices) this.#devices.push(...devices);
    }
    play() { }
    pause() { }
    destroy() {
        this.#destroyed = true;
        for (const device of this.#devices) {
            device.destroy();
        }
        this.removeAllListeners();
        this.on = () => { console.error("破棄されたクラス「PlaySession」のイベントリスナーを利用しようとしました。"); return this; }
        this.emit = () => { console.error("破棄されたクラス「PlaySession」のイベントリスナーを利用しようとしました。"); return false; }
        this.addListener = () => { console.error("破棄されたクラス「PlaySession」のイベントリスナーを利用しようとしました。"); return this; }
    }
    volume() { }
    repeat() { }
    speed() { }
    equalizer() { }
    pitch() { }
    seek() { }
    changeSource() { }
}

/** デバイスタイプです。デバイスによって実装が異なる(ことがある)ため、ここで挙動を識別する可能性もあるため、定義します。 */
type DeviceType = "Discord.js" | "Web";

/**
 * 再生先のデバイスです。デバイスごとに操作する必要のあるものがここに定義されます。
 * 
 * セッションを破棄する場合に必ずデバイスを破棄してください。
 */
class Device {
    playSession: PlaySession;
    /**
     * 誰のデバイスかを識別する。ほとんどの場合シングルだが、Discord.jsといったサービスを跨ぐ場合の例外のため、配列で対応。
     */
    readonly userId: string[];
    /**
     * クラスの処理タイプを選択する。
     */
    readonly type: DeviceType;
    /**
     * デバイスのID。ログイン時に付与される固有のID。
     */
    readonly id;
    /**
     * デバイス名。空欄でも可能。
     */
    readonly name;
    /**
     * 実際にデバイスとやりとりするためのクラスです。
     * 
     * 詳細はinterfaceで解説しています。
     */
    readonly connectSystem: DiscordConnectSystem | WebConnectSystem;
    /**
     * デバイスとの接続が破棄されたかどうか。クラスを利用できなくしたりするためのものでもあります。
     */
    #destroyed = false;
    /**
     * デバイスとの接続が破棄されたかどうか。
     */
    get destroyed() { return this.#destroyed; }
    constructor(playSession: PlaySession, userId: string[], type: DeviceType, id: string, name: string) {
        this.playSession = playSession;
        this.userId = [...userId];
        this.type = type;
        this.id = id;
        this.name = name;
        if (type === "Discord.js") {
            this.connectSystem = new DiscordConnectSystem(this);
        } else if (type === "Web") {
            this.connectSystem = new WebConnectSystem(this);
        } else this.connectSystem = new WebConnectSystem(this);
    }
    /**
     * デバイスとの接続を終了します。
     */
    destroy() {
        this.#destroyed = true;
        this.connectSystem.destroy();
    }
}

/**
 * 現在未完成のイベントです。設計が明確になり次第実装します。
 */
interface DiscordConnectSystemEvent {
    play: [];
    error: [error: { error?: Error; unknown?: unknown; }];
}

declare interface DiscordConnectSystem {
    on<K extends keyof DiscordConnectSystemEvent>(event: K, listener: (...args: DiscordConnectSystemEvent[K]) => void): this;
    once<K extends keyof DiscordConnectSystemEvent>(event: K, listener: (...args: DiscordConnectSystemEvent[K]) => void): this;
    off<K extends keyof DiscordConnectSystemEvent>(event: K, listener: (...args: DiscordConnectSystemEvent[K]) => void): this;
    emit<K extends keyof DiscordConnectSystemEvent>(event: K, ...args: DiscordConnectSystemEvent[K]): boolean;
}

/**
 * Discord.jsのボイスチャンネルと接続するためのクラスです。
 * 
 * 設計前提として
 * - Discord.js Client
 * - Guild ID
 * - Channel ID
 * が必要です。しかし、ClientはPlayerクラスに同梱します。クラス初期化時にclientを設置するだけです。
 * 
 * 初めてチャンネルに参加してセッションが開始される場合に、セッションIDは「DiscordJs-[Guild ID]」で作成します。それにより、すでに存在するセッションでは発見ができ、存在しないセッションは作成できます。Discord.jsの場合はセッションは連番ではありません。
 * 
 */
class DiscordConnectSystem extends EventEmitter implements ConnectSystemFunctions {
    device: Device;
    /**
     * デバイスとの接続が破棄されたかどうか。クラスを利用できなくしたりするためのものでもあります。
     */
    #destroyed = false;
    /**
     * デバイスとの接続が破棄されたかどうか。
     */
    get destroyed() { return this.#destroyed; }
    #guildId?: string;
    set guildId(id: string) { this.#guildId = id; }
    #channelId?: string;
    set channelId(id: string) { this.#channelId = id; }
    /** 
     * システムの状態を示します。readyの場合正しく関数を受け付けますが、notworkingの場合関数を送信しても処理はクライアントに届きません。 
     */
    get status(): "ready" | "notworking" { if (this.#guildId && this.#channelId) return "ready"; else return "notworking" }
    readonly deviceType = "Discord.js";
    constructor(device: Device) {
        super();
        this.device = device;
        this.device.playSession.player.discordClient;
    }
    play() { }
    pause() { }
    volume(vol: number) { }
    repeat(type: "off" | "normal" | "only") { }
    speed(vol: number) { }
    equalizer() { }
    pitch(vol: number) { }
    seek(msec: number) { }
    changeSource(source: FocusSource) { }
    destroy() {
        this.#destroyed = true;
        this.removeAllListeners();
        this.on = () => { console.error("破棄されたクラス「DiscordConnectSystem」のイベントリスナーを利用しようとしました。"); return this; }
        this.emit = () => { console.error("破棄されたクラス「DiscordConnectSystem」のイベントリスナーを利用しようとしました。"); return false; }
        this.addListener = () => { console.error("破棄されたクラス「DiscordConnectSystem」のイベントリスナーを利用しようとしました。"); return this; }
    }
}

class WebConnectSystem implements ConnectSystemFunctions {
    device: Device;
    /**
     * デバイスとの接続が破棄されたかどうか。クラスを利用できなくしたりするためのものでもあります。
     */
    #destroyed = false;
    /**
     * デバイスとの接続が破棄されたかどうか。
     */
    get destroyed() { return this.#destroyed; }
    /** 
     * システムの状態を示します。readyの場合正しく関数を受け付けますが、notworkingの場合関数を送信しても処理はクライアントに届きません。 
     */
    get status(): "ready" { return "ready" }
    readonly deviceType = "Web";
    constructor(device: Device) {
        this.device = device;
    }
    play() { }
    pause() { }
    volume() { }
    repeat() { }
    speed() { }
    equalizer() { }
    pitch() { }
    seek() { }
    changeSource() { }
    destroy() {
        this.#destroyed = true;
    }
}

/**
 * アクティビティを追跡するためのツールです。主にConnectSystem内で使用します。Device内では追跡しきれないことがあるため、必ずConnectSystem内に実装してください。
 * 
 * 以下のタイミングで記録する必要があります。
 * - 再生開始時
 * - シーク時
 * - 再生中断時
 * - ユーザー退出時
 * - ユーザー入室時
 * 
 * セッションクラスを入力した上で、上記のタイミングで適切な関数を呼び出し、その関数通りの記録を行います。基本的にplayとstopのみです。使い方は以下です。
 * - 速度変更はstopの後変更後の情報をplayに書き込む
 * - 最後まで再生された場合、stopを行わないでも良い
 * - シークの場合もstopの後にplayを行う
 * 
 * このクラスは生データをそのままJSONLにします。アクティビティ情報が誰のものであり、どれほど再生されたかなどを追跡する場合は、別途解析クラスを利用してください。
 * 
 * また、JSONL１行に必ずバージョンを明記します。バージョンと一致する型定義を利用し、その通りに解析してください。
 */
class ActivityRecorder { }

interface ActivityDatav1 {
    /** 
     * セッションID。複数のデバイスで再生していた場合にこのセッションIDが重なった場合は同じイベントとしてグループ化して処理することになり、少々重要です。なくてもイベント区間の重複は適切に処理されます。
     */
    sessionId: string;
    /** イベント時間 */
    timestamp: number;
    /** イベントが適用されたユーザー */
    userId: string;
    /** イベントタイプ */
    type: "play" | "stop";
    /** 再生速度 */
    speed: number;
    /** 視聴していたソース */
    source: FocusSource;
    /** 再生していた地点 */
    mtime: number;
    /** アクティビティの追加情報 */
    info: {
        type: "Discord.js";
        guildId: string;
        channelId: string;
    } | {
        type: "Web";
        deviceId: string;
        deviceName: string;
    }
}

/*
設計

プレイヤークラスは操作用クラスを返答する。それには「getPlayer」を利用する。ユーザーIDを入力すると、セッションIDが生成されて返ってくる。セッションIDはユーザーIDと紐づけられるため、連番でつけられる。
また、getPlayerにはデバイス名やデバイスタイプなども入力できる。そして、Discord.jsと入力された時に限り、Discord.jsの状態を扱うクラスが内部的に使用される。

getPlayerで返ってくるクラス名を「PlaySession」とする。destroyすると再生中のデバイスが無効化される。ただし、再生されないまま５分以上や、再生中の楽曲が停止したのちにリピートが起こらないなどした場合、そこから１時間ほどブランクが続くと自動でdestroyされる。

getPlayerでセッションを取得するが、listPlayerとユーザーIDで全てのセッションIDを見ることもできる。また、セッション情報はPlaySessionの中に記録されている。

セッションをグループ化する構想を考える。グループ化した際、新しいセッションIDを作成し、過去のセッションIDを破棄すればいいと考える。その前に、どのセッションがどのデバイスと関連づけられているかを判別する方法を改めて考え直す。

デバイスはセッションIDを取得しようと試みて、成功すると以後そのセッションIDをsubscribeして、監視を続ける。そのセッションIDをとりあえず複数デバイスに分ければいい。

しかし、どのデバイスがセッションIDを取得しているのか、利用しているのかを追跡する必要がある。各デバイスにはログイン時にデバイス識別のできるIDを付与すると良いかもしれない。連番で問題ない。

次に、セッションは他人とも共有できるようにする。例えばユーザーが複数人いるなど。その場合はユーザーIDを配列にする。デバイス情報にもユーザーIDを同梱することで、デバイスの識別を間違えないようにする。





*/
