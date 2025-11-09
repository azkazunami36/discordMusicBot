export class EventEmitter {
    events = {};
    constructor() { }
    // イベントリスナーを登録するメソッド
    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
    }
    // イベントを発火するメソッド
    emit(event, ...args) {
        if (this.events[event]) {
            this.events[event].forEach(listener => listener(...args));
        }
    }
}
;
