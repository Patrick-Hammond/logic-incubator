import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src`, import.meta.url));

export default defineConfig({
    resolve: {
        // Same as tsconfig.json's paths: packages import each other by name, as games import them.
        alias: {
            "@logic-incubator/lib": src("lib"),
            "@logic-incubator/engine": src("engine"),
            "@logic-incubator/editor": src("editor"),
            "@logic-incubator/ui": src("ui"),
        },
    },
    test: {
        environment: "node",
        // The type-level tests build a whole TypeScript program (about 3 s alone), which the default 5 s can't survive when the rest of the suite is running beside it.
        testTimeout: 30000,
        include: ["packages/*/src/**/*.{test,spec}.ts", "packages/*/scripts/**/*.{test,spec}.ts", "packages/*/tools/**/*.{test,spec}.mjs"],
    },
});
