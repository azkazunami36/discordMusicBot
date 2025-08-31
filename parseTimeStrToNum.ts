/**
 * Created by ChatGPT 5.
 * 文字列の時間表現を「秒の number」に変換します。
 * - 対応: "h:m:s" / "m:s" / 単位「時間・分・秒」/ 数字のみ（秒）
 * - 全角数字や全角コロン等は半角に正規化
 * - 不正表記（数字以外が混ざる等）は null を返す
 */
export function parseStrToNum(input: string): number | undefined {
  if (typeof input !== "string") return undefined;

  // 全角→半角 正規化（数字／コロン／スペース）
  const s = input
    .replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    .replace(/：/g, ":")
    .replace(/\u3000/g, " ")
    .trim();

  if (!s) return undefined;

  // 1) 単位表記（全文一致）
  //   例: "3時間2秒" / "1時間3分45秒" / "10秒" / "5分"
  //   順不同を許すなら別ロジックが必要だが、ここでは一般的な順（時→分→秒）を想定
  const unitRe = /^\s*(?:(\d+)\s*時間)?\s*(?:(\d+)\s*分)?\s*(?:(\d+)\s*秒)?\s*$/;
  const u = s.match(unitRe);
  if (u && (u[1] !== undefined || u[2] !== undefined || u[3] !== undefined)) {
    const h = u[1] ? parseInt(u[1], 10) : 0;
    const m = u[2] ? parseInt(u[2], 10) : 0;
    const sec = u[3] ? parseInt(u[3], 10) : 0;
    return h * 3600 + m * 60 + sec;
  }

  // 2) コロン区切り（h:m:s / m:s）。各パートは数字のみを許可
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length === 2 || parts.length === 3) {
      if (!parts.every(p => /^\d+$/.test(p))) return undefined;
      const nums = parts.map(p => parseInt(p, 10));
      if (nums.length === 3) {
        const [h, m, sec] = nums;
        return h * 3600 + m * 60 + sec;
      } else {
        const [m, sec] = nums;
        return m * 60 + sec;
      }
    } else {
      return undefined; // 4パート以上・1パートは不正
    }
  }

  // 3) 数字のみ → 秒
  if (/^\d+$/.test(s)) {
    return parseInt(s, 10);
  }

  // ここまでで解釈できなければ不正
  return undefined;
}
