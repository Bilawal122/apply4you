/**
 * Job descriptions arrive in whatever shape the ATS stores them: Greenhouse
 * sends HTML for every posting (avg ~8KB), Ashby and Lever mostly plain text.
 * Feed cards need a short readable excerpt, so tags come out and entities go
 * back to characters.
 *
 * Deliberately not a sanitiser — the output is rendered as TEXT, never as HTML,
 * so escaping is React's job. This only has to read well.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

/**
 * Same guard as packages/ats/src/html.ts safeFromCodePoint, for the same
 * reason at a worse blast radius: String.fromCodePoint throws RangeError on
 * out-of-range or surrogate references, and this decoder runs inside the
 * /feed and /jobs/[id] server-component renders — one bad reference in one
 * stored description would 500 the whole page for every user whose matches
 * include it. Ingestion now deliberately preserves such references as
 * literal text, so render-time MUST tolerate them.
 */
function safeFromCodePoint(original: string, code: number): string {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return original;
  if (code >= 0xd800 && code <= 0xdfff) return original;
  if (code === 0x0d) return "\n"; // CR: fold into the newline its LF partner provides
  if (code < 0x20 && code !== 0x0a && code !== 0x09) return original;
  return String.fromCodePoint(code);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (m, n: string) => safeFromCodePoint(m, Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n: string) => safeFromCodePoint(m, parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Full plain-text form of a description for the job-detail page. Newlines are
 * preserved (the page renders whitespace-pre-wrap). Exists as defense in
 * depth: ingestion strips HTML, but rows stored before the Greenhouse
 * escaped-entity fix (see packages/ats/src/html.ts stripEscapedHtml) hold raw
 * markup until the fix-descriptions backfill runs — and this keeps the page
 * readable even if an ingestion regression ever recurs. Output is still
 * rendered as text, never as HTML.
 */
export function plainDescription(description: string): string {
  return decodeEntities(
    description
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
      .replace(/<\s*li[^>]*>/gi, "- ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain-text excerpt of a job description, or null when there's nothing usable. */
export function descriptionExcerpt(description: string | null, maxChars = 260): string | null {
  if (!description) return null;

  const text = decodeEntities(
    description
      // Block-level tags become spaces so words don't run together.
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();

  // Workable postings frequently store an empty or near-empty description
  // (measured: avg length 1 across ~4.3k live rows), so guard on substance
  // rather than mere presence.
  if (text.length < 40) return null;
  if (text.length <= maxChars) return text;

  // Cut on a word boundary rather than mid-word.
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
