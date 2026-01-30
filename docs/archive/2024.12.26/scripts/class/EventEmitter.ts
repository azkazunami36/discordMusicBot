export class EventEmitter<T extends {[eventName: string]: any} = {}> {
    private events: {
        [K in keyof T]?: ((...args: T[K]) => void)[]
    } = {};
    constructor() { }

    // イベントリスナーを登録するメソッド
    on<K extends keyof T>(event: K, listener: (...args: T[K]) => void) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event]!.push(listener);
    }

    // イベントを発火するメソッド
    emit<K extends keyof T>(event: K, ...args: T[K]) {
        if (this.events[event]) {
            this.events[event]!.forEach(listener => listener(...args));
        }
    }
};
