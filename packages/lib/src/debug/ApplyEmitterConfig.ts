import { CloneConfig, EmitterConfigData } from "./EmitterConfigModel";

/** The part of an `Emitter` that applying a config touches. */
export interface ConfigurableEmitter {
    init(art: any, config: EmitterConfigData): void;
    readonly originalConfig: EmitterConfigData;
    readonly originalArt: any;
    ownerPos: { x: number; y: number };
    rotation: number;
    emit: boolean;
    autoUpdate: boolean;
    updateOwnerPos(x: number, y: number): void;
    rotate(rotation: number): void;
}

/** What `init` resets, and so what has to be put back: where the emitter's owner is, how it is turned, and whether it runs and updates itself. */
interface EmitterState {
    ownerX: number;
    ownerY: number;
    rotation: number;
    emit: boolean;
    autoUpdate: boolean;
}

function Capture(emitter: ConfigurableEmitter): EmitterState {
    return { ownerX: emitter.ownerPos.x, ownerY: emitter.ownerPos.y, rotation: emitter.rotation, emit: emitter.emit, autoUpdate: emitter.autoUpdate };
}

function Restore(emitter: ConfigurableEmitter, state: EmitterState): void {
    emitter.updateOwnerPos(state.ownerX, state.ownerY);
    if (state.rotation) {
        emitter.rotate(state.rotation);
    }
    emitter.autoUpdate = state.autoUpdate;
    emitter.emit = state.emit;
}

/**
 * Sets each emitter up again from `config` (and `art`, the textures its particles use; each emitter's own if left out), as the
 * emitter's `init` does - which also ends its live particles. What `init` would reset is put back: the owner's position, the
 * rotation, whether it emits, and whether it updates itself from a ticker. Each emitter gets its own copy of the config.
 *
 * If an emitter can't be set up from it, that emitter goes back to what it had and the message comes back; the others are untouched.
 *
 * @returns Undefined when every emitter took it, otherwise what went wrong.
 */
export function ApplyEmitterConfig(emitters: ConfigurableEmitter[], config: EmitterConfigData, art?: any): string | undefined {
    if (Array.isArray(art) && art.length === 0) {
        return "There is no particle image to use.";
    }
    for (const emitter of emitters) {
        const state = Capture(emitter);
        const before = { config: emitter.originalConfig, art: emitter.originalArt };
        try {
            emitter.init(art === undefined ? before.art : art, CloneConfig(config));
        } catch (error) {
            // `init` may have got part-way: set the emitter up again as it was - and don't let that throw in turn.
            try {
                emitter.init(before.art, before.config);
                Restore(emitter, state);
            } catch {
                // it could not go back either; the message below is still the one to report
            }
            return error instanceof Error ? error.message : String(error);
        }
        Restore(emitter, state);
    }
    return undefined;
}
