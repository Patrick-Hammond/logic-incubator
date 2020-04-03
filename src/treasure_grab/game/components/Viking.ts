import {Linear, TweenMax} from "gsap";
import {AnimatedSprite} from "pixi.js";
import {FindShortestPath} from "../../../_lib/algorithms/Search";
import GameComponent from "../../../_lib/game/GameComponent";
import {Vec2} from "../../../_lib/math/Geometry";
import {Directions} from "../../../_lib/utils/Types";
import {CAT_FOUND} from "../Events";
import {TileToPixel} from "../Utils";
import Map, {TileType} from "./Map";

enum VikingState {
    IDLE, MOVING
}

export default class Viking extends GameComponent {

    private anim: AnimatedSprite;
    private position = new Vec2();
    private state: VikingState;

    public constructor(private map: Map) {
        super();

        this.state = VikingState.IDLE;

        this.anim = this.assetFactory.CreateAnimatedSprite("viking");
        this.anim.anchor.set(0.5);
        this.anim.scale.set(-2, 2);
        this.anim.pivot.x = 16;
        this.anim.animationSpeed = 0.1;
        this.anim.play();
        this.root.addChild(this.anim);
    }

    SetPosition(x: number, y: number): void {
        this.position.Set(x, y);
        const pos = TileToPixel(this.position);
        this.anim.position.set(pos.x, pos.y);
    }

    Move(direction: Directions): void {

        if(this.state !== VikingState.MOVING) {
            const tileType = this.map.GetTile(this.position, direction).type;

            if(tileType === TileType.TRAVERSABLE) {
                this.state = VikingState.MOVING;
                this.anim.play();

                switch(direction) {
                    case "left":
                        this.position.x -= 1;
                        this.anim.scale.x = -2;
                        this.anim.pivot.x = 16;
                        break;
                    case "right":
                        this.position.x += 1;
                        this.anim.scale.x = 2;
                        this.anim.pivot.x = -16;
                        break;
                    case "up":
                        this.position.y -= 1;
                        break;
                    case "down":
                        this.position.y += 1;
                        break;
                    }

                const pos = TileToPixel(this.position);
                TweenMax.to(this.anim, .75, {
                    x: pos.x, y: pos.y, ease: Linear.easeNone,
                    onComplete: () => this.Think()
                });
            } else if(tileType === TileType.CAT) {
                this.game.dispatcher.emit(CAT_FOUND, this.position);
            }
        }
    }

    Think(): void {
        this.state = VikingState.IDLE;

        const path = FindShortestPath(this.map, this.position, {x: 5, y: 5});
        if(path.length > 1) {
            const p = path[1];
            if(p.x !== this.position.x) {
                this.Move(p.x < this.position.x ? "left" : "right");
            } else {
                this.Move(p.y < this.position.y ? "up" : "down");
            }
        }
    }
}
