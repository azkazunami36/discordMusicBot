// @ts-ignore
import * as PCM8bitto from "./PCM8bitto/main.js";
// @ts-ignore
import * as PCM16bitto from "./PCM16bitto/main.js";

interface WasmBody {
    HEAPU8: Uint8Array & { buffer: ArrayBuffer };
    HEAPU16: Uint16Array & { buffer: ArrayBuffer };
    ccall: (funcname: string,
        returnType: "number" | "string" | "boolean" | null,
        argTypes: ("number" | "string" | "boolean")[],
        args: any[]) => number;
    _free: (pointer: number) => void;
    _malloc: (length: number) => number;
}

/** wasmを実行するやつです。 */
export class WasmFunc {
    #pcm8bittoins?: WasmBody;
    #pcm16bittoins?: WasmBody;
    async init() {
        this.#pcm8bittoins = await PCM8bitto.default();
        this.#pcm16bittoins = await PCM16bitto.default();
    }
    PCM8bitto16bit(data: Uint8Array) {
        const ins = this.#pcm8bittoins;
        if (!ins) throw new Error("復元Cが読み込めませんでした。");
        if (!ins) return 0;
        const pointer = ins._malloc(data.length);
        ins.HEAPU8.set(data, pointer);
        const resultPointer = ins.ccall("PCM8bitto16bit", "number", ["number", "number"], [pointer, data.length]);
        const result = new Uint16Array(ins.HEAPU16.buffer, resultPointer, data.length);
        ins._free(pointer);
        ins._free(resultPointer);
        return result;
    }
    PCM16bitto8bit(data: Uint16Array) {
        const ins = this.#pcm16bittoins;
        if (!ins) throw new Error("変換Cが読み込めませんでした。");
        if (!ins) return new Uint8Array(0);
        const pointer = ins._malloc(data.length);
        ins.HEAPU16.set(data, pointer / 2);
        const resultPointer = ins.ccall("PCM16bitto8bit", "number", ["number", "number"], [pointer, data.length]);
        const result = new Uint8Array(ins.HEAPU8.buffer, resultPointer, data.length);
        ins._free(pointer);
        ins._free(resultPointer);
        return result;
    }
    /**
     * 10bitの入力は不可能なので、8バイト(Uint16Arrayではlengthが5、10など)を区切りとして与えてください。
     * 
     * そうでない場合、出力の末尾に0が追加されます。あらかじめ0を追加しておき、後から切り取ることをお勧めします。 
     */
    PCM10bitto16bit(data: Uint16Array) {
        const ins = this.#pcm8bittoins;
        if (!ins) throw new Error("復元Cが読み込めませんでした。");
        if (!ins) return new Uint16Array(0);
        const pointer = ins._malloc(data.length * 2);
        ins.HEAPU16.set(data, pointer / 2);
        const resultPointer = ins.ccall("PCM10bitto16bit", "number", ["number", "number"], [pointer, data.length]);
        const result = new Uint16Array(ins.HEAPU16.buffer, resultPointer, data.length);
        ins._free(pointer);
        ins._free(resultPointer);
        return result;
    }
    /**
     * 返り値は必ず８バイト単位となります。
     * 
     * UintArrayのlengthが10や20などではなく21や29などの場合、無駄に1つや9つのサンプルが生成されます。
     * 
     * 10 - (length % 10)などで切り詰めるデータをチェックして保存しておくことをおすすめします。
     */
    PCM16bitto10bit(data: Uint16Array) {
        const ins = this.#pcm16bittoins;
        if (!ins) throw new Error("変換Cが読み込めませんでした。");
        if (!ins) return new Uint16Array(0);
        const pointer = ins._malloc(data.length * 2);
        ins.HEAPU16.set(data, pointer / 2);
        const resultPointer = ins.ccall("PCM16bitto10bit", "number", ["number", "number"], [pointer, data.length]);
        const result = new Uint16Array(ins.HEAPU16.buffer, resultPointer, data.length);
        ins._free(pointer);
        ins._free(resultPointer);
        return result;
    }
}
