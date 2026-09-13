import {gunzip, inflate} from "zlib";
import { AbstractHandler } from "../../patterns/ChainOfResponsibility";
import TileMapModel, {Layer, Tile} from "./TiledJson";

export class UnCompress extends AbstractHandler<Layer, Promise<void>> {

    Handle(layer: Layer): Promise<void> {

        const onUnzip = (error: Error, buffer: Buffer) => {
            if(error) {
                return Promise.reject(error);
            };
            layer.data = buffer;
            return super.Handle(layer);
        };

        const zipData = new Buffer(layer.data.trim(), "base64");

        switch(layer.compression) {
            case "gzip": {
                gunzip(zipData, onUnzip);
                break;
            }
            case "zlib": {
                inflate(zipData, onUnzip);
                break;
            }
            default:
                return super.Handle(layer);
        }
    }
}

export class Decode extends AbstractHandler<Layer, Promise<void>> {

    Handle(layer: Layer): Promise<void> {

        if(layer.encoding === "base64") {
            const result: number[] = [];
            const data = layer.compression ? layer.data as Buffer : new Buffer(layer.data.trim(), "base64");

            for (let i = 0; i < data.length; i += 4) {
                result.push(data.readUInt32LE(i));
            }
            layer.data = result;
        } else {
            layer.data = layer.data.split(",").map(d => parseInt(d));
        }

        return super.Handle(layer);
    }
}

export class CreateTiles extends AbstractHandler<Layer, Promise<void>> {

    Handle(layer: Layer): Promise<void> {
        layer.tiles = [];
        const data: number[] = layer.data;
        data.forEach((d, i) => this.CreateTile(d, i, layer));
        return super.Handle(layer);
    }

    private CreateTile(gid: number, tileIndex: number, layer: Layer): void {

        const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
        const FLIPPED_VERTICALLY_FLAG   = 0x40000000;
        const FLIPPED_DIAGONALLY_FLAG   = 0x20000000;

        const tile: Tile = layer.tiles[tileIndex] = {};
        tile.hflip = !!(gid & FLIPPED_HORIZONTALLY_FLAG);
        tile.vflip = !!(gid & FLIPPED_VERTICALLY_FLAG);
        tile.dflip = !!(gid & FLIPPED_DIAGONALLY_FLAG);

        gid &= ~(FLIPPED_HORIZONTALLY_FLAG |
                    FLIPPED_VERTICALLY_FLAG |
                    FLIPPED_DIAGONALLY_FLAG);

        tile.gid = gid;
    }
}

export class ResolveLayerTextures extends AbstractHandler<Layer, Promise<void>> {

    constructor(private map: TileMapModel) {
        super();
    }

    Handle(layer: Layer): Promise<void> {
        // tslint:disable-next-line: prefer-for-of
        for (let i = 0; i < layer.tiles.length; i ++) {
            const tile = layer.tiles[i];
            const globalTileId = tile.gid;
            for (let j = this.map.tilesets.length - 1; j >= 0; j -= 1) {
                const tileSet = this.map.tilesets[j];
                if (tileSet.firstgid <= globalTileId) {
                    const tileId = globalTileId - tileSet.firstgid;
                    tile.texture = tileSet.textures[tileId];
                    break;
                }
            }
        }
        return Promise.resolve();
    }
}
