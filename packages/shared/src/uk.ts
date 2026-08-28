/**
 * Is this job located in the UK?
 *
 * Needed because the product's wedge is UK-based, the index is not (6% of open
 * jobs at the time of writing), and "how much of this board is usable" is a
 * question worth being able to answer honestly. ATS location strings are free
 * text across four vendors, so this is a heuristic — but a careful one.
 *
 * The trap this exists to avoid: the obvious implementation is a substring
 * check for a handful of city names, and it is wrong in two directions at once.
 *
 *  - `"uk"` as a bare substring matches **Ukraine**, and also "Paducah",
 *    "Milwaukee" and "Waukesha". It must be word-bounded.
 *  - Several of the UK's biggest cities share a name with a US one, and the US
 *    twin is often the larger job market: Manchester NH, Birmingham AL,
 *    Cambridge MA, Newcastle WA, Reading PA. A plain `includes("cambridge")`
 *    counts Kendall Square as British.
 *
 * So ambiguous names are only accepted when nothing in the string marks it as
 * somewhere else.
 */

/** Explicit country/region markers. Unambiguous wherever they appear. */
const UK_COUNTRY = [
  /\bunited kingdom\b/i,
  /\bu\.?k\.?\b/i,
  /\bgreat britain\b/i,
  /\bengland\b/i,
  /\bscotland\b/i,
  /\bwales\b/i,
  /\bnorthern ireland\b/i,
];

/** Cities with no significant same-named job market elsewhere. */
const UK_CITY_UNAMBIGUOUS = [
  /\blondon\b/i,
  /\bedinburgh\b/i,
  /\bglasgow\b/i,
  /\bcardiff\b/i,
  /\bbelfast\b/i,
  /\bleeds\b/i,
  /\bsheffield\b/i,
  /\bliverpool\b/i,
  /\bbristol\b/i,
  /\bnottingham\b/i,
  /\bleicester\b/i,
  /\bcoventry\b/i,
  /\bbrighton\b/i,
  /\bsouthampton\b/i,
  /\bmilton keynes\b/i,
  /\baberdeen\b/i,
  /\bhounslow\b/i,
  /\bcroydon\b/i,
  /\bslough\b/i,
  /\bswindon\b/i,
];

/**
 * Cities whose name is also a notable non-UK job market. Accepted only when the
 * string carries no marker placing it elsewhere.
 */
const UK_CITY_AMBIGUOUS = [
  /\bmanchester\b/i, // …NH
  /\bbirmingham\b/i, // …AL
  /\bcambridge\b/i, // …MA
  /\bnewcastle\b/i, // …WA, and Australia
  /\breading\b/i, // …PA
  /\boxford\b/i, // …MS
  /\bwarrington\b/i, // …PA
];

/** Markers that place a string outside the UK. */
const NON_UK = [
  /\bunited states\b/i,
  /\bu\.?s\.?a\.?\b/i,
  /\bcanada\b/i,
  /\baustralia\b/i,
  /\bnew zealand\b/i,
  /\bireland\b/i, // the Republic; Northern Ireland is matched above and wins
  /\bindia\b/i,
  /\bukraine\b/i,
  // A US state code in the conventional "City, ST" tail.
  /,\s*(a[klrz]|c[aot]|d[ce]|fl|ga|hi|i[adln]|k[sy]|la|m[adeinost]|n[cdehjmvy]|o[hkr]|pa|ri|s[cd]|t[nx]|ut|v[at]|w[aivy])\b/i,
];

export const UK_LOCATION_PATTERNS = [...UK_COUNTRY, ...UK_CITY_UNAMBIGUOUS, ...UK_CITY_AMBIGUOUS];

export function isUkLocation(location: string | null | undefined): boolean {
  if (!location) return false;

  // An explicit country marker beats everything — "London, UK" and
  // "Manchester, United Kingdom" are settled before the ambiguity check runs,
  // and so is the rare "Cambridge, England".
  if (UK_COUNTRY.some((p) => p.test(location))) return true;

  const placedElsewhere = NON_UK.some((p) => p.test(location));
  if (placedElsewhere) return false;

  return (
    UK_CITY_UNAMBIGUOUS.some((p) => p.test(location)) ||
    UK_CITY_AMBIGUOUS.some((p) => p.test(location))
  );
}
