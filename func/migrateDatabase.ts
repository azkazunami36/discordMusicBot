import { MusicLibraryJSON } from "../dbmgr/interface.js";

/**
 * 同じバージョン同士でのミュージックライブラリの移行を行うものです。
 * 
 * もし古いバージョンのミュージックライブラリの移行をしたい場合は、このコードの旧コードを改良して利用可能にするといいかも。
 */
export async function migrateDatabase(url: string, json: MusicLibraryJSON) {
    console.log("ミュージックライブラリのデータ移行を行います。");
    console.log("サーバーなどの情報の場合、情報が新しいものを上書きし、すでにあるデータで移行元が古い場合はスキップします。");
    try {
        const testText = await (await fetch(url)).text();
        if (testText !== "Music Library v3") throw "";
    } catch {
        console.log("URLのテストを行いましたが、目的のAPIではないか、存在しないURL、またはバージョンの違うライブラリです。移行は行いません。");
        return;
    }
}
