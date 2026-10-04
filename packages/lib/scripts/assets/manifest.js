"use strict";

/**
 * Serialisation that's the same on every machine - sorted object keys, tab indent, LF, a trailing
 * newline - plus the content hashes the runtime turns into cache-busting `?v=` query strings.
 */

const crypto = require("crypto");
const { CompareKeys } = require("./ids");

/** `value` with every object's keys in code-unit order. */
function SortKeys(value) {
    if (Array.isArray(value)) {
        return value.map(SortKeys);
    }
    if (value && typeof value === "object") {
        const out = {};
        Object.keys(value).sort(CompareKeys).forEach(key => {
            if (value[key] !== undefined) {
                out[key] = SortKeys(value[key]);
            }
        });
        return out;
    }
    return value;
}

function StableStringify(value) {
    return JSON.stringify(SortKeys(value), null, "\t") + "\n";
}

/** A short content hash - 10 hex characters is plenty to tell one version of a bundle from the next. */
function Hash(...parts) {
    const h = crypto.createHash("sha1");
    parts.forEach(part => {
        h.update(typeof part === "string" ? part : Buffer.from(part.buffer, part.byteOffset, part.length));
        h.update("\0");
    });
    return h.digest("hex").slice(0, 10);
}

module.exports = { SortKeys, StableStringify, Hash };
