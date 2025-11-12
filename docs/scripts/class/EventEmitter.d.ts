export declare class EventEmitter<T extends {
    [eventName: string]: any;
} = {}> {
    private events;
    constructor();
    on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): void;
    emit<K extends keyof T>(event: K, ...args: T[K]): void;
}
