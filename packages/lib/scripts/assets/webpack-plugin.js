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
 *
 * Outside production it also mounts the sprite editor's API (sprite-api.js) on the dev server, at /__sprite-api, so the
 * in-game editor can read and save sprite art; `spriteApi: false` leaves it out. Saving only writes source files - the
 * watching build above does the rest.
 */

const { BuildAssets } = require("./build");
const { LoadConfig } = require("./config");
const { FormatDiagnostics } = require("./report");
const { CreateSpriteApi } = require("./sprite-api");

const SPRITE_API_PATH = "/__sprite-api";

/**
 * Errors a build can hit because a file was being replaced as it ran (an editor saving by delete-and-write, `git checkout`) - gone for a
 * moment. They're worth another try shortly; any other error isn't.
 */
const TRANSIENT_FILE_ERRORS = ["ENOENT", "EBUSY", "EPERM", "EACCES"];
const BUILD_RETRIES = 3;
const BUILD_RETRY_DELAY_MS = 250;

class AssetsWebpackPlugin {
    constructor(options) {
        this.options = options;
    }

    apply(compiler) {
        const name = "AssetsWebpackPlugin";
        const logger = compiler.getInfrastructureLogger(name);
        const build = this.options.build || BuildAssets;
        const retryDelay = this.options.retryDelayMs === undefined ? BUILD_RETRY_DELAY_MS : this.options.retryDelayMs;
        const run = (_compiler, callback, retriesLeft = BUILD_RETRIES) => {
            try {
                const result = build({ configPath: this.options.configPath, production: compiler.options.mode === "production" });
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
                if (retriesLeft > 0 && TRANSIENT_FILE_ERRORS.indexOf(error.code) >= 0) {
                    // Without this the dev server's compile fails and it sits waiting for one that never comes, until something else changes.
                    logger.warn(`${error.code} while building (${error.path || error.message}) - trying again shortly.`);
                    setTimeout(() => run(_compiler, callback, retriesLeft - 1), retryDelay);
                    return;
                }
                callback(error);
            }
        };
        compiler.hooks.beforeRun.tapAsync(name, (c, callback) => run(c, callback));
        compiler.hooks.watchRun.tapAsync(name, (c, callback) => run(c, callback));

        if (this.options.spriteApi !== false && compiler.options.mode !== "production") {
            // Added to whatever the game's own devServer.setupMiddlewares does, ahead of the dev server's own handlers.
            const devServer = compiler.options.devServer || (compiler.options.devServer = {});
            const inherited = devServer.setupMiddlewares;
            devServer.setupMiddlewares = (middlewares, server) => {
                const list = inherited ? inherited(middlewares, server) : middlewares;
                list.unshift({ name: "sprite-api", path: SPRITE_API_PATH, middleware: CreateSpriteApi({ configPath: this.options.configPath, base: SPRITE_API_PATH }) });
                return list;
            };
        }

        compiler.hooks.afterCompile.tap(name, compilation => {
            LoadConfig(this.options.configPath).roots.forEach(root => compilation.contextDependencies.add(root.dir));
        });
    }
}

module.exports = AssetsWebpackPlugin;
