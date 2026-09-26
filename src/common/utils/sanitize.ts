const INVISIBLE_CHARS_REGEX = /[\u200B-\u200D\uFEFF\u00AD\u2060\u180E\u034F\u061C\u115F\u1160\u17B4\u17B5\u3164\uFFA0]/g;

export function sanitizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const cleaned = value.replace(INVISIBLE_CHARS_REGEX, '').trim();
    return cleaned || undefined;
}