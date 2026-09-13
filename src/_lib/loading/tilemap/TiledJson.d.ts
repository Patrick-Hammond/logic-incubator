import { Texture } from "pixi.js";

export default interface TileMapModel {
    backgroundcolor:string;
    height:number; 	            
    hexsidelength:number; 	   
    infinite:boolean;
    layers:Layer[];
    nextlayerid:number;
    nextobjectid:number;
    orientation:string;
    property:property[];
    renderorder:string;
    staggeraxis:string;
    staggerindex:string;
    tiledversion:string;
    tileheight:number;
    tilesets:TileSet[];
    tilewidth:number;
    type:string;
    version:number;
    width:number;
}

export interface Layer {
    chunks?:Chunk[];
    compression:string;
    data:any;
    draworder:string;
    encoding:string;
    height:number;
    id:number;
    image:string;
    layers:Layer[];
    name:string;
    objects:MapObject[];
    offsetx:number;
    offsety:number;
    opacity:number;
    property:property[];
    startx:number;
    starty:number;
    tiles?:Tile[];
    transparentcolor:string;
    type:string;
    visible:boolean;
    width:number;
    x:number;
    y:number;
}

export interface Chunk {
    data:number[]|string[];
    height:number;
    width:number;
    x:number;
    y:number;
}

export interface MapObject {
    ellipse:boolean;
    gid:number;
    height:number;
    id:number;
    name:string;
    point:boolean;
    polygon:PointLike[];
    polyline:PointLike[];
    property:property[];
    rotation:number;
    template:string;
    text:MapText;
    type:string;
    visible:boolean;
    width:number;
    x:number;
    y:number;
}

export interface PointLike {
    x:number;
    y:number;
}

export interface MapText {
    bold:boolean;
    color:string;
    fontfamily:string;
    halign:string;
    italic:boolean;
    kerning:boolean;
    pixelsize:number;
    strikeout:boolean;
    text:string;
    underline:boolean;
    valign:string;
    wrap:boolean;
}

export interface TileSet {
    backgroundcolor:string;
    columns:number;
    firstgid:number;
    grid:Grid;
    image:string;
    imageheight:number;
    imagewidth:number;
    margin:number;
    name:string;
    property:property[];
    source:string;
    spacing:number;
    terrains?:Terrain[];
    textures?:Texture[];
    tilecount:number;
    tiledversion:string;
    tileheight:number;
    tileoffset?:PointLike;
    tilewidth:number;
    transparentcolor:string;
    type:string;
    version:number;
    wangsets:WangSet[];
}

export interface Grid {
    height:number;
    width:number;
    orientation:string;
}

export interface Tile {
    animation?:Frame[];
    gid?:number;
    id?:number;
    image?:string;
    imageheight?:number;
    imagewidth?:number;
    objectgroup?:Layer;
    probability?:number;
    property?:property[];
    terrain?:number[];
    texture?:Texture;
    type?:string;
    dflip?:boolean;
    hflip?:boolean;
    vflip?:boolean;
}

export interface Frame {
    duration:number;
    tileid:number;
}

export interface Terrain {
    name:string;
    property:property[];
    tile:number;
}

export interface WangSet {
    cornercolors:WangColor[];
    edgecolors:WangColor[];
    name:string;
    property:property[];
    tile:number;
    wangtiles:WangTile[];
}

export interface WangColor {
    color:string;
    name:string;
    probability:number;
    tile:number;
}

export interface WangTile {
    dflip:boolean;
    hflip:boolean;
    tileid:number;
    vflip:boolean;
    wangid:number[];
}

export interface property {
    name:string;
    type:string;
    value:any;
}

