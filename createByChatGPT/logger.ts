// Created by ChatGPT

import fs from "fs";
import path from "path";
import util from "util";
import * as _log4js from "log4js";
import { SumLog } from "../class/sumLog.js";
const log4js = ((_log4js as any).default ?? _log4js) as typeof _log4js;

// ルート直下 log フォルダを保証
const logDir = path.resolve(process.cwd(), "log");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// log4js 設定
log4js.configure({
  appenders: {
    file: {
      type: "file",
      filename: path.join(logDir, "log.log"), // 本体
      maxLogSize: 5 * 1024 * 1024,            // 5MB 超でローテ
      backups: 50,                             // 世代数
      keepFileExt: true,                       // log.1.log のように拡張子維持
      compress: true,                          // 古い世代は .gz
      layout: {
        type: "pattern",
        // 例: [2025-10-10T16:00:11+09:00] [INFO] message
        pattern: "[%d{ISO8601_WITH_TZ_OFFSET}] [%p] %m",
      },
    },
    console: {
      type: "console",
      layout: {
        type: "pattern",
        pattern: "[%d{ISO8601_WITH_TZ_OFFSET}] [%p] %m",
      },
    },
  },
  categories: {
    default: { appenders: ["file", "console"], level: "info" },
  },
});

const logger = log4js.getLogger(); // default カテゴリ

// ---- console.* を logger にブリッジ（型安全 & フォーマット維持） ----
type ConsoleMethods = "log" | "info" | "warn" | "error" | "debug";
const originalConsole: Record<ConsoleMethods, (...args: any[]) => void> = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

// util.format で %s / %d / %o などのフォーマット互換を維持
function toLine(args: any[]): string {
  // console の見た目はそのままに、logger へは 1 行文字列で送る
  try {
    return util.format(...args);
  } catch {
    return args.map(String).join(" ");
  }
}

const g = globalThis as any;
if (!g.__CONSOLE_BRIDGED__) {
  g.__CONSOLE_BRIDGED__ = true;
  console.log = (...args: any[]) => {
    logger.info(toLine(args));          // ログファイルにも出力
  };

  console.info = (...args: any[]) => {
    logger.info(toLine(args));
  };

  console.warn = (...args: any[]) => {
    const line = toLine(args);
    if (line.startsWith("[YOUTUBEJS][Text]: Unable to find matching run for command run")) {
      return;
    }
    logger.warn(line);
    SumLog.warn("warnが発生しました。１６０文字以内の抜粋: " + line.slice(0, 160), { functionName: "logger" });
  };

  console.error = (...args: any[]) => {
    const line = toLine(args);
    logger.error(line);
    SumLog.error("errorが発生しました。１６０文字以内の抜粋: " + line.slice(0, 160), { functionName: "logger" });
  };

  console.debug = (...args: any[]) => {
    logger.debug(toLine(args));
  };
  // ------------------------------------------------------------------------
}
// ------------------------------------------------------------------------

export default logger;
