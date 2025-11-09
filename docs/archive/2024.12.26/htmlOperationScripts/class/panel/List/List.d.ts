import { ActiveElement } from "../../../../scripts/class/ActiveElement.js";
import { EventEmitter } from "../../../../scripts/class/EventEmitter.js";
interface ListManagerEvents {
    doubleClick: [any];
    selectItem: [any];
    openedItem: [any];
}
export declare class ListPanel extends EventEmitter<ListManagerEvents> {
    firstElement: HTMLElement;
    mainElement: HTMLElement;
    tableElement: HTMLElement;
    tHeadElement: HTMLElement;
    tBodyElement: HTMLElement;
    tFootElement: HTMLElement;
    activeElement: ActiveElement;
    /** リストのメイン項目 */
    listItems: {
        viewName: string;
        name: string;
        sort?: {
            sortFunction: (listData: {
                items: {
                    [itemName: string]: string;
                };
                clickedReturnData?: any;
                sortData?: {
                    [itemName: string]: string;
                };
            }[]) => {
                items: {
                    [itemName: string]: string;
                };
                clickedReturnData?: any;
                sortData?: {
                    [itemName: string]: string;
                };
            }[];
        };
    }[];
    /** リストのソート方向 */
    sortDirection: "up" | "down";
    /** リストのデータ */
    listDatas: {
        items: {
            [itemName: string]: string;
        };
        /** クリックされたとき、選択されたときに返すデータ。空だとitemsと同じデータを返す。 */
        clickedReturnData?: any;
        /** sortの際にitems内より優先度をあげ、ソートの時の参考データにする。 */
        sortData?: {
            [itemName: string]: string;
        };
    }[];
    /** ローカルリストのデータ */
    localList: {
        items: {
            [itemName: string]: string;
        };
        /** クリックされたとき、選択されたときに返すデータ。空だとitemsと同じデータを返す。 */
        clickedReturnData?: any;
        /** sortの際にitems内より優先度をあげ、ソートの時の参考データにする。 */
        sortData?: {
            [itemName: string]: string;
        };
    }[];
    /** ソート中の項目名 */
    sortingName: string | undefined;
    refleshRequest: ((progress: (progressData: {
        total: number;
        now: number;
    }) => void) => Promise<void>) | undefined;
    private viewedList;
    private listReflashing;
    /**
     * @param firstElement リストのメイン要素を囲う要素なら何でもOK。マウスクリックイベントを登録する。
     * @param mainElement リストのメイン要素。tableを囲っている必要があり、スクロール位置を計算するために必要。
     * @param activeElement アクティブ要素クラス。リストのアクティブ要素を取得するために使用。
     */
    constructor(firstElement: HTMLElement, mainElement: HTMLElement, activeElement: ActiveElement);
    private getOrCreateElement;
    private keydown;
    /**
     * リストの再描画
     * @param sort
     * @returns
     */
    listReDraw(sort?: (listData: {
        items: {
            [itemName: string]: string;
        };
        clickedReturnData?: any;
        sortData?: {
            [itemName: string]: string;
        };
    }[]) => {
        items: {
            [itemName: string]: string;
        };
        clickedReturnData?: any;
        sortData?: {
            [itemName: string]: string;
        };
    }[]): void;
    /**
     * リストのファイル名を取得
     * @param listData
     */
    selectItemGet(): any;
    listReflash(loadingBlankIs?: boolean): Promise<void>;
}
export {};
