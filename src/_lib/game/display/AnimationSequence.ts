import AssetFactory from "../../loading/AssetFactory";
import {Dictionary} from "../../utils/Types";

export class AnimationSequence {

    public root = new PIXI.Container();
    private animations: Dictionary<PIXI.extras.AnimatedSprite> = {};

    constructor(clipNames: string[]) {
        clipNames.forEach(name => {
            const anim = AssetFactory.inst.CreateAnimatedSprite(name);
            anim.animationSpeed = 0.1;
            this.animations[name] = anim;
        });
    }

    Play(clipName: string, onComplete ?: () => void): PIXI.extras.AnimatedSprite {
        const clip = this.animations[clipName];
        clip.loop = false;
        clip.play();
        clip.onComplete = onComplete;

        this.root.removeChildren();
        this.root.addChild(clip);

        return clip;
    }

    PlayLooped(clipName: string, onLoop ?: () => void): PIXI.extras.AnimatedSprite {
        const clip = this.animations[clipName];
        clip.loop = true;
        clip.play();
        clip.onLoop = onLoop;

        this.root.removeChildren();
        this.root.addChild(clip);

        return clip;
    }

    PlaySequence(clipsNames: string[], onComplete ?: () => void): void {
        const playNext = (index: number = 0) => {
            if(index < clipsNames.length) {
                this.Play(clipsNames[index], () => playNext(++index));
            } else if(onComplete) {
                onComplete();
            }
        }
        playNext(0);
    }
}
