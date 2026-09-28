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
        },
    },
    test: {
        environment: "node",
        include: ["packages/*/src/**/*.{test,spec}.ts"],
    },
});
