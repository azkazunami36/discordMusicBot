/**
 * 指定された要素をスクロールエリアの中央に持ってくる
 * @param targetElement 目標の要素
 * @param scrollElement スクロールする親要素
 * @param margin スクロールする際のマージン
 */
export function positionMath(targetElement: Element, scrollElement: Element, margin: number) {
    const baseTop = targetElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top
    const upElementTop = baseTop - margin;
    const downElementTop = baseTop - (scrollElement.clientHeight - margin);
    if (downElementTop > 0) scrollElement.scrollTo({ top: scrollElement.scrollTop + downElementTop, behavior: "smooth" });
    if (upElementTop < 0) scrollElement.scrollTo({ top: scrollElement.scrollTop + upElementTop, behavior: "smooth" });
};
