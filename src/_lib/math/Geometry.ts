export type Vec2Like = { x: number; y: number };
export class Vec2 {
    constructor(public x: number = 0, public y: number = 0) {}

    get length(): number {
        if (this.IsZero()) { return 0; }
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    get normalized(): Vec2Like {
        const length = this.length;
        if (length === 0) { return { x: 0, y: 0 }; }
        return { x: this.x / length, y: this.y / length };
    }

    IsZero(): boolean {
        return this.x === 0 && this.y === 0;
    }

    Set(x: number, y?: number): Vec2 {
        this.x = x;
        this.y = y != null ? y : x;
        return this;
    }

    Offset(x: number, y?: number): Vec2 {
        this.x += x;
        this.y += y != null ? y : x;
        return this;
    }

    Copy(point: Vec2Like): void {
        this.x = point.x;
        this.y = point.y;
    }

    Clone(): Vec2 {
        return new Vec2(this.x, this.y);
    }

    Equals(point: Vec2Like): boolean;
    Equals(x: number, y: number): boolean;
    Equals(x: number | Vec2Like, y?: number): boolean {
        if(typeof x === "number") {
            return this.x === x && this.y === y;
        }

        return this.x === x.x && this.y === x.y;
    }
}

export type RectangleLike = { x: number; y: number; width: number; height: number };
export class Rectangle {

    get left(): number {
        return this.x;
    }
    get top(): number {
        return this.y;
    }
    get right(): number {
        return this.x + this.width;
    }
    get bottom(): number {
        return this.y + this.height;
    }

    get topLeft(): Vec2Like {
        return { x: this.x, y: this.y };
    }
    get topRight(): Vec2Like {
        return { x: this.x + this.width, y: this.y };
    }
    get bottomLeft(): Vec2Like {
        return { x: this.x, y: this.y + this.height };
    }
    get bottomRight(): Vec2Like {
        return { x: this.x + this.width, y: this.y + this.height };
    }

    get centerLeft(): Vec2Like {
        return { x: this.x, y: this.y + this.height * 0.5 };
    }
    get centerTop(): Vec2Like {
        return { x: this.x + this.width * 0.5, y: this.y };
    }
    get centerRight(): Vec2Like {
        return { x: this.x + this.width, y: this.y + this.height * 0.5 };
    }
    get centerBottom(): Vec2Like {
        return { x: this.x + this.width * 0.5, y: this.y + this.height };
    }
    get center(): Vec2Like {
        return { x: this.x + this.width * 0.5, y: this.y + this.height * 0.5 };
    }

    static TEMP = new Rectangle();

    static Equals(rect: RectangleLike): boolean {
        return Rectangle.TEMP.Equals(rect);
    }

    constructor(public x: number = 0, public y: number = 0, public width: number = 0, public height: number = 0) {}

    Set(x: number, y: number, width?: number, height?: number): Rectangle {
        this.x = x;
        this.y = y;
        if (width) {
            this.width = width;
        }
        if (height) {
            this.height = height;
        }
        return this;
    }

    Offset(x: number, y: number): Rectangle {
        this.x += x;
        this.y += y;
        return this;
    }

    Scale(amount: number): Rectangle {
        this.x *= amount;
        this.y *= amount;
        this.width *= amount;
        this.height *= amount;
        return this;
    }

    ContainsPoint(point: Vec2Like): boolean {
        return this.Contains(point.x, point.y);
    }

    Contains(px: number, py: number): boolean {
        if (px < this.x || px > this.right || py < this.y || py > this.bottom) {
            return false;
        }
        return true;
    }

    Equals(rect: RectangleLike): boolean {
        if(!rect) {
            return false;
        }
        return  rect.x === this.x &&
                rect.y === this.y &&
                rect.width === this.width &&
                rect.height === this.height;
    }

    Copy(rect: RectangleLike): Rectangle {
        this.x = rect.x;
        this.y = rect.y;
        this.width = rect.width;
        this.height = rect.height;
        return this;
    }

    Clone(): Rectangle {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }
}

export type Vec3Like = { x: number; y: number; z: number };
