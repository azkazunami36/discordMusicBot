// ====================== 型定義（JSDoc付き） ======================

/** yt-dlp の進捗ステータス（将来値に備えて string も許容） */
export type YtDlpProgressStatus =
  | "downloading"
  | "finished"
  | "error"
  | "pre_processing"
  | "post_processing"
  | "processing"
  | string;

/** yt-dlp の %(progress)j が出力する“生”の進捗オブジェクト */
export interface YtDlpProgress {
  /** 現在の状態（例: "downloading" | "finished"） */
  status: YtDlpProgressStatus;

  /** 出力ファイルの最終パス（例: "cache/foo-cache.mp4"） */
  filename?: string;

  /** 一時ファイルのパス（例: "cache/foo-cache.mp4.part"） */
  tmpfilename?: string;

  /** これまでにダウンロードしたバイト数（単位: バイト） */
  downloaded_bytes?: number;

  /** 総バイト数（単位: バイト）。不明な場合は未定義 */
  total_bytes?: number;

  /** 推定総バイト数（単位: バイト）。HLS等で total が不明な時に出る */
  total_bytes_estimate?: number;

  /** 経過時間（秒） */
  elapsed?: number;

  /** 残り時間（秒）。不明な場合は未定義 */
  eta?: number;

  /** 推定ダウンロード速度（単位: バイト/秒） */
  speed?: number;

  /** 現在のフラグメント番号（HLS等の分割DLで使用） */
  fragment_index?: number;

  /** 総フラグメント数（HLS等の分割DLで使用） */
  fragment_count?: number;

  /** 複数ジョブのうち何番目か（未使用なら null/未定義） */
  progress_idx?: number | null;

  /** 総ジョブ数（未使用なら null/未定義） */
  max_progress?: number | null;

  /** 進捗（％）の数値版（0〜100） */
  _percent?: number;

  /** 進捗（％）の文字列版（例: " 98.2%"。パディングあり） */
  _percent_str?: string;

  /** 速度の文字列版（例: "   2.23MiB/s"。パディングあり） */
  _speed_str?: string;

  /** 総バイト数の文字列版（例: "   4.12MiB" / "       N/A"） */
  _total_bytes_str?: string;

  /** 推定総バイト数の文字列版（例: "   4.21MiB"） */
  _total_bytes_estimate_str?: string;

  /** ダウンロード済みバイト数の文字列版（例: "   4.13MiB"） */
  _downloaded_bytes_str?: string;

  /** 経過時間の文字列版（例: "00:00:01"） */
  _elapsed_str?: string;

  /** 残り時間の文字列版（例: "00:00" / "Unknown"） */
  _eta_str?: string;

  /** デフォルトの人間向けメッセージ（例: "98% of ~ 4.21MiB at ..."） */
  _default_template?: string;
}

/** アプリ側で使いやすいように、数値・トリム済み文字列へ正規化した形 */
export interface NormalizedProgress {
  /** 固定値 "progress"（イベント種別識別用） */
  type: "progress";

  /** ステータス（例: "downloading" | "finished"） */
  status: YtDlpProgressStatus;

  /** パーセント（0〜100）。計算不可なら null */
  percent: number | null;

  /** ダウンロード済みバイト数（B）。不明なら null */
  downloadedBytes: number | null;

  /** 総バイト数（B）。不明なら null */
  totalBytes: number | null;

  /** 推定総バイト数（B）。不明なら null */
  totalBytesEstimate: number | null;

  /** 速度（B/s）。不明なら null */
  speedBps: number | null;

  /** 残り秒数。不明なら null */
  etaSeconds: number | null;

  /** 経過秒数。不明なら null */
  elapsedSeconds: number | null;

  /** 出力ファイルの最終パス */
  filename?: string;

  /** 一時ファイルのパス */
  tmpfilename?: string;

  /** フラグメント情報（現在/総）。不明なら null */
  fragmentIndex: number | null;
  fragmentCount: number | null;

  /** 整形済み文字列（左右の余白は trim 済み） */
  percentText?: string;
  speedText?: string;
  totalBytesText?: string;
  totalBytesEstimateText?: string;
  downloadedBytesText?: string;
  elapsedText?: string;
  etaText?: string;

  /** ytdlp が出した素のテンプレ文（trim 済み） */
  defaultTemplate?: string;
}

// ====================== パース＆正規化関数 ======================

/**
 * 1行の文字列が yt-dlp の %(progress)j 由来ならパースして返す。
 * それ以外の行は null を返す。
 */
export function parseYtDlpProgressLine(line: string): YtDlpProgress | null {
  const t = line.trim();
  if (!t || !t.startsWith("{") || !t.endsWith("}") || !t.includes('"status"')) return null;
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj === "object" && "status" in obj) {
      return obj as YtDlpProgress;
    }
  } catch {
    /* noop */
  }
  return null;
}

/** 左右の空白を削除。null/undefined はそのまま返す */
const trimOpt = (s?: string) => (typeof s === "string" ? s.trim() : s);

/**
 * 人間向けサイズ文字列（"4.21MiB" / "982.3KiB" 等）をバイトに変換。
 * 失敗時は null を返す。単位は IEC（KiB=1024）基準で解釈。
 */
export function parseHumanSizeToBytes(s?: string | null): number | null {
  if (!s) return null;
  const t = s.trim();
  if (!t || /^N\/A$/i.test(t) || /^Unknown$/i.test(t)) return null;
  const m = t.match(/^([\d.]+)\s*([KMGTP]?i)?B(?:\/s)?$/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase(); // "", "ki", "mi", ...
  const pow =
    unit === ""   ? 0 :
    unit === "ki" ? 10 :
    unit === "mi" ? 20 :
    unit === "gi" ? 30 :
    unit === "ti" ? 40 :
    unit === "pi" ? 50 : 0;
  return Math.round(value * Math.pow(2, pow));
}

/**
 * 生の progress を、数値へ寄せ、文字列は trim 済みの扱いやすい形に正規化。
 * totalBytes 不明時は totalBytesEstimate を利用して percent を推定します。
 */
export function normalizeYtDlpProgress(p: YtDlpProgress): NormalizedProgress {
  const downloaded = p.downloaded_bytes ?? null;
  const total      = p.total_bytes ?? null;
  const totalEst   = p.total_bytes_estimate ?? null;

  // percent の優先順位: _percent → (downloaded/total) → (downloaded/totalEst) → null
  const percent =
    typeof p._percent === "number" ? p._percent :
    (downloaded != null && total != null && total > 0) ? (downloaded / total) * 100 :
    (downloaded != null && totalEst != null && totalEst > 0) ? (downloaded / totalEst) * 100 :
    null;

  return {
    type: "progress",
    status: p.status,
    percent,
    downloadedBytes: downloaded,
    totalBytes: total,
    totalBytesEstimate: totalEst,
    speedBps: p.speed ?? null,
    etaSeconds: p.eta ?? null,
    elapsedSeconds: p.elapsed ?? null,
    filename: p.filename,
    tmpfilename: p.tmpfilename,
    fragmentIndex: p.fragment_index ?? null,
    fragmentCount: p.fragment_count ?? null,

    // 表示用テキストは余白をtrimしてから返す
    percentText: trimOpt(p._percent_str),
    speedText: trimOpt(p._speed_str),
    totalBytesText: trimOpt(p._total_bytes_str),
    totalBytesEstimateText: trimOpt(p._total_bytes_estimate_str),
    downloadedBytesText: trimOpt(p._downloaded_bytes_str),
    elapsedText: trimOpt(p._elapsed_str),
    etaText: trimOpt(p._eta_str),
    defaultTemplate: trimOpt(p._default_template),
  };
}
