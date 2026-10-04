"use strict";

/**
 * Writing the build's output. Every write is "if changed": an unchanged file isn't touched, so a
 * second build does no work for the dev server's file watcher to notice (and the webpack plugin
 * can't loop on its own output), and files the build no longer produces are removed.
 */

const fs = require("fs");
const path = require("path");

function ContentOf(data) {
    return typeof data === "string" ? Buffer.from(data, "utf8") : data;
}

/** Writes `data` (string or Buffer) to `file` unless it already holds exactly that. Returns whether it wrote. */
function WriteIfChanged(file, data) {
    const content = ContentOf(data);
    if (fs.existsSync(file)) {
        const existing = fs.readFileSync(file);
        if (existing.length === content.length && existing.equals(content)) {
            return false;
        }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return true;
}

/** Copies `src` to `dest` unless an identical file is already there. Returns whether it copied. */
function CopyIfChanged(src, dest) {
    if (fs.existsSync(dest)) {
        const a = fs.statSync(src);
        const b = fs.statSync(dest);
        if (a.size === b.size && fs.readFileSync(src).equals(fs.readFileSync(dest))) {
            return false;
        }
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
}

/** Deletes every file under `dir` that isn't in `keep` (posix paths relative to `dir`), then any folder that's left empty. Returns the removed files. */
function RemoveOrphans(dir, keep) {
    const removed = [];
    const walk = (current, prefix) => {
        if (!fs.existsSync(current)) {
            return;
        }
        fs.readdirSync(current, { withFileTypes: true }).forEach(entry => {
            const rel = prefix ? prefix + "/" + entry.name : entry.name;
            const abs = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(abs, rel);
                if (!fs.readdirSync(abs).length) {
                    fs.rmdirSync(abs);
                }
            } else if (!keep.has(rel)) {
                fs.unlinkSync(abs);
                removed.push(rel);
            }
        });
    };
    walk(dir, "");
    return removed;
}

module.exports = { WriteIfChanged, CopyIfChanged, RemoveOrphans };
