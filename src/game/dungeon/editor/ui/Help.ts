import Game from "../../../../_lib/Game";

export function ShowHelp() {
    const text = "PAINT - left mouse   ERASE - right mouse   ROTATE BRUSH - r   NUDGE BRUSH - cursor keys   " +
        "UNDO - ctrl-z   ZOOM - +/- or mouse wheel   SAVE - s   LOAD - l   RESET - ctrl-q";
    const helpText = new PIXI.Text(text, {fontFamily: "Arial", fontSize: 11, fill: 0xaaaaaa});
    helpText.position.set(20, 702);
    Game.inst.stage.addChild(helpText);
}
