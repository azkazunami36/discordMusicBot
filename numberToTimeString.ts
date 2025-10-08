export function numberToTimeString(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "0秒"; // 不正値は0秒扱い
  }

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  const outStr = `${h ? h + "時間" : ""}${m ? m + "分" : ""}${s ? Math.floor(s) + "秒" : ""}`;
  return outStr !== "" ? outStr : "0秒";
}
