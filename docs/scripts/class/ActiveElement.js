export class ActiveElement {
    activeElement = null;
    constructor() {
        addEventListener("click", e => { if (e.target)
            this.activeElement = e.target; });
    }
    activeElementGet() { return this.activeElement; }
    ;
}
