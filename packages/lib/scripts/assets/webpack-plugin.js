"use strict";

/**
 * Runs the asset build inside webpack, so `npm start` regenerates the manifest, atlases and id
 * declarations when art changes - no separate watch process. It builds before each run
 * (`beforeRun` for a one-off build, `watchRun` for the dev server) and registers the asset roots
 * as context dependencies so a changed file triggers the next one. Output is written only when it
 * changed, which is what stops this from re-triggering itself through the d.ts it writes.
 *
 *   new AssetsWebpackPlugin({ configPath: path.resolve(__dirname, "assets.config.json") })
 *
 * `production` follows webpack's mode (a production build leaves dev-only roots out).
 */

const { BuildAssets } = require("./build");
const { LoadConfig } = require("./config");
const { FormatDiagnostics } = require("./report");

class AssetsWebpackPlugin {
    constructor(options) {
        this.options = options;
    }

    apply(compiler) {
        const name = "AssetsWebpackPlugin";
        const logger = compiler.getInfrastructureLogger(name);
        const run = (_compiler, callback) => {
            try {
                const result = BuildAssets({ configPath: this.options.configPath, production: compiler.options.mode === "production" });
                if (result.diagnostics.length) {
                    const text = "\n" + FormatDiagnostics(result.diagnostics);
                    if (result.ok) {
                        logger.warn(text);
                    } else {
                        logger.error(text);
                    }
                }
                if (!result.ok) {
                    callback(new Error("asset build failed - see the errors above."));
                    return;
                }
                if (result.written.length) {
                    logger.info(`${result.written.length} file(s) written.`);
                }
                callback();
            } catch (error) {
                callback(error);
            }
        };
        compiler.hooks.beforeRun.tapAsync(name, run);
        compiler.hooks.watchRun.tapAsync(name, run);

        compiler.hooks.afterCompile.tap(name, compilation => {
            LoadConfig(this.options.configPath).roots.forEach(root => compilation.contextDependencies.add(root.dir));
        });
    }
}

module.exports = AssetsWebpackPlugin;
