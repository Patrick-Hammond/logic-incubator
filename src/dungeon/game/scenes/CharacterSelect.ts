import {Text} from "pixi.js";
import GameComponent from "../../../_lib/game/GameComponent";
import {GameHeight, GameWidth, Scenes} from "../../Constants";
import {CHARACTER_SELECTED} from "../Events";
import MenuButton from "./MenuButton";

export const enum CharacterChoice {
    FIGHTER_MALE = "fighter-male",
    FIGHTER_FEMALE = "fighter-female",
    ELF_MALE = "elf-male",
    ELF_FEMALE = "elf-female",
    WITCH = "witch",
    WIZARD = "wizard"
}

const CHOICES: ReadonlyArray<{label: string; choice: CharacterChoice}> = [
    {label: "Fighter (M)", choice: CharacterChoice.FIGHTER_MALE},
    {label: "Fighter (F)", choice: CharacterChoice.FIGHTER_FEMALE},
    {label: "Elf (M)", choice: CharacterChoice.ELF_MALE},
    {label: "Elf (F)", choice: CharacterChoice.ELF_FEMALE},
    {label: "Witch", choice: CharacterChoice.WITCH},
    {label: "Wizard", choice: CharacterChoice.WIZARD}
];

const COLUMNS = 3;
const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 70;
const GAP_X = 40;
const GAP_Y = 30;

/** Placeholder character-choice scene: pick one of six classes, which emits CHARACTER_SELECTED and drops into the dungeon. */
export class CharacterSelect extends GameComponent {
    constructor() {
        super();

        const heading = new Text("Choose Your Character", {fontFamily: "Arial", fontSize: 40, fill: 0xffffff});
        heading.anchor.set(0.5, 0);
        heading.position.set(GameWidth / 2, GameHeight * 0.12);

        const rows = Math.ceil(CHOICES.length / COLUMNS);
        const gridWidth = COLUMNS * BUTTON_WIDTH + (COLUMNS - 1) * GAP_X;
        const gridHeight = rows * BUTTON_HEIGHT + (rows - 1) * GAP_Y;
        const startX = (GameWidth - gridWidth) / 2;
        const startY = (GameHeight - gridHeight) / 2 + 20;

        const buttons = CHOICES.map(({label, choice}, index) => {
            const col = index % COLUMNS;
            const row = (index / COLUMNS) | 0;
            const button = new MenuButton(label, BUTTON_WIDTH, BUTTON_HEIGHT, () => this.SelectCharacter(choice));
            button.position.set(startX + col * (BUTTON_WIDTH + GAP_X), startY + row * (BUTTON_HEIGHT + GAP_Y));
            return button;
        });

        const backButton = new MenuButton("Back", 120, 44, () => this.game.sceneManager.ShowScene(Scenes.TITLE));
        backButton.position.set(40, 40);

        this.root.addChild(heading, backButton, ...buttons);
    }

    private SelectCharacter(choice: CharacterChoice): void {
        this.game.dispatcher.emit(CHARACTER_SELECTED, choice);
        this.game.sceneManager.ShowScene(Scenes.GAME);
    }
}
