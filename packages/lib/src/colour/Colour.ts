/**
 * Parses a hex colour string into a packed RGB number (`0xRRGGBB`).
 *
 * Accepts strings prefixed with `#` or `0x` (case-insensitive), as well as
 * unprefixed hex strings. Whitespace is trimmed before parsing.
 *
 * @param value The source colour string (for example `#FFAA00` or `0xFFAA00`).
 * @param fallback Value returned if `value` cannot be parsed. Defaults to white.
 * @returns A 24-bit packed RGB colour number.
 */
export function ParseHexString(value: string, fallback = 0xFFFFFF): number {
	const normalised = value.trim().replace(/^#/, "").replace(/^0x/i, "");
	const parsed = Number.parseInt(normalised, 16);
	return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Formats a packed RGB number as a `#RRGGBB` string.
 *
 * Values are masked to 24 bits before formatting.
 *
 * @param value A packed RGB colour number.
 * @returns A zero-padded `#RRGGBB` string.
 */
export function ToHexString(value: number): string {
	return `#${(value & 0xFFFFFF).toString(16).padStart(6, "0")}`;
}
