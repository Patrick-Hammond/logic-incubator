/**
 * The keys the player carries, and which doors they open. Pure - no pixi - so it
 * runs under the plain node test runner, same as Inventory.ts.
 *
 * A door has a lock id (see `Doors.EffectiveDoorLock`). `NoLock` (-1) is the lock of a door
 * that's unlocked - every door, until it's given another - and opens for anyone, key or no key.
 * Any other id (0 and up) is a real lock, which only a key with the same id opens.
 */

/** The lock id of an unlocked door: it opens for the player whatever keys they carry, if any. */
export const NoLock = -1;

/** Whether a door with this lock needs a key - any lock id from 0 up does, `NoLock` and below doesn't. */
export function IsLocked(lock: number): boolean {
    return lock >= 0;
}

/** One key held: `id` is what it opens, `sprite` how the HUD shows it (the pickup's own tile, if it had one). */
export type HeldKey = { id: number; sprite: string | null };

export type KeyRing = {
    keys: HeldKey[];
};

export function CreateKeyRing(): KeyRing {
    return { keys: [] };
}

/** Picks a key up. A second key with an id already held adds nothing - returns whether it was new. */
export function AddKey(ring: KeyRing, id: number, sprite: string | null = null): boolean {
    if (ring.keys.some(key => key.id === id)) {
        return false;
    }
    ring.keys.push({ id, sprite });
    return true;
}

/** Whether the ring opens a door with this lock: it isn't locked, or a key with that id is held. */
export function CanOpen(ring: KeyRing, lock: number): boolean {
    return !IsLocked(lock) || ring.keys.some(key => key.id === lock);
}
