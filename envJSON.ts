import fs from "fs";

/** env.jsonにサーバー毎のデータを記録したり読み込んだりするものです。 */
export function envJSON(guildId: string, name: string, body?: string): string | undefined {
    if (!fs.existsSync("env.json")) fs.writeFileSync("env.json", "{}");
    const json = JSON.parse(String(fs.readFileSync("env.json")));
    if (!json[guildId]) json[guildId] = {};
    if (body !== undefined) {
        json[guildId][name] = body;
        fs.writeFileSync("env.json", JSON.stringify(json, null, "    "));
    }
    return json[guildId][name];
}
