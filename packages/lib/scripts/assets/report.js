"use strict";

/** Plain-text output for the CLI: diagnostics grouped by level, and a size table per bundle. */

const { CompareKeys } = require("./ids");

function Mb(bytes) {
    return (bytes / 1048576).toFixed(2) + " MB";
}

function FormatDiagnostics(diagnostics) {
    const line = d => `  ${d.level === "error" ? "error  " : "warning"} ${d.bundle ? `[${d.bundle}] ` : ""}${d.file ? `${d.file}: ` : ""}${d.message}`;
    const errors = diagnostics.filter(d => d.level === "error");
    const warnings = diagnostics.filter(d => d.level !== "error");
    return errors.map(line).concat(warnings.map(line)).join("\n");
}

/** One block per bundle: how it loads, what's in it, and its biggest files. */
function FormatReport(manifest) {
    const lines = [];
    Object.keys(manifest.bundles).sort(CompareKeys).forEach(name => {
        const bundle = manifest.bundles[name];
        const counts = {};
        const ids = Object.keys(bundle.assets);
        ids.forEach(id => {
            counts[bundle.assets[id].kind] = (counts[bundle.assets[id].kind] || 0) + 1;
        });
        const summary = Object.keys(counts).sort(CompareKeys).map(kind => `${counts[kind]} ${kind}`).join(", ");
        lines.push(`${name} (${bundle.preload}, ${Mb(bundle.bytes)}) ${summary}`);
        ids.filter(id => bundle.assets[id].bytes)
            .sort((a, b) => bundle.assets[b].bytes - bundle.assets[a].bytes || CompareKeys(a, b))
            .slice(0, 5)
            .forEach(id => lines.push(`    ${id.padEnd(36)} ${Mb(bundle.assets[id].bytes).padStart(10)}  ${bundle.assets[id].tier || ""}`));
        bundle.atlases.forEach(a => lines.push(`    ${a.name.padEnd(36)} ${Mb(a.bytes).padStart(10)}`));
    });
    return lines.join("\n");
}

module.exports = { FormatDiagnostics, FormatReport };
