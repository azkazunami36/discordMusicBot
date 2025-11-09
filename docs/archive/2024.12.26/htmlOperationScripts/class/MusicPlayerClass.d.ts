import { ClientSession } from "../../scripts/interfaces/ClientSession.js";
import { EventEmitter } from "../../scripts/class/EventEmitter.js";
import { FileTab } from "./tab/File.js";
export declare class MusicPlayerClass extends EventEmitter<{
    play: [];
    pause: [];
    stop: [];
    next: [];
    previous: [];
    repeat: [];
}> {
    audioElement: HTMLAudioElement;
    buttonsElement: {
        footerElement: HTMLElement;
        playButton: HTMLElement | null;
        repeatButton: HTMLElement | null;
        seekBar: HTMLInputElement | null;
        nowTime: HTMLDivElement | null;
        maxTime: HTMLDivElement | null;
    };
    playList: {
        playlistuuid?: string;
        list: {
            musicuuid?: string;
            filename?: string;
        }[];
    };
    playNumber: number;
    playType?: "flac" | "aac";
    shuffle: boolean;
    repeat: boolean;
    private formatTime;
    private interval;
    private seeking;
    seekBarReDraw(): void;
    constructor(mainFileTabManager: FileTab);
    /**
     * 再生と停止を切り替える
     */
    playChange(): void;
    get sessionData(): ClientSession;
}
