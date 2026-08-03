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

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
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
