export declare class PopupManage {
    popup: HTMLElement | null;
    popupList: {
        type: "full" | "window";
        element: HTMLElement;
        closed?: () => void;
    }[];
    constructor();
    view(name: string, type: "window" | "full", closed?: () => void): void;
    close(name?: string, type?: "window" | "full"): void;
}
