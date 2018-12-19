type Point = {x:number, y:number};

export class Rectangle
{
    constructor(public x:number, public y:number, public width:number, public height:number){}

    public Set(x:number,y:number,width:number,height:number) : Rectangle
    {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        return this;
    }

    public get left() : number {return this.x;}
    public get top() : number {return this.y;}
    public get right() : number {return this.x + this.width;}
    public get bottom() : number {return this.y + this.height;}

    public get topLeft() : Point {return {x:this.x, y:this.y}}
    public TopRight() : Point {return {x:this.x, y:this.y}}
    public BottomLeft() : Point {return {x:this.x, y:this.y}}
    public BottomRight() : Point {return {x:this.x, y:this.y}}

    public CenterLeft() : Point {return {x:this.x, y:this.y}}
    public CenterTop() : Point {return {x:this.x, y:this.y}}
    public CenterRight() : Point {return {x:this.x, y:this.y}}
    public CenterBottom() : Point {return {x:this.x, y:this.y}}
    public Center() : Point {return {x:this.x, y:this.y}}

    public Contains(px:number,py:number) : boolean
    {
        if(px < this.x) return false;
        if(py < this.y) return false;
        if(px > this.right) return false;
        if(py > this.bottom) return false;
        return true;
    }

    public Copy(to:{x:number, y:number, width:number, height:number}) : void
    {
        to.x = this.x;
        to.y = this.y;
        to.width = this.width;
        to.height = this.height;
    }

    public Clone() : Rectangle
    {
        return new Rectangle(this.x,this.y,this.width,this.height);
    }
}