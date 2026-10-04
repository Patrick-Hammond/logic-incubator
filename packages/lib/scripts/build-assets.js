#!/usr/bin/env node
"use strict";

/**
 * Builds a game's assets: packs sprite frames into atlases, copies what the game loads, and
 * writes a manifest and the typed id declarations. See assets/build.js for the pipeline and
 * assets/config.js for assets.config.json.
 *
 * Usage: node build-assets.js [--config assets.config.json] [--production] [--check] [--clean] [--report]
 *   --config      the game's config (default ./assets.config.json)
 *   --production  leave dev-only roots (the editor's assets) out of the output
 *   --check       write nothing; fail if the committed declarations are out of date
 *   --clean       remove the output folder first
 *   --report      print a size table per bundle
 */

const path = require("path");
const { BuildAssets } = require("./assets/build");
const { FormatDiagnostics, FormatReport } = require("./assets/report");

function ParseArgs(argv) {
    const args = { config: "assets.config.json", production: false, check: false, clean: false, report: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--config") {
            args.config = argv[++i];
        } else if (arg === "--production" || arg === "--check" || arg === "--clean" || arg === "--report") {
            args[arg.slice(2)] = true;
        } else {
            console.error(`Unknown argument "${arg}". Usage: build-assets.js [--config file] [--production] [--check] [--clean] [--report]`);
            process.exit(2);
        }
    }
    return args;
}

function Main() {
    const args = ParseArgs(process.argv.slice(2));
    let result;
    try {
        result = BuildAssets({ configPath: path.resolve(args.config), production: args.production, check: args.check, clean: args.clean });
    } catch (error) {
        console.error(`assets: ${error.message}`);
        process.exit(1);
    }

    if (result.diagnostics.length) {
        console.log(FormatDiagnostics(result.diagnostics));
    }
    if (args.report && result.manifest) {
        console.log(FormatReport(result.manifest));
    }
    if (!result.ok) {
        console.error(`assets: failed (${result.diagnostics.filter(d => d.level === "error").length} error(s)).`);
        process.exit(1);
    }
    console.log(args.check ? "assets: up to date." : `assets: ${result.written.length} file(s) written, ${result.removed.length} removed.`);
}

Main();
