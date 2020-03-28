import * as _ from "lodash";

interface IDataEntry {
    x: number;
    y: number;

    width: number;
    height: number;

    data?: any;
}

export default class RTree {
    root: RTreeRectangle = RTreeRectangle.GenerateEmptyNode();

    constructor(private maxNodes: number) {}

    Search(searchBoundary: IDataEntry): Array<any> {
        const searchRect = new RTreeRectangle(searchBoundary.x, searchBoundary.y, searchBoundary.width, searchBoundary.height, null);
        return this.RecursiveSeach(searchRect, this.root);
    }

    Insert(dataPoint: IDataEntry): void {
        const insertRect = new RTreeRectangle(dataPoint.x, dataPoint.y, dataPoint.width, dataPoint.height, dataPoint.data);

        let currentNode: RTreeRectangle = this.root;

        while (!currentNode.HasLeafNodes()) {
            // Grow the current node's bounding rectangle
            currentNode.GrowRectangleToFit(insertRect);

            // Decide the subsequent node to "travel" to
            currentNode = _.minBy(currentNode.children, _.method("areaIfGrownBy", insertRect)) as RTreeRectangle;
        }

        // We have discovered the correct node to insert this leaf
        currentNode.InsertChildRectangle(insertRect);

        // Execute the balance routine
        this.BalanceTreePath(insertRect);
    }

    BatchInsert(listOfData: Array<IDataEntry>) {
        const listOfRectangles = _.map(listOfData, dataPoint => {
            return new RTreeRectangle(dataPoint.x, dataPoint.y, dataPoint.width, dataPoint.height, dataPoint.data);
        });

        let maxCoordinate = -Infinity;
        let minCoordinate = Infinity;
        let coordX: number;
        let coordY: number;

        _.each(listOfRectangles, (rect: RTreeRectangle) => {
            coordX = Math.ceil(rect.x + rect.width * 0.5);
            coordY = Math.ceil(rect.y + rect.height * 0.5);
            maxCoordinate = Math.max(maxCoordinate, Math.max(coordX, coordY));
            minCoordinate = Math.min(minCoordinate, Math.min(coordX, coordY));
        });

        const sorted = _.sortBy(listOfRectangles, (rect: RTreeRectangle) => {
            return ToHilbertCoordinates(
                maxCoordinate - minCoordinate,
                Math.ceil(rect.x + rect.width * 0.5) - minCoordinate,
                Math.ceil(rect.y + rect.height * 0.5) - minCoordinate
            );
        });

        listOfRectangles.length = 0;

        this.root = this.RecursiveTreeLayer(sorted)[0];
    }

    private RecursiveSeach(searchRect: RTreeRectangle, node: RTreeRectangle): Array<RTreeRectangle> {
        if (searchRect.Contains(node) || node.IsLeafNode()) {
            // If the query rectangles encapsulates this node, any data points stored within the node
            // rectangle should be returned by the search. This is also true if the node is a leaf. (We
            // tested that the query overlapped before we called the function on this child)
            return node.GetSubtreeData();
        } else {
            // Recursively search the rectangles intersected by the search query rectangle.
            return _.chain(node.children)
                .filter(_.method("overlaps", searchRect))
                .map((iterateNode: RTreeRectangle) => {
                    return this.RecursiveSeach(searchRect, iterateNode);
                })
                .flatten()
                .value() as Array<RTreeRectangle>;
        }
    }

    private RecursiveTreeLayer(listOfRectangles: Array<RTreeRectangle>, level = 1): Array<RTreeRectangle> {
        const numberOfParents = Math.ceil(listOfRectangles.length / this.maxNodes);
        const nodeLevel: Array<RTreeRectangle> = [];
        let childCount = 0;
        let parent: RTreeRectangle;

        for (let i = 0; i < numberOfParents; i++) {
            parent = RTreeRectangle.GenerateEmptyNode();
            childCount = Math.min(this.maxNodes, listOfRectangles.length);

            for (let y = 0; y < childCount; y++) {
                parent.InsertChildRectangle(listOfRectangles.pop());
            }

            nodeLevel.push(parent);
        }

        if (numberOfParents > 1) {
            // We have not yet reached the construction of a root node
            return this.RecursiveTreeLayer(nodeLevel, level + 1);
        } else {
            // The root node has been initialized
            return nodeLevel;
        }
    }

    private BalanceTreePath(leafRectangle: RTreeRectangle): void {
        let currentNode = leafRectangle;

        while (!_.isUndefined(currentNode.parent) && currentNode.parent.NumberOfChildren() > this.maxNodes) {
            // Enter the loop if the current node's parent has too many children.

            currentNode = currentNode.parent;

            if (currentNode !== this.root) {
                currentNode.parent.RemoveChildRectangle(currentNode);

                _.forEach(currentNode.SplitIntoSiblings(), (insertRect: RTreeRectangle) => {
                    currentNode.parent.InsertChildRectangle(insertRect);
                });
            } else if (currentNode === this.root) {
                // Split the children of the root node (implies adding another tree level), and add these newly
                // generated children to the root node again.
                _.forEach(currentNode.SplitIntoSiblings(), (insertRect: RTreeRectangle) => {
                    currentNode.InsertChildRectangle(insertRect);
                });
            }
        }
    }
}

class RTreeRectangle {
    static GenerateEmptyNode(): RTreeRectangle {
        return new RTreeRectangle(Infinity, Infinity, 0, 0, null);
    }
    children: Array<RTreeRectangle> = [];
    parent: RTreeRectangle;

    constructor(public x: number, public y: number, public width: number, public height: number, public data: any) {}

    Overlaps(anotherRect: RTreeRectangle): boolean {
        return (
            this.x < anotherRect.x + anotherRect.width &&
            this.x + this.width > anotherRect.x &&
            this.y + this.height > anotherRect.y &&
            anotherRect.y + anotherRect.height > this.y
        );
    }

    Contains(anotherRect: RTreeRectangle): boolean {
        return (
            this.x <= anotherRect.x &&
            this.x + this.width >= anotherRect.x + anotherRect.width &&
            this.y <= anotherRect.y &&
            this.y + this.height >= anotherRect.y + anotherRect.height
        );
    }

    GrowRectangleToFit(anotherRect: RTreeRectangle): void {
        if (this.x === Infinity) {
            this.height = anotherRect.height;
            this.width = anotherRect.width;
            this.x = anotherRect.x;
            this.y = anotherRect.y;
        } else {
            this.height = Math.max(this.y + this.height, anotherRect.y + anotherRect.height) - Math.min(this.y, anotherRect.y);
            this.width = Math.max(this.x + this.width, anotherRect.x + anotherRect.width) - Math.min(this.x, anotherRect.x);
            this.x = Math.min(this.x, anotherRect.x);
            this.y = Math.min(this.y, anotherRect.y);
        }
    }

    AreaIfGrownBy(anotherRect: RTreeRectangle): number {
        if (this.x === Infinity) {
            return anotherRect.height * anotherRect.width;
        } else {
            return (
                (Math.max(this.y + this.height, anotherRect.y + anotherRect.height) - Math.min(this.y, anotherRect.y)) *
                    (Math.max(this.x + this.width, anotherRect.x + anotherRect.width) - Math.min(this.x, anotherRect.x)) -
                this.GetArea()
            );
        }
    }

    GetArea(): number {
        return this.height * this.width;
    }

    SplitIntoSiblings(): Array<RTreeRectangle> {
        const pivot = Math.floor(this.children.length / 2);
        const sibling1 = RTreeRectangle.GenerateEmptyNode();
        const sibling2 = RTreeRectangle.GenerateEmptyNode();

        let maxCoordinate = -Infinity;
        let minCoordinate = Infinity;
        let coordX: number;
        let coordY: number;

        _.each(this.children, (rect: RTreeRectangle) => {
            coordX = Math.ceil(rect.x + rect.width * 0.5);
            coordY = Math.ceil(rect.y + rect.height * 0.5);
            maxCoordinate = Math.max(maxCoordinate, Math.max(coordX, coordY));
            minCoordinate = Math.min(minCoordinate, Math.min(coordX, coordY));
        });

        const sorted = _.sortBy(this.children, (rect: RTreeRectangle) => {
            return ToHilbertCoordinates(
                maxCoordinate - minCoordinate,
                Math.ceil(rect.x + rect.width * 0.5) - minCoordinate,
                Math.ceil(rect.y + rect.height * 0.5) - minCoordinate
            );
        });

        _.each(sorted, (rect: RTreeRectangle, i: number) => {
            if (i <= pivot) {
                sibling1.InsertChildRectangle(rect);
            } else {
                sibling2.InsertChildRectangle(rect);
            }
        });

        this.children.length = 0;
        sorted.length = 0;

        return [sibling1, sibling2];
    }

    NumberOfChildren(): number {
        return this.children.length;
    }

    IsLeafNode(): boolean {
        return this.children.length === 0;
    }

    HasLeafNodes(): boolean {
        return this.IsLeafNode() || this.children[0].IsLeafNode();
    }

    InsertChildRectangle(insertRect: RTreeRectangle): void {
        insertRect.parent = this;
        this.children.push(insertRect);
        this.GrowRectangleToFit(insertRect);
    }

    RemoveChildRectangle(removeRect: RTreeRectangle): void {
        this.children.splice(_.indexOf(this.children, removeRect), 1);
    }

    GetSubtreeData(): Array<RTreeRectangle> {
        if (this.children.length === 0) {
            return [this.data];
        }

        return _.chain(this.children)
            .map(_.method("getSubtreeData"))
            .thru(FastFlattenArray)
            .value() as Array<RTreeRectangle>;
    }
}

// UTILS

function FastFlattenArray(arr: Array<any>): Array<any> {
    for (let i = 0; i < arr.length; ++i) {
        if (Array.isArray(arr[i])) {
            arr[i].splice(0, 0, i, 1);
            Array.prototype.splice.apply(arr, arr[i]);
            --i;
        }
    }

    return arr;
}

function ToHilbertCoordinates(maxCoordinate: number, x: number, y: number): number {
    const r = maxCoordinate;
    const mask = (1 << r) - 1;
    let hodd = 0;
    const heven = x ^ y;
    const notx = ~x & mask;
    const noty = ~y & mask;

    const tmp = notx ^ y;

    let v0 = 0;
    let v1 = 0;
    for (let k = 1; k < r; k++) {
        v1 = ((v1 & heven) | ((v0 ^ noty) & tmp)) >> 1;
        v0 = ((v0 & (v1 ^ notx)) | (~v0 & (v1 ^ noty))) >> 1;
    }
    hodd = (~v0 & (v1 ^ x)) | (v0 & (v1 ^ noty));

    return HilbertInterleaveBits(hodd, heven);
}

function HilbertInterleaveBits(odd: number, even: number): number {
    let val = 0;
    let max = Math.max(odd, even);
    let n = 0;
    while (max > 0) {
        n++;
        max >>= 1;
    }

    for (let i = 0; i < n; i++) {
        const mask = 1 << i;
        const a = (even & mask) > 0 ? 1 << (2 * i) : 0;
        const b = (odd & mask) > 0 ? 1 << (2 * i + 1) : 0;
        val += a + b;
    }

    return val;
}
