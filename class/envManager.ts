import fs from "fs/promises";
import dotenv from "dotenv";
import path from "path";

/** Created by ChatGPT. */
function stringifyEnvSafe(env: Record<string, string>) {
    const escape = (str: string) =>
        str
            .replace(/\\/g, "\\\\")   // バックスラッシュ
            .replace(/"/g, '\\"');    // ダブルクォート

    return Object.entries(env)
        .map(([key, value]) => {
            // 値にスペースや特殊記号があるなら "" を付ける
            const needsQuotes = /[\s#'"\\]/.test(value);
            if (needsQuotes) {
                return `${key}="${escape(value)}"`;
            }
            return `${key}=${value}`;
        })
        .join("\n");
}

/** 環境にデータをセットします。 */
export async function envSet(name: string, value: string) {
    process.env[name] = value;
    const envRawFile = String(await fs.readFile(path.join(process.cwd(), ".env")));
    const env = dotenv.parse(envRawFile);
    env[name] = value;
    await fs.writeFile(path.join(process.cwd(), ".env"), stringifyEnvSafe(env));
}

type EnvType =
    "DISCORD_TOKEN"
    | "YOUTUBE_API_KEY"
    | "X_TOKEN"
    | "X_TOKEN_SECRET"
    | "X_API_KEY"
    | "X_API_KEY_SECRET"
    | "CHROME_USER_PROFILE_PATH"
    | "GOOGLE_ACCOUNT_INDEX"
    | "DISCORD_ADMIN_USER_ID"
    | "DISCORD_ADMIN_GUILD_ID"
    | "MONGO_DB_USERNAME"
    | "MONGO_DB_PASSWORD"
    | "MONGO_DB_URL"
    | "MONGO_DB_AUTH_MECHANISM"
    | "MONGO_DB_NAME";

/** 環境データを取得します。 */
export function envGet(): Record<EnvType, string | undefined> {
    return process.env as Record<EnvType, string | undefined>;
}

envGet().DISCORD_TOKEN
