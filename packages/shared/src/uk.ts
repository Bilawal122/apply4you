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
  // Countries that actually appear in the index (the audit caught licensed-
  // sponsor badges on Poland and Spain roles). Word-bounded like everything
  // else. "Georgia" is a country or a US state — outside the UK either way.
  /\b(poland|spain|germany|france|netherlands|italy|portugal|romania|bulgaria|hungary|czechia|czech republic|slovakia|slovenia|austria|belgium|denmark|sweden|norway|finland|iceland|switzerland|greece|croatia|serbia|estonia|latvia|lithuania|luxembourg|malta|cyprus|georgia|mexico|brazil|argentina|colombia|chile|peru|japan|china|south korea|singapore|philippines|indonesia|malaysia|thailand|vietnam|pakistan|bangladesh|sri lanka|nepal|nigeria|kenya|ghana|south africa|egypt|morocco|israel|turkey|jordan|qatar|kuwait|bahrain|saudi arabia|united arab emirates)\b/i,
  // Major non-UK job-market cities that routinely appear without a country.
  // (Boston/Portland/Washington exist in the UK too, but the non-UK twin is
  // the overwhelmingly larger market; an explicit "…, UK" still wins above.)
  /\b(warsaw|krakow|wroclaw|gdansk|madrid|barcelona|valencia|seville|bilbao|berlin|munich|hamburg|frankfurt|cologne|paris|lyon|amsterdam|rotterdam|eindhoven|dublin|cork|lisbon|porto|milan|rome|turin|zurich|geneva|vienna|prague|brno|budapest|bucharest|sofia|stockholm|gothenburg|copenhagen|oslo|helsinki|athens|zagreb|belgrade|tallinn|riga|vilnius|toronto|vancouver|montreal|ottawa|calgary|sydney|melbourne|brisbane|perth|auckland|wellington|bangalore|bengaluru|mumbai|delhi|gurgaon|gurugram|noida|hyderabad|chennai|pune|kolkata|tokyo|osaka|seoul|beijing|shanghai|shenzhen|hong kong|taipei|jakarta|manila|kuala lumpur|bangkok|hanoi|ho chi minh|karachi|lahore|islamabad|dhaka|colombo|lagos|nairobi|accra|cape town|johannesburg|cairo|casablanca|tel aviv|istanbul|ankara|dubai|abu dhabi|riyadh|doha|new york|san francisco|seattle|austin|chicago|boston|los angeles|denver|atlanta|dallas|houston|miami|portland|philadelphia|phoenix|san diego|san jose|washington|sao paulo|mexico city|bogota|buenos aires|santiago|lima)\b/i,
  // Bare "US" — locations write "Remote - US", "US Remote". Uppercase-only
  // and word-bounded so "Austin" and prose "us" can never fire.
  /\bUS\b/,
  // A US state code in the conventional "City, ST" tail.
  /,\s*(a[klrz]|c[aot]|d[ce]|fl|ga|hi|i[adln]|k[sy]|la|m[adeinost]|n[cdehjmvy]|o[hkr]|pa|ri|s[cd]|t[nx]|ut|v[at]|w[aivy])\b/i,
];

export const UK_LOCATION_PATTERNS = [...UK_COUNTRY, ...UK_CITY_UNAMBIGUOUS, ...UK_CITY_AMBIGUOUS];

/**
 * Location strings that describe a *mode* of working rather than a place.
 * "Remote" alone is not evidence the role is outside the UK.
 */
const LOCATION_MODE_ONLY =
  /\b(remote|hybrid|flexible|anywhere|distributed|work from home|wfh|global|worldwide|emea|europe|european)\b/i;

/**
 * Whether a UK Home Office sponsor licence is even *relevant* to this role —
 * the gate for the sponsor badge, the ranking boost, and the auto-queue's
 * needs-sponsorship path.
 *
 * A licence is a company-level permission to sponsor workers IN THE UK. A
 * Warsaw or Madrid role at a licensed multinational must not carry a badge a
 * visa-dependent user will read as "this is a viable UK sponsored role".
 *
 * Direction of caution: for a needs-sponsorship user, wrongly implying
 * eligibility is worse than wrongly withholding it. So a location that names
 * a concrete place we cannot recognise as UK counts as NOT relevant, while an
 * absent location or a mode-of-working string ("Remote", "Hybrid — EMEA")
 * stays relevant — the existing badge caveat covers the uncertainty.
 */
export function ukSponsorRelevant(location: string | null | undefined): boolean {
  if (!location || !location.trim()) return true; // unknown ≠ non-UK
  if (isUkLocation(location)) return true;
  // Not recognisably UK: relevant only if the string is a working-mode
  // description with no marker placing it elsewhere ("Remote" yes,
  // "Remote — Poland" no, "Warsaw" no).
  return LOCATION_MODE_ONLY.test(location) && !NON_UK.some((p) => p.test(location));
}

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

/**
 * Comparator putting UK-located items first.
 *
 * Exists as a named, tested thing because the inline form
 * (`Number(isUk(b)) - Number(isUk(a))`) is one transposition away from ranking
 * UK *last*, and that failure is invisible: the list is still fully sorted, the
 * backfill still drains, and the only symptom is that the scarcest supply in
 * the index waits behind everything else.
 */
export function byUkFirst<T>(getLocation: (item: T) => string | null | undefined) {
  return (a: T, b: T): number =>
    Number(isUkLocation(getLocation(b))) - Number(isUkLocation(getLocation(a)));
}
