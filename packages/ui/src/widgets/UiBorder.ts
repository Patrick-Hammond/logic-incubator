import { Container, Sprite, Texture, TilingSprite } from "pixi.js";
import { BorderPiece, BorderRects } from "../geometry/BorderRects";
import UiTheme from "../UiTheme";

/**
 * An ornamental line in one of the skin's border styles: a cap at each end, an ornament in the middle and a repeating piece between. It is a divider on its own,
 * and the top edge of a panel (`UiPanel`) from the same art, so the two can't drift apart.
 */
export default class UiBorder extends Container {
    private readonly textures: { capLeft: Texture; capRight: Texture; mid?: Texture; centre?: Texture };
    private widthValue = 0;

    constructor(theme: UiTheme, styleName: string, width: number) {
        super();
        const style = theme.skin.borderStyles[styleName];
        if (!style) {
            throw new Error(`The "${theme.skin.name}" skin has no border style "${styleName}".`);
        }
        this.textures = {
            capLeft: theme.Texture(style.capLeft),
            capRight: theme.Texture(style.capRight),
            mid: style.mid ? theme.Texture(style.mid) : undefined,
            centre: style.centre ? theme.Texture(style.centre) : undefined
        };
        this.Resize(width);
    }

    /** The line's height: the pieces' common height. */
    get LineHeight(): number {
        return this.textures.capLeft.height;
    }

    get LineWidth(): number {
        return this.widthValue;
    }

    /** Lays the line out at this width (raised to what the caps need). */
    Resize(width: number): void {
        const t = this.textures;
        const pieces = BorderRects(width, { capLeft: t.capLeft.width, capRight: t.capRight.width, centre: t.centre ? t.centre.width : 0, mid: t.mid ? t.mid.width : 0 });
        this.removeChildren().forEach(child => child.destroy());
        pieces.forEach(piece => this.addChild(this.Piece(piece)));
        const last = pieces[pieces.length - 1];
        this.widthValue = last.x + last.width;
    }

    private Piece(piece: BorderPiece): Sprite | TilingSprite {
        const texture = this.textures[piece.part] as Texture;
        const display = piece.part === "mid" ? new TilingSprite(texture, piece.width, texture.height) : new Sprite(texture);
        display.position.set(piece.x, 0);
        return display;
    }
}
