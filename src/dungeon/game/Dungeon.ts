import GameComponent from "../../_lib/game/GameComponent";

export class Dungeon extends GameComponent {

    protected Create(): void {
        const levelData = this.game.loader.resources["levelData"].data.levelData;
    }
}
