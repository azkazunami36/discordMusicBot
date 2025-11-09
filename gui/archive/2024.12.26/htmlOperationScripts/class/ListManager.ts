import { ActiveElement } from "../../scripts/class/ActiveElement.js";
import { EventEmitter } from "../../scripts/class/EventEmitter.js";
import { naturalSort } from "../../scripts/function/naturalSort.js";

import { positionMath } from "../../scripts/function/PositionMath.js";

import { FileInfo } from "../../scripts/interfaces/FileInfo.js";
import { POSTData } from "../../scripts/interfaces/POSTData.js";

interface ListData {
    name: string;
    date: Date;
    type: string;
    tempId?: string;
};

interface ListManagerEvents {
    doubleClick: [string | undefined];
    selectItem: [string | undefined];
    openedItem: [string | undefined];
}

function getOrCreateElement(parent: HTMLElement, tagName: string): HTMLElement {
    let element = parent.getElementsByTagName(tagName)[0] as HTMLElement;
    if (!element) {
        element = document.createElement(tagName);
        parent.appendChild(element);
    }
    return element;
}


export class ListManagerV2 extends EventEmitter<ListManagerEvents> {
    private firstElement: HTMLElement;
    private mainElement: HTMLElement;
    private tableElement: HTMLElement;
    private tHeadElement: HTMLElement;
    private tBodyElement: HTMLElement;
    private tFootElement: HTMLElement;
    private activeElement: ActiveElement;
    /** リストのメイン項目 */
    listItems: {
        viewName: string;
        name: string;
        sort?: {
            sortData: any;
            sortFunction: (a: any, b: any) => number;
        }
    }[] = [];
    /** リストのソート方向 */
    sortDirection: "up" | "down" = "up";
    /** リストのデータ */
    listDatas: {
        items: { [itemName: string]: string; }
        /** クリックされたとき、選択されたときに返すデータ */
        clickedReturnData: any;
    }[] = [];
    /** ローカルリストのデータ */
    localList: {
        items: {
            [itemName: string]: string;
        }
        /** クリックされたとき、選択されたときに返すデータ */
        clickedReturnData: any;
    }[] = [];
    /** ソート中の項目名 */
    sortingName: string | undefined;
    private viewedList: {
        [id: string]: any
    }
    /**
     * @param firstElement リストのメイン要素を囲う要素なら何でもOK。マウスクリックイベントを登録する。
     * @param mainElement リストのメイン要素。tableを囲っている必要があり、スクロール位置を計算するために必要。
     * @param tableElement テーブル要素。リストの表示に使用する。
     * @param activeElement アクティブ要素クラス。リストのアクティブ要素を取得するために使用。
     */
    constructor(firstElement: HTMLElement, mainElement: HTMLElement, tableElement: HTMLElement, activeElement: ActiveElement) {
        super();
        this.firstElement = firstElement;
        this.mainElement = mainElement;
        this.tableElement = tableElement;
        this.tHeadElement = getOrCreateElement(tableElement, "thead");
        this.tBodyElement = getOrCreateElement(tableElement, "tbody");
        this.tFootElement = getOrCreateElement(tableElement, "tfoot");
        this.activeElement = activeElement;
        this.tHeadElement.innerHTML = "";
        const tr = document.createElement("tr");
        this.tHeadElement.appendChild(tr);
        for (const itemName of this.listItems) {
            const td = document.createElement("td");
            td.innerText = itemName.viewName;
            td.classList.add("sortButton");
            td.classList.add("sortName-" + btoa(encodeURIComponent(itemName.name)));
            tr.appendChild(td);
        }
        const mainScrollElement = this.mainElement;
        if (mainScrollElement) {
            let mousedownTime = Date.now();
            firstElement.addEventListener("mousedown", e => {
                let listButton = e.target as HTMLElement | null;
                const activedElement = this.tBodyElement.getElementsByClassName("activeButton")[0];
                const backgroundElementClickIs = listButton?.classList.contains("main");
                while (listButton && (!listButton?.classList?.contains("listButton") && !listButton?.classList?.contains("sortButton")))
                    listButton = listButton.parentNode as HTMLElement | null;
                if ((backgroundElementClickIs || listButton) && activedElement) activedElement.classList.remove("activeButton");
                if (listButton?.classList.contains("listButton")) {
                    listButton.classList.add("activeButton");
                    this.emit("selectItem", this.selectItemGet());
                    positionMath(listButton, mainScrollElement, 80);
                    if ((Date.now() - mousedownTime) < 250) {
                        mousedownTime = 0;
                        console.log("doubleClick");
                        this.emit("doubleClick", this.selectItemGet());
                        this.emit("openedItem", this.selectItemGet());
                    } else {
                        mousedownTime = Date.now();
                    }
                } else if (listButton?.classList.contains("sortButton")) {
                    let className: string | undefined;
                    listButton.classList.forEach(value => { if (value.includes("sortName")) className = value });
                    if (className) className = decodeURIComponent(atob(className.split("-")[1]));
                    console.log(className);
                    const sortItem = this.listItems.find(value => value.name === className);
                    this.sortingName = className;
                    if (sortItem && sortItem.sort) {
                        const sortData = sortItem.sort.sortData;
                        const sortFunction = sortItem.sort.sortFunction;
                        this.listReDraw(list => {
                            return list.sort(sortFunction);
                        });
                    } else {
                        this.listReDraw();
                    };
                }
            });
            addEventListener("keydown", this.keydown.bind(this));
        }
    }
    private keydown(e: KeyboardEvent) {
        let listButton = this.activeElement.activeElementGet();
        while (listButton && !listButton?.classList?.contains("listButton"))
            listButton = listButton.parentNode as HTMLElement | null;
        if (listButton) {
            const scrollMath = (type: "up" | "down") => {
                const activedElement = this.tBodyElement.getElementsByClassName("activeButton")[0];
                const upIs = type === "up";
                const targetElement = upIs ? activedElement?.previousElementSibling : activedElement?.nextElementSibling;
                if (targetElement) {
                    activedElement.classList.remove("activeButton");
                    targetElement.classList.add("activeButton");
                    this.emit("selectItem", this.selectItemGet());
                    positionMath(targetElement, this.mainElement, 80);
                }
            }
            switch (e.key) {
                case "ArrowDown": {
                    e.preventDefault();
                    scrollMath("down");
                    break;
                }
                case "ArrowUp": {
                    e.preventDefault();
                    scrollMath("up");
                    break;
                }
                case "Enter": {
                    e.preventDefault();
                    this.emit("openedItem", this.selectItemGet());
                    break;
                }
            }
        }
    }
    /**
     * リストの再描画
     * @param sort 
     * @returns 
     */
    listReDraw(sort?: (listData: {
        items: {
            [itemName: string]: string;
        }
        clickedReturnData: any;
    }[]) => {
        items: {
            [itemName: string]: string;
        }
        clickedReturnData: any;
    }[]) {
        this.tHeadElement.innerHTML = "";
        const tr = document.createElement("tr");
        this.tHeadElement.appendChild(tr);
        for (const itemName of this.listItems) {
            const td = document.createElement("td");
            td.innerText = itemName.viewName;
            td.classList.add("sortButton");
            td.classList.add("sortName-" + btoa(encodeURIComponent(itemName.name)));
            tr.appendChild(td);
        }
        if (!this.tBodyElement) return;
        this.tBodyElement.innerHTML = "";
        this.viewedList = {};
        const viewList = sort ? sort([...this.listDatas, ...this.localList]) : ([...this.listDatas, ...this.localList]).sort((a, b) => naturalSort(a.items[this.sortingName || "name"], b.items[this.sortingName || "name"]));
        if (this.sortDirection === "down") viewList.reverse();
        this.sortDirection = this.sortDirection === "up" ? "down" : "up";
        for (const listData of viewList) {
            const tr = document.createElement("tr");
            tr.classList.add("listButton");
            const no = String(Object.keys(this.viewedList).length);
            this.viewedList[no] = listData.clickedReturnData;
            tr.classList.add("selectingNumber-" + no);
            for (const itemName of this.listItems) {
                const td = document.createElement("td");
                td.innerText = listData.items[itemName.name] || "";
                tr.appendChild(td);
            };
            this.tBodyElement.appendChild(tr);
        }
    }
    /**
     * リストのファイル名を取得
     * @param listData 
     */
    selectItemGet() {
        const activedElement = this.tBodyElement.getElementsByClassName("activeButton")[0];
        if (activedElement) {
            let className: string | undefined;
            activedElement.classList.forEach(value => { if (value.includes("selectingNumber")) className = value });
            if (className) return this.viewedList[className.split("-")[1]];
        }
    }
};


export class ListManager extends EventEmitter<ListManagerEvents> {
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
        }
    }[] = [];
    /**
     * リストのソート方向
     */
    sortDirection: "up" | "down" = "up";
    /**
     * リストのデータ
     */
    listDatas: {
        [itemName: string]: string;
    }[] = [];
    /**
     * ローカルリストのデータ
     */
    localList: {
        [itemName: string]: string;
    }[] = [];
    /**
     * ソート中の項目名
     */
    sortingName: string | undefined;
    constructor(firstElement: HTMLElement, mainElement: HTMLElement, tableElement: HTMLElement, activeElement: ActiveElement) {
        super();
        this.firstElement = firstElement;
        this.mainElement = mainElement;
        this.tableElement = tableElement;
        this.tHeadElement = getOrCreateElement(tableElement, "thead");
        this.tBodyElement = getOrCreateElement(tableElement, "tbody");
        this.tFootElement = getOrCreateElement(tableElement, "tfoot");
        this.activeElement = activeElement;
        this.tHeadElement.innerHTML = "";
        const tr = document.createElement("tr");
        this.tHeadElement.appendChild(tr);
        for (const itemName of this.listItems) {
            const td = document.createElement("td");
            td.innerText = itemName.viewName;
            td.classList.add("sortButton");
            td.classList.add("sortName-" + btoa(encodeURIComponent(itemName.name)));
            tr.appendChild(td);
        }
        const mainScrollElement = this.mainElement;
        if (mainScrollElement) {
            let mousedownTime = Date.now();
            firstElement.addEventListener("mousedown", e => {
                let listButton = e.target as HTMLElement | null;
                const activedElement = this.tBodyElement.getElementsByClassName("activeButton")[0];
                const backgroundElementClickIs = listButton?.classList.contains("main");
                while (listButton && (!listButton?.classList?.contains("listButton") && !listButton?.classList?.contains("sortButton")))
                    listButton = listButton.parentNode as HTMLElement | null;
                if ((backgroundElementClickIs || listButton) && activedElement) activedElement.classList.remove("activeButton");
                if (listButton?.classList.contains("listButton")) {
                    listButton.classList.add("activeButton");
                    this.emit("selectItem", this.selectNameGet());
                    positionMath(listButton, mainScrollElement, 80);
                    if ((Date.now() - mousedownTime) < 250) {
                        mousedownTime = 0;
                        console.log("doubleClick");
                        const activedElement = this.firstElement.getElementsByClassName("activeButton")[0];
                        let className: string | undefined;
                        if (activedElement)
                            activedElement.classList.forEach(value => { if (value.includes("selectingName")) className = value });
                        if (className) className = decodeURIComponent(atob(className.split("-")[1]));
                        this.emit("doubleClick", className);
                    } else {
                        mousedownTime = Date.now();
                    }
                } else if (listButton?.classList.contains("sortButton")) {
                    let className: string | undefined;
                    listButton.classList.forEach(value => { if (value.includes("sortName")) className = value });
                    if (className) className = decodeURIComponent(atob(className.split("-")[1]));
                    console.log(className);
                    const sortItem = this.listItems.find(value => value.name === className);
                    this.sortingName = className;
                    if (sortItem && sortItem.sort) {
                        const sortData = sortItem.sort.sortData;
                        const sortFunction = sortItem.sort.sortFunction;
                        this.listReDraw(list => {
                            return list.sort(sortFunction);
                        });
                    } else {
                        this.listReDraw();
                    };
                }
            });
            addEventListener("keydown", this.keydown.bind(this));
        }
    }
    private keydown(e: KeyboardEvent) {
        let listButton = this.activeElement.activeElementGet();
        while (listButton && !listButton?.classList?.contains("listButton"))
            listButton = listButton.parentNode as HTMLElement | null;
        if (listButton) {
            const scrollMath = (type: "up" | "down") => {
                const activedElement = this.tBodyElement.getElementsByClassName("activeButton")[0];
                const upIs = type === "up";
                const targetElement = upIs ? activedElement?.previousElementSibling : activedElement?.nextElementSibling;
                if (targetElement) {
                    activedElement.classList.remove("activeButton");
                    targetElement.classList.add("activeButton");
                    this.emit("selectItem", this.selectNameGet());
                    positionMath(targetElement, this.mainElement, 80);
                }
            }
            switch (e.key) {
                case "ArrowDown": {
                    e.preventDefault();
                    scrollMath("down");
                    break;
                }
                case "ArrowUp": {
                    e.preventDefault();
                    scrollMath("up");
                    break;
                }
            }
        }
    }
    /**
     * リストの再描画
     * @param sort 
     * @returns 
     */
    listReDraw(sort?: (listData: { [itemName: string]: string }[]) => { [itemName: string]: string }[]) {
        this.tHeadElement.innerHTML = "";
        const tr = document.createElement("tr");
        this.tHeadElement.appendChild(tr);
        for (const itemName of this.listItems) {
            const td = document.createElement("td");
            td.innerText = itemName.viewName;
            td.classList.add("sortButton");
            td.classList.add("sortName-" + btoa(encodeURIComponent(itemName.name)));
            tr.appendChild(td);
        }
        if (!this.tBodyElement) return;
        this.tBodyElement.innerHTML = "";
        const viewList = sort ? sort([...this.listDatas, ...this.localList]) : ([...this.listDatas, ...this.localList]).sort((a, b) => naturalSort(a[this.sortingName || "name"], b[this.sortingName || "name"]));
        if (this.sortDirection === "down") viewList.reverse();
        this.sortDirection = this.sortDirection === "up" ? "down" : "up";
        for (const listData of viewList) {
            const tr = document.createElement("tr");
            tr.classList.add("listButton");
            tr.classList.add("selectingName-" + btoa(encodeURIComponent(listData.name)));
            for (const itemName of this.listItems) {
                const td = document.createElement("td");
                td.innerText = listData[itemName.name] || "";
                tr.appendChild(td);
            };
            this.tBodyElement.appendChild(tr);
        }
    }
    /**
     * リストのファイル名を取得
     * @param listData 
     */
    selectNameGet() {
        const activedElement = this.tBodyElement.getElementsByClassName("activeButton")[0];
        if (activedElement) {
            let className: string | undefined;
            activedElement.classList.forEach(value => { if (value.includes("selectingName")) className = value });
            if (className) {
                const fileName = decodeURIComponent(atob(className.split("-")[1]));
                return fileName;
            }
        }
    }
};
