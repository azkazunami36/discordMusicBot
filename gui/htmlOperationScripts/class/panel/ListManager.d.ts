import { ActiveElement } from "../../scripts/class/ActiveElement.js";
import { EventEmitter } from "../../scripts/class/EventEmitter.js";
interface ListManagerEvents {
    doubleClick: [string | undefined];
    selectItem: [string | undefined];
    openedItem: [string | undefined];
}
export declare class ListManagerV2 extends EventEmitter<ListManagerEvents> {
    firstElement: HTMLElement;
    mainElement: HTMLElement;
    tableElement: HTMLElement;
    tHeadElement: HTMLElement;
    tBodyElement: HTMLElement;
    tFootElement: HTMLElement;
    activeElement: ActiveElement;
    /**
     * リストのメイン項目
     */
    listItems: {
        viewName: string;
        name: string;
        sort?: {
            sortData: any;
            sortFunction: (a: any, b: any) => number;
        };
    }[];
    /**
     * リストのソート方向
     */
    sortDirection: "up" | "down";
    /**
     * リストのデータ
     */
    listDatas: {
        items: {
            [itemName: string]: string;
        };
        /**
         * クリックされたとき、選択されたときに返すデータ
         */
        clickedReturnData: any;
    }[];
    /**
     * ローカルリストのデータ
     */
    localList: {
        items: {
            [itemName: string]: string;
        };
        /**
         * クリックされたとき、選択されたときに返すデータ
         */
        clickedReturnData: any;
    }[];
    /**
     * ソート中の項目名
     */
    sortingName: string | undefined;
    private viewedList;
    /**
     *
     * @param firstElement リストのメイン要素を囲う要素なら何でもOK。マウスクリックイベントを登録する。
     * @param mainElement リストのメイン要素。tableを囲っている必要があり、スクロール位置を計算するために必要。
     * @param tableElement テーブル要素。リストの表示に使用する。
     * @param activeElement アクティブ要素クラス。リストのアクティブ要素を取得するために使用。
     */
    constructor(firstElement: HTMLElement, mainElement: HTMLElement, tableElement: HTMLElement, activeElement: ActiveElement);
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
        clickedReturnData: any;
    }[]) => {
        items: {
            [itemName: string]: string;
        };
        clickedReturnData: any;
    }[]): void;
    /**
     * リストのファイル名を取得
     * @param listData
     */
    selectItemGet(): any;
}
export declare class ListManager extends EventEmitter<ListManagerEvents> {
    firstElement: HTMLElement;
    mainElement: HTMLElement;
    tableElement: HTMLElement;
    tHeadElement: HTMLElement;
    tBodyElement: HTMLElement;
    tFootElement: HTMLElement;
    activeElement: ActiveElement;
    /**
     * リストのメイン項目
     */
    listItems: {
        viewName: string;
        name: string;
        sort?: {
            sortData: any;
            sortFunction: (a: any, b: any) => number;
        };
    }[];
    /**
     * リストのソート方向
     */
    sortDirection: "up" | "down";
    /**
     * リストのデータ
     */
    listDatas: {
        [itemName: string]: string;
    }[];
    /**
     * ローカルリストのデータ
     */
    localList: {
        [itemName: string]: string;
    }[];
    /**
     * ソート中の項目名
     */
    sortingName: string | undefined;
    constructor(firstElement: HTMLElement, mainElement: HTMLElement, tableElement: HTMLElement, activeElement: ActiveElement);
    private keydown;
    /**
     * リストの再描画
     * @param sort
     * @returns
     */
    listReDraw(sort?: (listData: {
        [itemName: string]: string;
    }[]) => {
        [itemName: string]: string;
    }[]): void;
    /**
     * リストのファイル名を取得
     * @param listData
     */
    selectNameGet(): string | undefined;
}
export {};
