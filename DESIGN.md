# Design system — "Official register"

*Written 2026-08-03. The visual language for the web app. Tokens live in
[apps/web/app/globals.css](apps/web/app/globals.css); atoms in
[apps/web/components/ui.tsx](apps/web/components/ui.tsx).*

## What it replaced and why

The previous look was Geist Sans + Geist Mono, Tailwind's `teal-700`
unedited, gray-50 background, white cards, `rounded-md`. That's the stock
Next.js/shadcn house style — competent, but it belonged to no one, and in a
category whose competitors are widely distrusted (billing dark patterns,
2.4★ ratings, countdown timers) looking generic is a real cost.

## The subject

Apply4You's actual world is **forms, registers and stamps**: the Home Office
register of licensed sponsors, an ATS application form, an approval. The
audience is UK graduates and visa-sponsorship seekers — people whose lives
already revolve around official documents. So the interface borrows that
grammar (field label → value slot → hairline rule → stamped verdict) rather
than generic SaaS card-and-pill.

## The two rules

**1. Voice.** Everything the machine produced — scores, statuses, filled
values, counts, verdicts, timestamps — is set in **IBM Plex Mono**.
Everything a *person* wrote is **IBM Plex Sans**. One super-family, two
registers, so the distinction reads as deliberate rather than decorative.

> Corollary worth remembering: an ATS question ("Will you require sponsorship
> for a work permit?") was written by a *human employer*, so it's sans and
> keeps its original sentence case. An early version pushed those through the
> mono uppercase label style and long questions became genuinely unreadable.

**2. Provenance.** Every value can declare where it came from. This is the
product's trust argument made visible: competitors advertise how much was
filled automatically; we show *who wrote each thing* — including the fields
nobody has answered yet.

## Tokens

| Token | Value | Use |
|---|---|---|
| `ink` | `#12161f` | primary text |
| `ink-soft` | `#5a6472` | secondary text |
| `ink-faint` | `#8b94a3` | mono labels, metadata |
| `paper` | `#f1f3f6` | page background (cool stock) |
| `card` | `#ffffff` | surfaces |
| `line` / `line-soft` | `#d9dee6` / `#e7ebf1` | structural rules / row dividers |
| `accent` | `#1b4dd8` | **cobalt — stamp ink.** actions, verified, submitted |
| `attention` | `#a65a00` | amber — *needs you*, and nothing else |
| `danger` | `#a3342a` | brick — failed |

Radius is **3px** everywhere (`rounded-[3px]`). Documents don't have soft
corners; 3px rather than 0 keeps it from tipping into broadsheet pastiche.

## Utility classes

- `.label-mono` — mono, 11px, uppercase, `0.09em` tracking. The connective
  tissue: every machine-side label in the app. **Not for employer questions.**
- `.display` — weight 600, `-0.035em` tracking. Headlines.
- `.field-rule` — consecutive siblings get a hairline between them. The
  ruled-register row.
- `.stamp` — the signature element (below).

## Components

`Provenance` renders one of four states. Only four, because only four are
honestly derivable from what we store:

| State | Copy | Derived from |
|---|---|---|
| `profile` | from your profile | field has a value the resolver filled |
| `ai` | written by AI | the cover letter (genuinely model-generated) |
| `you` | you wrote this | user edited the field this session |
| `unknown` | needs you | field is required and empty |

We deliberately **do not** split ordinary fields into "typed from your CV"
vs "chosen by the model from your CV" — the resolver doesn't record which
path filled each one, and inventing that distinction would be exactly the
confident guess this product refuses to make.

`NeedsYouStamp` is the one flourish the system allows: a slightly rotated,
outlined amber rubber stamp on unanswered required fields. It earns the
rotation because admitting the gap *is* the product — no competitor shows
the field they couldn't fill. It appears nowhere else, and everything around
it stays perfectly square.

`ScoreBadge` is a right-aligned tabular mono numeral, nothing more. It
briefly had a progress bar underneath; that read as an underline rather than
a gauge and couldn't visually distinguish 79 from 80 anyway. A sorted column
of tabular numerals scans better than either.

## Quality floor

- No horizontal page scroll at 375px. Wide content scrolls inside its own
  container — the app nav is `overflow-x-auto` for exactly this reason.
  Grid children carry `min-w-0`, or a single mobile column inherits the
  widest child's min-content and silently blows out the page.
- Focus-visible outlines on every interactive atom.
- The only animation in the system is the existing button `Spinner`. The
  stamp's rotation is a static transform, so there is nothing for
  `prefers-reduced-motion` to suppress.

## Where it's applied

Tokens and atoms propagate to all 23 routes. Bespoke layout work was done on
the three surfaces that decide the outcome: the **landing page** (register
extract of real openings + the provenance legend), the **job feed** (one
ruled register rather than a stack of cards), and the **application review**
(ruled field rows carrying provenance, gaps stamped). Everything else —
dashboard, profile, preferences, onboarding, auth, legal — inherits the
system without custom layout work.
