import {Text} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import {GameHeight, GameWidth, Scenes} from "../../Constants";
import MenuButton from "./MenuButton";

/** Placeholder title scene: game name + a Start button leading into CharacterSelect. */
export class TitleScreen extends GameComponent {
    constructor() {
        super();

        const title = new Text("Symbol Shift", {fontFamily: "Arial", fontSize: 64, fill: 0xffffff});
        title.anchor.set(0.5);
        title.position.set(GameWidth / 2, GameHeight * 0.35);

        const subtitle = new Text("placeholder title screen", {fontFamily: "Arial", fontSize: 18, fill: 0x999999});
        subtitle.anchor.set(0.5);
        subtitle.position.set(GameWidth / 2, GameHeight * 0.35 + 50);

        const startWidth = 240;
        const startButton = new MenuButton("Start", startWidth, 60, () => {
            this.game.sceneManager.ShowScene(Scenes.CHARACTER_SELECT);
        });
        startButton.position.set((GameWidth - startWidth) / 2, GameHeight * 0.6);

        this.root.addChild(title, subtitle, startButton);
    }
}
