import { BaseTexture, Loader, Rectangle, Texture } from "pixi.js";
import { Chain } from "../../patterns/ChainOfResponsibility";
import { CreateTiles, Decode, ResolveLayerTextures, UnCompress } from "./DataHandlers";
import TileMapModel, {Layer, TileSet} from "./TiledJson";

export async function LoadTileMap(name: string, url: string): Promise<TileMapModel> {
    return new Promise((resolve, reject) => {
        Loader.shared
        .add(name, url)
        .load((loader, resources) => {
            const map: TileMapModel = loader.resources[name].data;

            map.tilesets.forEach(tileset => {
                CreateTilesetTextures(tileset);
            });

            const process = Chain<Layer, void>(new UnCompress(), new Decode(), new CreateTiles(), new ResolveLayerTextures(map));
            Promise.all(map.layers.map(layer =>  process.Handle(layer)))
            .then(() => resolve(map))
            .catch((error: Error) => reject(error));
        });
    });
}

function CreateTilesetTextures(tileSet: TileSet): void {
    tileSet.textures = [];
    const baseTexture = BaseTexture.from("assets/" + tileSet.image);
    for (let y = 0; y < tileSet.imageheight; y += tileSet.tileheight) {
      for (let x = 0; x < tileSet.imagewidth; x += tileSet.tilewidth) {
        const frame = new Rectangle(x, y, tileSet.tilewidth, tileSet.tileheight)
        tileSet.textures.push(new Texture(baseTexture, frame))
      }
    }
}
