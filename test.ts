import fs from "fs";
import { WasmFunc } from "./wasm/wasmFunc.js";

const wasmFunc = new WasmFunc();
wasmFunc.init().then(() => {
    const stream = fs.createReadStream("./output.pcm");
    const write = fs.createWriteStream("./convert.pcm");
    let temp: Uint8Array<ArrayBuffer>;
    stream.on("data", chunk => {
        if (typeof chunk === "string") return;
        const rawData = new Uint8Array(chunk.length + (temp ? temp.length : 0));
        if (temp) rawData.set(temp);
        for (let i = 0; i < chunk.length; i++) rawData[i + (temp ? temp.length : 0)] = chunk.readUint8(i);

        temp = rawData.slice(rawData.length - (rawData.length % 10), rawData.length);

        const data = new Uint16Array(rawData.buffer, 0, (rawData.length - (rawData.length % 10)) / 2);

        const converted10 = wasmFunc.PCM16bitto10bit(data);
        const restored16 = wasmFunc.PCM10bitto16bit(converted10);

        write.write(restored16);
    });
    stream.on("end", () => { write.end(); });
});
