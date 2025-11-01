/** yt-dlp -j の1エントリ（X/Twitterのツイート内メディア） */
export interface YtDlpInfo {
    /** メディアID（動画IDなど。ツイートIDとは別の場合あり） */
    id?: string;

    /** タイトル（ツイート本文の先頭や #n 番手などが付くことあり） */
    title?: string;

    /** ツイート本文などの説明（URLやハッシュタグを含むことあり） */
    description?: string;

    /** 投稿者表示名 */
    uploader?: string;

    /** 投稿日のUNIXタイム秒（例: 1757241182） */
    timestamp?: number;

    /** 公開状態（public/unlisted/private など） */
    availability?: string;
    /** ライブ配信か（過去のライブ含む） */
    is_live?: boolean;
    /** 以前ライブだったか（アーカイブ） */
    was_live?: boolean;

    /** チャンネルID（XのユーザーIDに近い概念） */
    channel_id?: string;

    /** 投稿者のユーザーID（@なし） */
    uploader_id?: string;

    /** 投稿者プロフィールURL */
    uploader_url?: string;

    /** いいね数（未取得時は null） */
    like_count?: number | null;

    /** リポスト数（未取得時は null） */
    repost_count?: number | null;

    /** コメント数（未取得時は null） */
    comment_count?: number | null;

    /** チャンネル名（YouTube等） */
    channel?: string;
    /** チャンネルのフォロワー/登録者数 */
    channel_follower_count?: number;

    /** 年齢制限（0=なし） */
    age_limit?: number;

    /** ハッシュタグ等（抽出されれば入る） */
    tags?: string[];

    /** プラットフォーム側のジャンル（配列） */
    genres?: string[];
    /** プラットフォーム側のジャンル（単数形） */
    genre?: string | null;

    /** ダウンロード可能な映像・音声フォーマット一覧 */
    formats?: YtDlpFormat[];

    /** 自動字幕等（サイトにより構造が変わる） */
    subtitles?: Record<string, unknown>;

    /** 自動生成字幕（言語ごとの配列） */
    automatic_captions?: Record<string, YtDlpCaptionTrack[]>;

    /** サムネイル一覧（サイズ別） */
    thumbnails?: YtDlpThumbnail[];

    /** 再生数（未取得時は null） */
    view_count?: number | null;

    /** 動画の秒数（音声のみでも入ることあり） */
    duration?: number;

    /** フォーマットのソート基準（yt-dlp 内部用のヒント） */
    _format_sort_fields?: string[];

    /** 表示用ID（多くはツイートID/URL末尾の数値） */
    display_id?: string;

    /** アーカイブ互換用の過去IDたち（内部用） */
    _old_archive_ids?: string[];

    /** プレイリストの総エントリ数（ツイート内に複数動画がある場合など） */
    playlist_count?: number;

    /** プレイリスト（ツイート全体の表示名） */
    playlist?: string;

    /** プレイリストID（多くはツイートID） */
    playlist_id?: string;

    /** プレイリストタイトル */
    playlist_title?: string;

    /** プレイリストのアップローダ（表示名） */
    playlist_uploader?: string;

    /** プレイリストのアップローダID */
    playlist_uploader_id?: string;

    /** プレイリストのチャンネル（空のことが多い） */
    playlist_channel?: string | null;

    /** プレイリストのチャンネルID */
    playlist_channel_id?: string;

    /** プレイリストのWebページURL（ツイートURLなど） */
    playlist_webpage_url?: string;

    /** プレイリスト内でのこのエントリのインデックス（1始まり） */
    playlist_index?: number;

    /** この呼び出しで最後に処理したインデックス（内部用） */
    __last_playlist_index?: number;

    /** どの抽出器が使われたか（例: "twitter"） */
    extractor?: string;

    /** 抽出器キー（例: "Twitter"） */
    extractor_key?: string;

    /** 自動連番（プレイリスト時に #1, #2 的な番号） */
    playlist_autonumber?: number;

    /** 代表サムネイルURL（最大解像度とは限らない） */
    thumbnail?: string;

    /** 完全タイトル（titleより具体化されたり #n が付くことあり） */
    fulltitle?: string;

    /** "1:51" のような再生時間の文字列表現 */
    duration_string?: string;

    /** 章情報（プラットフォームにより未提供のこともある） */
    chapters?: Array<{ start_time: number; title?: string; end_time?: number }>|null;
    /** YouTube等のヒートマップ情報（仕様未定義。未提供時はnull） */
    heatmap?: unknown | null;

    /** アップロード日（YYYYMMDDの文字列） */
    upload_date?: string;

    /** リリース年（あれば入る） */
    release_year?: number | null;

    /** リリース時刻（UNIX秒。未提供時はnull） */
    release_timestamp?: number | null;

    /** リクエストされた字幕設定（内部用） */
    requested_subtitles?: unknown;

    /** DRMの有無（内部用、nullが来ることも） */
    _has_drm?: boolean | null;

    /** 実行時のエポック秒（取得時刻） */
    epoch?: number;

    /** 最終的に選ばれたフォーマットの組（動画+音声など） */
    requested_formats?: YtDlpFormat[];

    /** 表示用のフォーマット要約（例: "hls-925 - 960x720+..."） */
    format?: string;

    /** 最終フォーマットのID（結合形式の場合は複合ID） */
    format_id?: string;

    /** 想定拡張子（例: "mp4"） */
    ext?: string;

    /** 使用プロトコル（例: "m3u8_native+m3u8_native"） */
    protocol?: string;

    /** 言語（未設定のことが多い） */
    language?: string | null;

    /** フォーマット注記（Audio, high など） */
    format_note?: string;

    /** 推定ファイルサイズ（わからないと null） */
    filesize_approx?: number | null;

    /** 合算ビットレート（kbps相当。映像vbr+音声abr） */
    tbr?: number | null;

    /** 幅（ピクセル） */
    width?: number;

    /** 高さ（ピクセル） */
    height?: number;

    /** "960x720" のような解像度文字列 */
    resolution?: string;

    /** フレームレート（未取得時は null） */
    fps?: number | null;

    /** ダイナミックレンジ（SDR/HDR 等） */
    dynamic_range?: string;

    /** 元ページのオリジナルURL（リダイレクト前など） */
    original_url?: string;

    /** 映像コーデック（例: "avc1.640020"） */
    vcodec?: string | null;

    /** 映像ビットレート（kbps相当。未取得時は null） */
    vbr?: number | null;

    /** 画面比率（1.33, 1.78 など。未取得時は null） */
    aspect_ratio?: number | null;

    /** アスペクトを引き延ばしている倍率（未使用が多い） */
    stretched_ratio?: number | null;

    /** 音声コーデック（null のことも） */
    acodec?: string | null;

    /** 音声ビットレート（kbps相当） */
    abr?: number | null;

    /** サンプリングレート（Hz。未取得時は null） */
    asr?: number | null;

    /** チャンネル数（未取得時は null） */
    audio_channels?: number | null;

    /** yt-dlp が決めた最終的なファイル名（整形済み） */
    _filename?: string;

    /** 人が読む用のファイル名（多くは _filename と同じ） */
    filename?: string;

    /** エントリ種別（video / playlist / url など。ここでは "video"） */
    _type?: string;

    /** 実行した yt-dlp のバージョン情報 */
    _version?: YtDlpVersion;

    /** 取得元ページのURL（ツイートURL） */
    webpage_url?: string;

    /** 取得元ページのベース名（多くはツイートID） */
    webpage_url_basename?: string;

    /** 取得元ドメイン（x.com など） */
    webpage_url_domain?: string;
}

/** ダウンロード/結合可能なフォーマットの1つ（または requested_formats の要素） */
export interface YtDlpFormat {
    /** フォーマットID（例: "hls-925" / "http-2176" など） */
    format_id?: string;

    /** 追加注記（Audio, high / low 等） */
    format_note?: string | null;

    /** フォーマットの並び順（nullが一般的） */
    format_index?: number | null;

    /** 実体URL（m3u8やmp4直リンクなど） */
    url?: string;

    /** マニフェストURL（m3u8の親） */
    manifest_url?: string;

    /** 言語（未設定のことが多い） */
    language?: string | null;

    /** 拡張子（例: "mp4"） */
    ext?: string | null;

    /** 使用プロトコル（https / m3u8_native など） */
    protocol?: string;

    /** 優先度（数値が大きいほど優先。nullのことも） */
    preference?: number | null;

    /** 品質スコア（nullのことも） */
    quality?: number | null;

    /** DRMの有無（基本 false） */
    has_drm?: boolean;

    /** 映像コーデック（音声のみなら "none"） */
    vcodec?: string;

    /** 音声コーデック（例: "aac" / "opus" / "none"） */
    acodec?: string;

    /** ソースの優先度（内部用。0,1,2など） */
    source_preference?: number | null;

    /** 合算ビットレート（kbps相当） */
    tbr?: number | null;

    /** 音声拡張子（例: "mp4" / "none"） */
    audio_ext?: string;

    /** 映像拡張子（例: "mp4" / "none"） */
    video_ext?: string;

    /** 映像ビットレート（kbps相当。null可） */
    vbr?: number | null;

    /** 音声ビットレート（kbps相当。null可） */
    abr?: number | null;

    /** 解像度の文字列表記（"960x720"、"audio only"等） */
    resolution?: string;

    /** ダイナミックレンジ（SDR/HDR 等） */
    dynamic_range?: string;

    /** コンテナ形式（例: "webm_dash" / "mp4_dash" など） */
    container?: string;

    /** このフォーマットが利用可能になったUNIX時刻（秒） */
    available_at?: number;

    /** ダウンローダ向けの追加オプション（HTTP分割サイズなど） */
    downloader_options?: {
        /** HTTPで分割取得するチャンクサイズ（バイト） */
        http_chunk_size?: number;
    } | null;

    /** 推定ではない実サイズ（取得できる場合のみ、バイト） */
    filesize?: number | null;

    /** 幅（px） */
    width?: number | null;

    /** 高さ（px） */
    height?: number | null;

    /** フレームレート（null可） */
    fps?: number | null;

    /** 画面比率（1.33など。null可） */
    aspect_ratio?: number | null;

    /** 推定ファイルサイズ（バイト。approx） */
    filesize_approx?: number | null;

    /** HTTP時に付与されるヘッダ（User-Agent等） */
    http_headers?: Record<string, string>;

    /** 署名付きURL等で使われるCookie文字列（サイト依存） */
    cookies?: string;

    /** 人が読む用の短いフォーマット説明（yt-dlp生成） */
    format?: string;
}

/** サムネイル（サイズ・解像度別） */
export interface YtDlpThumbnail {
    /** サムネイルのID（thumb/small/medium/large/orig 等） */
    id?: string;

    /** CDN上のURL（pbs.twimg.com 等） */
    url?: string;

    /** 幅（px） */
    width?: number;

    /** 高さ（px） */
    height?: number;

    /** "1184x888" のような表記 */
    resolution?: string;

    /** サムネ拡張子（jpg/png 等） */
    ext?: string;
    /** 優先度（大きいほど優先。null可） */
    preference?: number | null;
}

/** 自動キャプション/字幕の1トラック */
export interface YtDlpCaptionTrack {
    /** 形式（vtt/srt/ttml/srv1/srv2/srv3 など） */
    ext?: string;
    /** 取得URL */
    url?: string;
    /** トラック表示名（存在すれば） */
    name?: string;
    /** 内部フラグ：偽装クライアント使用の有無 */
    impersonate?: boolean;
    /** 内部的に使われるクライアント識別子 */
    __yt_dlp_client?: string;
    /** YouTube固有の字幕ID（存在すれば） */
    vss_id?: string;
    /** 言語コード（存在すれば） */
    lang?: string;
    /** 翻訳先言語コード（存在すれば） */
    tlang?: string;
    /** 字幕の種類（asr=自動生成など。存在すれば） */
    kind?: string;
    /** サーバが要求するフォーマット拡張（存在すれば） */
    fmt?: string;
}

/** 実行時の yt-dlp バージョン情報 */
export interface YtDlpVersion {
    /** バージョン文字列（例: "2025.10.14"） */
    version?: string;

    /** 現在のgit HEAD（配布版では null が多い） */
    current_git_head?: string | null;

    /** リリース時のgit HEAD */
    release_git_head?: string | null;

    /** リポジトリ表記（"yt-dlp/yt-dlp"） */
    repository?: string;
}

/**
 * yt-dlpのformatsから最も良い「音質」を狙って1件を選びます。
 *
 * 方針:
 * - DRM付きは除外します。
 * - 音声を含むもの（acodec!=='none' or resolutionに"audio only" or audio_ext!=='none'）を候補に。
 * - スコアリングで比較：
 *   1) 音声ビットレート(abr) 最重視（降順）
 *   2) それが無ければtbrで代替
 *   3) コーデック優先度（opus/flac/alac/pcm > aac > mp3 > vorbis > その他）
 *   4) 同点付近では「音声のみ」を優先（同品質なら無駄のない音声トラックを選ぶ）
 *   5) format_noteのキーワード（high/medium/main audio）を微加点
 *
 * 注意:
 * - 純音声が見つからない/低品質な場合、**映像付きのフォーマット**を返すことがあります。
 * - asr(サンプリングレート)はフォーマットに存在しないことがあるため、ここでは使用しません。
 */
export function pickBestAudioFormat(formats: YtDlpFormat[]): YtDlpFormat | undefined {
  if (!Array.isArray(formats) || formats.length === 0) return undefined;

  const candidates = formats.filter((f) => hasUsableAudio(f) && !f.has_drm);
  if (candidates.length === 0) return undefined;

  // スコア計算 + 安全なソートキーを作る
  const scored = candidates.map((f) => ({ f, score: scoreFormat(f) }));

  scored.sort((a, b) => {
    // まずは総合スコア（降順）
    const s = b.score - a.score;
    if (s !== 0) return s;

    // 次点: abr（降順）
    const abrDiff = num(b.f.abr) - num(a.f.abr);
    if (abrDiff !== 0) return abrDiff;

    // 次点: コーデック優先度（降順）
    const cr = codecRank((b.f.acodec ?? "").toLowerCase()) - codecRank((a.f.acodec ?? "").toLowerCase());
    if (cr !== 0) return cr;

    // 次点: 「音声のみ」を優先
    const ao = boolScore(isAudioOnly(b.f)) - boolScore(isAudioOnly(a.f));
    if (ao !== 0) return ao;

    // 最後: tbr 降順
    return num(b.f.tbr) - num(a.f.tbr);
  });

  return scored[0]?.f;

  /** f に音声が含まれるかの緩め判定 */
  function hasUsableAudio(f: YtDlpFormat): boolean {
    const ac = (f.acodec ?? '').toLowerCase();
    const res = (f.resolution ?? '').toLowerCase();
    const aext = (f.audio_ext ?? '').toLowerCase();
    if (ac && ac !== 'none') return true;
    if (res.includes('audio only')) return true;
    if (aext && aext !== 'none') return true;
    return false;
  }

  /** 音声のみ（＝映像なし）をできるだけ素直に判定 */
  function isAudioOnly(f: YtDlpFormat): boolean {
    const res = (f.resolution ?? '').toLowerCase();
    const vext = (f.video_ext ?? '').toLowerCase();
    const vc = (f.vcodec ?? '').toLowerCase();
    return res.includes('audio only') || vext === 'none' || vc === 'none';
  }

  /** 総合スコア（大きいほど良い） */
  function scoreFormat(f: YtDlpFormat): number {
    let score = 0;

    // 1) ビットレート重視
    score += num(f.abr) * 10;   // 音声ビットレート最重視
    score += num(f.tbr) * 5;    // 総合ビットレートは補助

    // 2) コーデック優先度
    score += codecRank((f.acodec ?? '').toLowerCase()) * 100;

    // 3) 音声のみは微加点（同音質ならこちらを優先）
    if (isAudioOnly(f)) score += 50;

    // 4) format_note ヒント
    const note = (f.format_note ?? '').toLowerCase();
    if (note.includes('high')) score += 30;
    else if (note.includes('medium')) score += 15;
    if (note.includes('main audio')) score += 20;

    // 5) コンテナとコーデックの整合で微調整（一般的傾向）
    const ext = (f.ext ?? '').toLowerCase();
    const cont = (f.container ?? '').toLowerCase();
    const ac = (f.acodec ?? '').toLowerCase();
    if (ac === 'opus' && (ext === 'webm' || cont.includes('webm'))) score += 10;
    if (ac === 'aac'  && (ext === 'm4a'  || cont.includes('mp4')))  score += 5;

    return score;
  }

  /** コーデックの優先度を返す（高いほど好ましい） */
  function codecRank(acodec: string): number {
    if (!acodec) return 0;
    if (/(flac|alac)/.test(acodec)) return 6; // 可逆
    if (/(pcm|wav|lpcm)/.test(acodec)) return 5; // 非圧縮系（実際は稀）
    if (/opus/.test(acodec)) return 4;
    if (/aac|mp4a/.test(acodec)) return 3;
    if (/mp3/.test(acodec)) return 2;
    if (/vorbis/.test(acodec)) return 1;
    return 0;
  }

  function num(n: number | null | undefined): number {
    return typeof n === 'number' && isFinite(n) ? n : 0;
  }
  function boolScore(b: boolean): number { return b ? 1 : 0; }
}

/**
 * サムネイル配列から「最も画質が良い」1枚を選びます。
 *
 * 方針:
 * - preference が大きいものを優先（存在する場合）
 * - 次に 面積(width*height) の大きいものを優先
 * - 次に 幅/高さ の大きいもの
 * - 最後に id の優先度（orig > large > medium > small > thumb > その他）
 * - width/height が無い場合は resolution("WxH") をパースして比較
 *
 * 返り値:
 * - 見つからなければ undefined
 */
export function pickBestThumbnail(thumbnails: YtDlpThumbnail[]): YtDlpThumbnail | undefined {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return undefined;

  // スコアリングのために正規化
  const scored = thumbnails.map((t) => {
    const { width, height } = normalizeSize(t);
    const pref = t.preference == null ? 0 : (typeof t.preference === 'number' && isFinite(t.preference) ? t.preference : 0);
    const idRank = idPriority((t.id ?? '').toLowerCase());
    const area = (width ?? 0) * (height ?? 0);
    return { t, pref, area, width: width ?? 0, height: height ?? 0, idRank };
  });

  scored.sort((a, b) => {
    if (b.pref !== a.pref) return b.pref - a.pref;                 // preference 大きい方
    if (b.area !== a.area) return b.area - a.area;                 // 面積大きい方
    if (b.width !== a.width) return b.width - a.width;             // 幅大きい方
    if (b.height !== a.height) return b.height - a.height;         // 高さ大きい方
    if (b.idRank !== a.idRank) return b.idRank - a.idRank;         // id 優先度
    return 0;
  });

  return scored[0]?.t;

  /** width/height が欠けている場合、resolution("WxH") から補う */
  function normalizeSize(t: YtDlpThumbnail): { width?: number; height?: number } {
    let { width, height } = t;
    if ((width == null || height == null) && t.resolution) {
      const m = String(t.resolution).match(/(\d+)x(\d+)/i);
      if (m) {
        const w = parseInt(m[1], 10);
        const h = parseInt(m[2], 10);
        if (!width) width = isFinite(w) ? w : undefined;
        if (!height) height = isFinite(h) ? h : undefined;
      }
    }
    return { width, height };
  }

  /** id の優先順位を返す（大きいほど優先） */
  function idPriority(id: string): number {
    if (!id) return 0;
    if (id.includes('orig'))  return 5;
    if (id.includes('large')) return 4;
    if (id.includes('medium'))return 3;
    if (id.includes('small')) return 2;
    if (id.includes('thumb')) return 1;
    return 0;
  }
}

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
