export interface IPoint {x: number; y: number};
export class Point {
    constructor(public x: number, public y: number) {}

    Set(x: number, y: number): Point {
        this.x = x;
        this.y = y;
        return this;
    }

    Clone(): Point {
        return new Point(this.x, this.y);
    }
}

export interface IRectangle {x: number, y: number, width: number, height: number};
export class Rectangle {
    constructor(public x: number, public y: number, public width: number, public height: number) {}

    get left(): number {return this.x}
    get top(): number {return this.y}
    get right(): number {return this.x + this.width}
    get bottom(): number {return this.y + this.height}

    get topLeft(): IPoint {return {x: this.x, y: this.y}}
    get topRight(): IPoint {return {x: this.x + this.width, y: this.y}}
    get bottomLeft(): IPoint {return {x: this.x, y: this.y + this.height}}
    get bottomRight(): IPoint {return {x: this.x + this.width, y: this.y + this.height}}

    get centerLeft(): IPoint {return {x: this.x, y: this.y + this.height * 0.5}}
    get centerTop(): IPoint {return {x: this.x + this.width * 0.5, y: this.y}}
    get centerRight(): IPoint {return {x: this.x + this.width, y: this.y + this.height * 0.5}}
    get centerBottom(): IPoint {return {x: this.x + this.width * 0.5, y: this.y + this.height}}
    get center(): IPoint {return {x: this.x + this.width * 0.5, y: this.y + this.height * 0.5}}

    Set(x: number, y: number, width: number, height: number): Rectangle {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        return this;
    }

    Contains(px: number, py: number): boolean {
        if(px < this.x || px > this.right || py < this.y || py > this.bottom) {
            return false;
        }
        return true;
    }

    Clone(): Rectangle {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }
}
