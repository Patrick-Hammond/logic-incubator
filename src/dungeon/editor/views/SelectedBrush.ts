import { Key } from "../../../_lib/io/Keyboard";
import { AnimationSpeed, Scenes } from "../../Constants";
import { MonsterIdleAnimation, MonsterType } from "../../game/level/entities/Monsters";
import { IsSpawnerValue } from "../../game/level/entities/Spawners";
import { IsLightValue } from "../../game/level/Lighting";
import { DataBrushEditorFor } from "../DataBrushEditors";
import EditorComponent from "../EditorComponent";
import { DataBrushValue, EditorActions, IEditorState } from "../stores/EditorStore";
import { ChoiceOption, IsFormDialogOpen, OpenFormDialog } from "../ui/dialog/FormDialog";
import { ButtonEl, El, InjectStyles } from "../ui/dom/Dom";
import EditorOverlay from "../ui/dom/EditorOverlay";
import SpriteCanvas, { DATA_SWATCH_SIZE } from "../ui/dom/SpriteCanvas";

const PREVIEW_SIZE = 64;

/**
 * The card under the brush picker: a preview of the brush being hovered (or
 * else the one picked), what it is, and - for a data brush with a popup
 * editor - its value and an Edit button (also E).
 */
export default class SelectedBrush extends EditorComponent {
    private preview = new SpriteCanvas();
    private nameText: HTMLElement;
    private kindText: HTMLElement;
    private valueRow: HTMLElement;
    private valueChip: HTMLElement;
    private valueText: HTMLElement;
    private editButton: HTMLButtonElement;
    /** The brush on the card, or null before the first `ShowBrush`. */
    private shownName: string = null;
    private animTime = 0;
    private monsterImages: { [type: string]: ChoiceOption["image"] | undefined } = {};

    constructor() {
        super();
        this.AddToScene(Scenes.EDITOR);
    }

    protected Create(): void {
        InjectStyles("sb-styles", STYLES);

        const card = El("div", "ed-panel sb-card");
        card.appendChild(El("div", "sb-preview")).appendChild(this.preview.canvas);
        const info = card.appendChild(El("div", "sb-info"));
        this.nameText = info.appendChild(El("div", "sb-name"));
        const kindRow = info.appendChild(El("div", "sb-kind-row"));
        this.kindText = kindRow.appendChild(El("span", "sb-kind"));
        this.editButton = kindRow.appendChild(ButtonEl("ed-button sb-edit", "Edit", "Edit this brush's value"));
        this.editButton.appendChild(El("kbd", "", "E"));
        this.editButton.addEventListener("click", () => this.OpenDataEditor());
        this.valueRow = info.appendChild(El("div", "sb-value"));
        this.valueChip = this.valueRow.appendChild(El("span", "sb-chip"));
        this.valueText = this.valueRow.appendChild(El("span", "sb-value-text"));
        EditorOverlay.inst.Slot("selected").appendChild(card);

        this.editorStore.Subscribe(this.Render, this);
        this.game.ticker.add(this.Animate, this);

        // E: same as the edit button. Keydowns typed inside the dialog never reach here (see FormDialog).
        this.game.keyboard.on("keydown", (e: KeyboardEvent) => {
            if (e.keyCode === Key.E && this.editorStore.state.currentScene === Scenes.EDITOR) {
                // Otherwise this same keypress types an "e" into the dialog field that just took focus.
                e.preventDefault();
                this.OpenDataEditor();
            }
        });

        this.ShowBrush(this.editorStore.state.currentBrush.name);
        this.ShowValue();
    }

    private Render(prevState: IEditorState, state: IEditorState): void {
        let name = this.shownName;
        if (prevState.hoveredBrushName !== state.hoveredBrushName) {
            name = state.hoveredBrushName;
        }
        if (prevState.currentBrush.name !== state.currentBrush.name) {
            name = state.currentBrush.name;
        }

        const changed = name !== this.shownName;
        if (changed) {
            this.ShowBrush(name);
        }
        if (changed || prevState.dataBrushes !== state.dataBrushes || prevState.currentBrush.name !== state.currentBrush.name) {
            this.ShowValue();
        }
    }

    private ShowBrush(name: string): void {
        this.shownName = name;
        this.nameText.textContent = name || "No brush";
        this.nameText.title = name;

        const dataBrush = this.editorStore.state.dataBrushes.find(db => db.name === name);
        const known = this.assetFactory.SpriteNames.indexOf(name) > -1 || this.assetFactory.AnimationNames.indexOf(name) > -1;
        if (dataBrush) {
            const icon = dataBrush.icon ? this.assetFactory.CreateTexture(dataBrush.icon) : null;
            this.preview.ShowSwatch(dataBrush.colour, icon, PREVIEW_SIZE / DATA_SWATCH_SIZE);
            this.kindText.textContent = "Data brush";
        } else if (name && known) {
            const frames = this.assetFactory.CreateTextures(name);
            this.preview.ShowFitted(frames, PREVIEW_SIZE);
            const size = frames[0].orig.width + "×" + frames[0].orig.height;
            this.kindText.textContent = frames.length > 1 ? `Animation · ${frames.length} frames · ${size}` : `Tile · ${size}`;
        } else {
            this.preview.Clear();
            this.kindText.textContent = name ? "Not in the sprite sheet" : "Hover or pick one above";
        }
    }

    /** The shown data brush's value, for brushes whose value is edited in a dialog; player-start and collision have none worth showing. */
    private ShowValue(): void {
        const state = this.editorStore.state;
        const dataBrush = state.dataBrushes.find(db => db.name === this.shownName);
        const editable = dataBrush != null && DataBrushEditorFor(dataBrush.name) != null;
        this.valueRow.style.visibility = editable ? "" : "hidden";
        // The dialog edits the picked brush, so no button while previewing another one.
        this.editButton.style.display = editable && dataBrush.name === state.currentBrush.name ? "" : "none";
        if (!editable) {
            return;
        }

        const summary = this.DescribeValue(dataBrush.value);
        this.valueText.textContent = summary.text;
        this.valueRow.title = summary.text;
        this.valueChip.style.display = summary.colour != null ? "" : "none";
        if (summary.colour != null) {
            const hex = "#" + summary.colour.toString(16).padStart(6, "0");
            this.valueChip.style.background = hex;
            this.valueRow.title = hex + " · " + summary.text;
        }
    }

    private DescribeValue(value: DataBrushValue): { text: string; colour?: number } {
        if (IsLightValue(value)) {
            return { text: `${value.brightness} bright · ${value.range} tiles`, colour: value.tint };
        }
        if (IsSpawnerValue(value)) {
            const types = value.monsters.length === 1 ? value.monsters[0].replace(/_/g, " ") : `${value.monsters.length} types`;
            return { text: `${types} · every ${value.interval}s · max ${value.maxAlive}` };
        }
        return { text: `${value} · +/- to adjust` };
    }

    private Animate(delta: number): void {
        if (this.preview.Animated && EditorOverlay.inst.Visible) {
            this.animTime += delta * AnimationSpeed;
            this.preview.SetFrame(Math.floor(this.animTime));
        }
    }

    /** Opens the popup editor (see `DataBrushEditors`) for the selected data brush, if it has one. Cancelling leaves the value untouched. */
    private OpenDataEditor(): void {
        const dataBrush = this.editorStore.SelectedDataBrush;
        const editor = dataBrush && DataBrushEditorFor(dataBrush.name);
        if (!editor || IsFormDialogOpen()) {
            return;
        }
        OpenFormDialog({
            title: editor.title,
            subtitle: editor.subtitle,
            fields: editor.fields({ monster: type => this.MonsterImage(type) }),
            values: editor.toForm(dataBrush.value),
            validate: editor.validate
        }).then(form => {
            // Guard against the selection having changed underneath the (modal, but async) dialog.
            if (form && this.editorStore.SelectedDataBrush === dataBrush) {
                this.editorStore.Dispatch({ type: EditorActions.SET_DATA_BRUSH_VALUE, data: { value: editor.fromForm(form) } });
            }
        });
    }

    /** First idle frame of the monster at 2x, as a data URI for the spawner dialog's chips. Cached. */
    private MonsterImage(type: MonsterType): ChoiceOption["image"] | undefined {
        if (!(type in this.monsterImages)) {
            const name = MonsterIdleAnimation(type);
            if (this.assetFactory.AnimationNames.indexOf(name) === -1) {
                this.monsterImages[type] = undefined;
            } else {
                const image = new SpriteCanvas();
                image.Show([this.assetFactory.CreateTexture(name)], 2);
                const { canvas } = image;
                this.monsterImages[type] = { src: canvas.toDataURL(), width: canvas.width, height: canvas.height };
            }
        }
        return this.monsterImages[type];
    }
}

const STYLES = `
.sb-card { flex-direction: row; align-items: center; gap: 10px; height: 84px; padding: 9px; }
.sb-preview {
    flex: 0 0 ${PREVIEW_SIZE}px; height: ${PREVIEW_SIZE}px; display: flex; align-items: center; justify-content: center;
    background: var(--ed-well); border-radius: 4px;
}
.sb-preview canvas { display: block; image-rendering: pixelated; }
.sb-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sb-name { font-weight: bold; color: var(--ed-text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sb-kind-row { display: flex; align-items: center; gap: 6px; min-height: 22px; }
.sb-kind { flex: 1; min-width: 0; font-size: 11px; color: var(--ed-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sb-edit { display: inline-flex; align-items: center; gap: 5px; padding: 2px 5px 2px 8px; font-size: 12px; }
.sb-value { display: flex; align-items: center; gap: 5px; min-height: 16px; font-size: 12px; color: var(--ed-label); white-space: nowrap; overflow: hidden; }
.sb-value-text { overflow: hidden; text-overflow: ellipsis; }
.sb-chip { flex: 0 0 auto; width: 10px; height: 10px; border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 2px; }
`;
