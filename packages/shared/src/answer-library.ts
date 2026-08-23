/**
 * Answer Library (task #31).
 *
 * The resolver can only fill what the CV contains, so questions a CV can never
 * answer — expected salary, notice period, visa status, GPA — get nulled and
 * park the application in `needs_review`. Every one of those is a question the
 * user could have answered once, in advance.
 *
 * So: collect them once, reuse them forever. The answers are the USER'S OWN
 * words, matched to form fields by deterministic patterns — no model call, no
 * inference. That keeps the no-fabrication guarantee intact while removing the
 * single largest cause of needs_review.
 *
 * (AIApply ships the same idea; ours differs in that a library answer is
 * recorded with `you wrote this` provenance rather than being indistinguishable
 * from machine output.)
 */

export type AnswerKind = "text" | "number" | "boolean" | "choice";

export interface LibraryQuestion {
  key: string;
  label: string;
  help: string;
  kind: AnswerKind;
  choices?: string[];
  /**
   * Answering this is not optional in practice.
   *
   * Everything in the library is optional by design — a blank simply parks the
   * field for review. These two are different: almost every employer form asks
   * them, they are always `required`, and nothing in a CV can answer them. Left
   * blank, every application parks on a required field. Worse, before the
   * grounding gate in @apply4you/shared/grounding, the model answered them
   * anyway — inventing the candidate's immigration status on nine real packets.
   *
   * So they stay optional, and the UI stops pretending they are incidental.
   */
  essential?: boolean;
  /**
   * Patterns matched against an ATS field's id + label. Deliberately narrow —
   * a wrong match puts the wrong answer in front of an employer, which is
   * worse than leaving the field for the human.
   */
  patterns: RegExp[];
}

/**
 * Seeded from questions our own resolver most often fails on, plus the ones
 * AIApply pre-seeds. Demographic/EEO questions are deliberately absent and must
 * never be added here — D3.5 forbids auto-filling them under any framing.
 */
export const LIBRARY_QUESTIONS: LibraryQuestion[] = [
  {
    key: "salary_expectation",
    label: "What salary are you looking for?",
    help: "A number or a range, in your usual currency. Used when a form asks for expected or desired salary.",
    kind: "text",
    patterns: [
      /\b(expected|desired|target|requested)\s+(salary|compensation|pay|remuneration)\b/i,
      /\bsalary\s+(expectation|requirement)/i,
      /\bcompensation\s+expectation/i,
    ],
  },
  {
    key: "current_salary",
    label: "What is your current salary?",
    help: "Leave blank if you'd rather not say — the field will simply be left for you to fill in.",
    kind: "text",
    patterns: [/\bcurrent\s+(salary|compensation|pay)\b/i, /\bpresent\s+salary\b/i],
  },
  {
    key: "notice_period",
    label: "What is your notice period?",
    help: 'For example "1 month", "2 weeks", or "immediately available".',
    kind: "text",
    patterns: [/\bnotice\s+period\b/i, /\bhow\s+(soon|quickly).{0,24}\bstart\b/i, /\bavailable\s+to\s+start\b/i, /\bstart\s+date\b/i],
  },
  {
    key: "visa_sponsorship",
    essential: true,
    label: "Will you require visa sponsorship?",
    help: "Answer for the countries you're applying in. Employers ask this constantly and a CV never says it.",
    kind: "choice",
    choices: ["Yes", "No"],
    patterns: [/\b(require|need).{0,24}\bsponsorship\b/i, /\bvisa\s+sponsorship\b/i, /\bsponsorship\s+(now|in the future)/i],
  },
  {
    key: "work_authorization",
    essential: true,
    label: "Are you legally authorised to work where you're applying?",
    help: "The counterpart to the sponsorship question — most forms ask both.",
    kind: "choice",
    choices: ["Yes", "No"],
    patterns: [/\b(legally\s+)?authoriz|authoris/i, /\bright\s+to\s+work\b/i, /\beligible\s+to\s+work\b/i],
  },
  {
    key: "relocation",
    label: "Are you willing to relocate?",
    help: "Answered as-is when a form asks. Doesn't affect which jobs you're matched with.",
    kind: "choice",
    choices: ["Yes", "No", "For the right role"],
    patterns: [/\bwilling\s+to\s+relocat/i, /\brelocation\b/i],
  },
  {
    key: "equity_expectation",
    label: "Do you expect equity or stock options?",
    help: "Only asked by some employers, usually startups.",
    kind: "choice",
    choices: ["Yes", "No", "No preference"],
    patterns: [/\bequity\b/i, /\bstock\s+options\b/i],
  },
  {
    key: "gpa",
    label: "What was your final grade or GPA?",
    help: 'Include the scale — for example "First Class Honours", "3.8/4.0", or "2:1".',
    kind: "text",
    patterns: [/\bgpa\b/i, /\bgrade\s+point\b/i, /\bdegree\s+classification\b/i, /\bfinal\s+grade\b/i],
  },
  {
    key: "linkedin",
    label: "LinkedIn profile URL",
    help: "Used when a form asks for it and your profile doesn't already carry one.",
    kind: "text",
    patterns: [/\blinkedin\b/i],
  },
  {
    key: "portfolio",
    label: "Portfolio or website URL",
    help: "For forms asking for a personal site, portfolio, or GitHub beyond what your profile stores.",
    kind: "text",
    patterns: [/\bportfolio\b/i, /\bpersonal\s+(web)?site\b/i, /\bwebsite\b/i],
  },
  {
    key: "referral",
    label: "How did you hear about us?",
    help: 'Something honest and generic works — for example "Found the role on the company careers page".',
    kind: "text",
    patterns: [/\bhow\s+did\s+you\s+hear\b/i, /\bhow\s+did\s+you\s+find\b/i, /\breferral\s+source\b/i],
  },
  {
    key: "pronouns",
    label: "Pronouns",
    help: "Only used when a form asks directly. Left blank unless you fill it in.",
    kind: "text",
    patterns: [/\bpronoun/i],
  },
];

const BY_KEY = new Map(LIBRARY_QUESTIONS.map((q) => [q.key, q]));

export const libraryQuestion = (key: string): LibraryQuestion | undefined => BY_KEY.get(key);

/**
 * Finds the library question an ATS field is asking, or null.
 *
 * Returns null on ANY ambiguity (two questions matching) — leaving a field for
 * the human is always safer than confidently answering the wrong question.
 */
export function matchLibraryQuestion(fieldId: string, fieldLabel: string): LibraryQuestion | null {
  const haystack = `${fieldId} ${fieldLabel}`;
  const hits = LIBRARY_QUESTIONS.filter((q) => q.patterns.some((re) => re.test(haystack)));
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * Resolves form fields against the user's saved answers.
 * Only non-empty answers are used; everything else falls through to the normal
 * resolver path and, failing that, to needs_review.
 */
export function resolveFromLibrary(
  fields: Array<{ id: string; label: string }>,
  answers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const q = matchLibraryQuestion(field.id, field.label);
    if (!q) continue;
    const answer = answers[q.key]?.trim();
    if (answer) out[field.id] = answer;
  }
  return out;
}
