import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { Style0x7 } from "./Style0x7";

describe("Style0x7", () => {
    it("paints only tiles listed in assets-meta.json", () => {
        const meta = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "assets", "assets-meta.json"), "utf8"));
        const brushes = new Style0x7().StyleRoom({ x: 2, y: 2, width: 6, height: 5 }, { "4,2": 1 });
        new Set(brushes.map(brush => brush.name)).forEach(name => expect(meta, name).toHaveProperty(name));
    });
});
