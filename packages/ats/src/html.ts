const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Numeric references can carry values String.fromCodePoint throws on
 * (surrogate halves, > 0x10FFFF) or that would poison stored text (NUL,
 * C0 controls). One bad reference in one posting must not kill a whole
 * board's poll (TESTING.md ATS-6.1/6.2), so invalid values decode to the
 * original text instead of throwing.
 */
function safeFromCodePoint(original: string, code: number): string {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return original;
  if (code >= 0xd800 && code <= 0xdfff) return original;
  if (code < 0x20 && code !== 0x0a && code !== 0x09) return original;
  return String.fromCodePoint(code);
}

export function decodeEntities(html: string): string {
  return html
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (m, code: string) => safeFromCodePoint(m, Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (m, code: string) => safeFromCodePoint(m, parseInt(code, 16)));
}

/** Strip tags to readable plain text; good enough for embeddings and prompts. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * For sources that serve ENTITY-ESCAPED HTML (Greenhouse's `content`): the
 * markup arrives as &lt;p&gt;, so tags must be decoded into literal form
 * BEFORE stripping — running stripHtml directly finds no tags to strip and
 * its decode pass then materialises raw HTML into the stored text (the
 * job-detail "tag soup" bug). Do not use for literal-HTML sources
 * (Workable): decoding those first would make user-visible text like
 * "&lt;script&gt;" strippable.
 */
export function stripEscapedHtml(html: string): string {
  return stripHtml(decodeEntities(html));
}
