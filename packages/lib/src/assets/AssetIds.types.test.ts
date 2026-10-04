import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The typing contract of the generated declarations, checked with the real compiler: a game's
 * `assets.d.ts` must merge into the lib's empty registries (so ids become checked), a mistyped id
 * or one of the wrong kind must be a compile error, and with no declarations everything stays `string`.
 * `skipLibCheck` is on in the games, which would hide a d.ts that quietly failed to merge - this is
 * what notices.
 */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asset-ids-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const source = fs.readFileSync(path.join(__dirname, "AssetIds.ts"), "utf8");

function errors(files: { [name: string]: string }): string[] {
    fs.writeFileSync(path.join(dir, "AssetIds.ts"), source);
    Object.keys(files).forEach(name => fs.writeFileSync(path.join(dir, name), files[name]));
    const names = ["AssetIds.ts"].concat(Object.keys(files)).map(name => path.join(dir, name));
    const program = ts.createProgram(names, { noEmit: true, strict: false, target: ts.ScriptTarget.ES2017, moduleResolution: ts.ModuleResolutionKind.Node10, skipLibCheck: true, lib: ["lib.es2017.d.ts"] });
    return ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

const generated = `
export {};
declare module "./AssetIds" {
    interface BundleRegistry { "global": true; "level1": true; }
    interface AssetRegistry {
        "global.title": "image";
        "global.crate": "sprite";
        "global.bomb": "animation";
        "level1.hit": "sound";
        "level1.level": "data";
    }
}
`;

describe("generated asset id declarations", () => {
    it("make each id type exactly the ids of its kind", () => {
        expect(errors({
            "gen.d.ts": generated,
            "use.ts": `
                import { SoundId, ImageId, SpriteId, DrawableId, DataId, BundleId, AssetId, BundleOf } from "./AssetIds";
                const sound: SoundId = "level1.hit";
                const image: ImageId = "global.title";
                const drawable: DrawableId = "global.bomb";
                const data: DataId = "level1.level";
                const bundle: BundleId = "level1";
                const any: AssetId = "global.crate";
                const of: BundleOf<"level1.hit"> = "level1";
                export { sound, image, drawable, data, bundle, any, of };
            `,
        })).toEqual([]);
    });

    it("reject a mistyped id and an id of the wrong kind", () => {
        const found = errors({
            "gen.d.ts": generated,
            "use.ts": `
                import { SoundId, ImageId, BundleId } from "./AssetIds";
                export const a: SoundId = "level1.hitt";
                export const b: SoundId = "global.title";
                export const c: ImageId = "global.crate";
                export const d: BundleId = "level3";
            `,
        });
        expect(found).toHaveLength(4);
    });

    it("stay plain strings until a game generates declarations", () => {
        expect(errors({
            "use.ts": `
                import { SoundId, AssetId, BundleId, SpriteId } from "./AssetIds";
                export const a: SoundId = "anything.at.all";
                export const b: AssetId = "x";
                export const c: BundleId = "y";
                export const d: SpriteId = "z";
            `,
        })).toEqual([]);
    });

    it("give a kind with no assets no ids at all, rather than quietly any string", () => {
        const found = errors({
            "gen.d.ts": `export {}; declare module "./AssetIds" { interface AssetRegistry { "global.title": "image"; } }`,
            "use.ts": `import { SoundId } from "./AssetIds"; export const a: SoundId = "global.title";`,
        });
        expect(found).toHaveLength(1);
    });

    it("type a data file by the game's own declaration, else unknown", () => {
        expect(errors({
            "gen.d.ts": generated + `declare module "./AssetIds" { interface DataTypeRegistry { "level1.level": { tiles: number[] }; } }`,
            "use.ts": `
                import { DataOf } from "./AssetIds";
                export const level: DataOf<"level1.level"> = { tiles: [1] };
                export const other: DataOf<"global.title"> = 5;
                // @ts-expect-error the declared type is not a number
                export const wrong: DataOf<"level1.level"> = 5;
            `,
        })).toEqual([]);
    });
});
