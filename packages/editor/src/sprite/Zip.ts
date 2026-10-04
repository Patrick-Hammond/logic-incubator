/**
 * A zip file from a list of files, for downloading several frames at once. "Stored" - no compression - because what goes in is PNGs,
 * which are compressed already, so deflating them would cost time and save nothing; that also makes the format simple enough to write
 * here, rather than add a library every game would have to carry. Names are UTF-8 (flagged, so every unzipper reads them the same).
 * Pure - no DOM - so it runs under the plain node test runner (see Zip.test.ts).
 */

import { Crc32 } from "./Png";

export type ZipEntry = {
    /** A path inside the zip: forward slashes, no leading slash, no "..". */
    name: string;
    data: Uint8Array;
};

const LocalHeader = 0x04034b50;
const CentralHeader = 0x02014b50;
const EndOfDirectory = 0x06054b50;
const Utf8Names = 0x0800;
/** The classic format's limits: 16-bit entry counts and 32-bit sizes and offsets. */
const MaxEntries = 0xffff;
const MaxBytes = 0xffffffff;

/** What's wrong with `name` as a path in a zip, or null. */
export function ZipNameProblem(name: string): string | null {
    if (!name) {
        return "a file in a zip needs a name";
    }
    if (name.indexOf("\\") >= 0 || name[0] === "/" || /^[a-zA-Z]:/.test(name)) {
        return `"${name}" isn't a relative path with forward slashes`;
    }
    if (name.split("/").some(part => part === ".." || part === "." || part === "")) {
        return `"${name}" has an empty, "." or ".." part`;
    }
    return null;
}

function DosTime(date: Date): { time: number; date: number } {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
        date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
}

/** The zip file's bytes. Throws for a bad or repeated name, or more than a classic zip can hold. */
export function CreateZip(entries: ReadonlyArray<ZipEntry>, now: Date = new Date()): Uint8Array {
    if (entries.length > MaxEntries) {
        throw new Error(`A zip holds at most ${MaxEntries} files.`);
    }
    const encoder = new TextEncoder();
    const seen = new Set<string>();
    const names = entries.map(entry => {
        const problem = ZipNameProblem(entry.name);
        if (problem) {
            throw new Error(`Can't put ${problem}.`);
        }
        if (seen.has(entry.name)) {
            throw new Error(`"${entry.name}" is in the zip twice.`);
        }
        seen.add(entry.name);
        return encoder.encode(entry.name);
    });

    let local = 0;
    let central = 0;
    entries.forEach((entry, i) => {
        local += 30 + names[i].length + entry.data.length;
        central += 46 + names[i].length;
    });
    if (local + central + 22 > MaxBytes) {
        throw new Error("That's too much to put in one zip.");
    }

    const out = new Uint8Array(local + central + 22);
    const view = new DataView(out.buffer);
    const stamp = DosTime(now);
    let at = 0;
    let directory = local;
    entries.forEach((entry, i) => {
        const crc = Crc32(entry.data);
        const offset = at;

        view.setUint32(at, LocalHeader, true);
        view.setUint16(at + 4, 20, true); // version needed
        view.setUint16(at + 6, Utf8Names, true);
        view.setUint16(at + 8, 0, true); // stored
        view.setUint16(at + 10, stamp.time, true);
        view.setUint16(at + 12, stamp.date, true);
        view.setUint32(at + 14, crc, true);
        view.setUint32(at + 18, entry.data.length, true);
        view.setUint32(at + 22, entry.data.length, true);
        view.setUint16(at + 26, names[i].length, true);
        view.setUint16(at + 28, 0, true); // no extra field
        out.set(names[i], at + 30);
        out.set(entry.data, at + 30 + names[i].length);
        at += 30 + names[i].length + entry.data.length;

        view.setUint32(directory, CentralHeader, true);
        view.setUint16(directory + 4, 20, true); // made by
        view.setUint16(directory + 6, 20, true); // version needed
        view.setUint16(directory + 8, Utf8Names, true);
        view.setUint16(directory + 10, 0, true);
        view.setUint16(directory + 12, stamp.time, true);
        view.setUint16(directory + 14, stamp.date, true);
        view.setUint32(directory + 16, crc, true);
        view.setUint32(directory + 20, entry.data.length, true);
        view.setUint32(directory + 24, entry.data.length, true);
        view.setUint16(directory + 28, names[i].length, true);
        // extra field, comment, disk number, internal and external attributes: all zero
        view.setUint32(directory + 42, offset, true);
        out.set(names[i], directory + 46);
        directory += 46 + names[i].length;
    });

    view.setUint32(directory, EndOfDirectory, true);
    view.setUint16(directory + 8, entries.length, true);
    view.setUint16(directory + 10, entries.length, true);
    view.setUint32(directory + 12, central, true);
    view.setUint32(directory + 16, local, true);
    return out;
}
