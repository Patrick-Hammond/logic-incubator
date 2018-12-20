export interface IPoint {x: number, y: number};
export class Point {
    constructor(public x: number, public y: number) {}

    public Set(x: number, y: number): Point {
        this.x = x;
        this.y = y;
        return this;
    }
}

export interface IRectangle {x: number, y: number, width: number, height: number};
export class Rectangle {
    constructor(public x: number, public y: number, public width: number, public height: number) {}

    public Set(x: number, y: number, width: number, height: number): Rectangle {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        return this;
    }

    public get left(): number {return this.x}
    public get top(): number {return this.y}
    public get right(): number {return this.x + this.width}
    public get bottom(): number {return this.y + this.height}

    public get topLeft(): IPoint {return {x: this.x, y: this.y}}
    public get topRight(): IPoint {return {x: this.x + this.width, y: this.y}}
    public get bottomLeft(): IPoint {return {x: this.x, y: this.y + this.height}}
    public get bottomRight(): IPoint {return {x: this.x + this.width, y: this.y + this.height}}

    public get centerLeft(): IPoint {return {x: this.x, y: this.y + this.height * 0.5}}
    public get centerTop(): IPoint {return {x: this.x + this.width * 0.5, y: this.y}}
    public get centerRight(): IPoint {return {x: this.x + this.width, y: this.y + this.height * 0.5}}
    public get centerBottom(): IPoint {return {x: this.x + this.width * 0.5, y: this.y + this.height}}
    public get center(): IPoint {return {x: this.x + this.width * 0.5, y: this.y + this.height * 0.5}}

    public Contains(px: number, py: number): boolean {
        if(px < this.x) return false;
        if(py < this.y) return false;
        if(px > this.right) return false;
        if(py > this.bottom) return false;
        return true;
    }

    public Clone(): Rectangle {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }
}