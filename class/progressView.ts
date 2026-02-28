import readline from "readline";

/**
 * とりあえず完成としていますが、リサイズ時に表示が破綻する可能性があります。VSCode Tunnel上では挙動が明らかに破綻しました。
 */
export class ProgressView {
    constructor() {
        console.log("プログレスバーの描画を開始します。プログレスバー表示用クラス外でconsole.logなどを利用した場合に、プログレスバーの表示が残るなどが起こる可能性があります。");
        this.#oldColumn = this.#windowsize.x;
        this.#reflesh();
    };
    message: string = "";
    #percent = 0;
    set percent(num: number) {
        if (num < 0) this.#percent = 0;
        else if (num > 100) this.#percent = 100;
        else this.#percent = num;
    }
    get percent() { return this.#percent }
    #reflashrate = 10;
    set reflashrate(num: number) {
        if (num < 1) this.#reflashrate = 1;
        else if (num > 100) this.#reflashrate = 100;
        else this.#reflashrate = num;
    }
    get reflashrate() { return this.#reflashrate }
    #done = false;
    set done(is: boolean) { if (!this.#done) this.#done = is }
    get done() { return this.#done }
    #lastreflashtime = 0;
    #oldColumn = 0;
    get #windowsize() {
        const [x, y] = process.stdout.getWindowSize();
        return { x, y }
    }
    #textLength(string: string) {
        let length = 0;
        for (let i = 0; i !== string.length; i++) string[i].match(/[ -~]/) ? length += 1 : length += 2;
        return length;
    }
    #reflesh() {
        if (this.#lastreflashtime === 0) this.#lastreflashtime = Date.now();
        if (this.#done) return;
        function 次回の描画まで待つ必要がある時間(this: ProgressView) {
            const waittime = ((1 / this.#reflashrate) * 1000) - (Date.now() - this.#lastreflashtime);
            if (waittime <= 0) return 0;
            else return waittime;
        }
        setTimeout(() => {
            if (this.#done) {
                this.#progressbarfillout();
                return;
            }
            this.#lastreflashtime = Date.now();
            this.#progressbarfillout();
            const message = (this.message ? this.message + " " : "") + (Math.floor(this.#percent * 10) / 10) + "%";
            const messagelength = this.#textLength(message);
            const progressBarSize = (this.#windowsize.x < 70 ? 70 : this.#windowsize.x) - messagelength - 2; // カッコを含めるため2つ減らしています。
            const progressSize = (this.#percent / 100) * progressBarSize;
            const progressBlankSize = progressBarSize - progressSize;
            const viewString = message + "[" + "#".repeat(progressSize) + " ".repeat(progressBlankSize) + "]";
            process.stdout.write(viewString);
            readline.cursorTo(process.stdout, 0);
            this.#oldColumn = this.#textLength(viewString);
            this.#reflesh();
        }, 次回の描画まで待つ必要がある時間.bind(this)());
    }
    /** 表示前にこれを呼び出してください。プログレスバーを削除します。 */
    #progressbarfillout() {
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        const nowColumn = this.#windowsize.x;
        // もし再描画をしようとした際に枠が小さくなっていた場合、以前表示していたプログレスバーを削除します(カーソル位置が変動していなければ。通常はウィンドウサイズが変わっただけではカーソル位置はプログレスバーの一番最初にあります。)
        if (this.#oldColumn - nowColumn > 1) {
            const row = Math.ceil(this.#oldColumn / nowColumn);
            for (let i = 1; i < row; i++) {
                readline.moveCursor(process.stdout, 0, 1);
                readline.clearLine(process.stdout, 0);
            }
            readline.moveCursor(process.stdout, 0, -(row - 1));
        }
    }
    log(...args: any[]) {
        this.#progressbarfillout();
        console.log(...args);
    }
}
