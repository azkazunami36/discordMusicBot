export function numberToTimeString(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "0秒"; // 不正値は0秒扱い
  }

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}時間${m}分${s}秒`;
  } else if (m > 0) {
    return `${m}分${s}秒`;
  } else {
    return `${s}秒`;
  }
}
