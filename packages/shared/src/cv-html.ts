import type { Profile } from "./schemas/profile.js";
import type { ResolvedCv } from "./schemas/packet.js";

/**
 * Renders a tailored CV to ATS-friendly HTML (task #40).
 *
 * Lives in shared, not the worker, because two callers need it and they can't
 * share a runtime: the worker turns this into a PDF via Playwright, and the web
 * app serves the same markup as the user's pre-approval preview. Keeping one
 * function means the preview is the document — not a lookalike that can drift
 * from what actually gets sent.
 *
 * Pure string building, no browser APIs, so it runs in both places.
 *
 * Deliberately plain markup: no columns, tables, icons or webfonts. ATS parsers
 * mangle all four, and a CV a parser can't read is worse than an ugly one.
 */

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function contactLine(profile: Profile): string {
  return [profile.location, profile.phone, profile.email].map((s) => s?.trim()).filter(Boolean).join(" • ");
}

function linksLine(profile: Profile): string {
  const strip = (u: string): string => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return [profile.links.portfolio, profile.links.linkedin, profile.links.github]
    .filter((u): u is string => Boolean(u?.trim()))
    .map(strip)
    .join(" • ");
}

/** "2021-03" -> "Mar 2021"; passes through "present" and anything unparseable. */
function humanDate(value: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!m) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
}

const dateRange = (start: string, end: string): string =>
  [humanDate(start), humanDate(end)].filter(Boolean).join(" – ");

export function renderCvHtml(profile: Profile, cv: ResolvedCv): string {
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const contact = contactLine(profile);
  const links = linksLine(profile);

  const roles = cv.roles
    .map(
      (r) => `<div class="entry">
        <div class="row"><span class="ttl">${esc(r.title)} — ${esc(r.company)}</span><span class="meta">${esc(dateRange(r.start, r.end))}</span></div>
        ${r.bullets.length ? `<ul>${r.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      </div>`,
    )
    .join("");

  const projects = cv.projects
    .map(
      (pr) => `<div class="entry">
        <div class="row"><span class="ttl">${esc(pr.name)}</span>${pr.url ? `<span class="meta">${esc(pr.url.replace(/^https?:\/\//, ""))}</span>` : ""}</div>
        ${pr.tech ? `<div class="sub">${esc(pr.tech)}</div>` : ""}
        ${pr.bullets.length ? `<ul>${pr.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      </div>`,
    )
    .join("");

  const education = cv.education
    .map(
      (e) => `<div class="entry">
        <div class="row"><span class="ttl">${esc([e.degree, e.field].filter(Boolean).join(", "))}</span><span class="meta">${esc(dateRange(e.start, e.end))}</span></div>
        <div class="sub">${esc(e.school)}</div>
      </div>`,
    )
    .join("");

  const sections = [
    cv.summary.trim() ? `<h2>Profile</h2><p class="summary">${esc(cv.summary.trim())}</p>` : "",
    roles ? `<h2>Experience</h2>${roles}` : "",
    projects ? `<h2>Projects</h2>${projects}` : "",
    education ? `<h2>Education</h2>${education}` : "",
    cv.skills.length ? `<h2>Skills</h2><p>${esc(cv.skills.join(" • "))}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} — CV</title><style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; margin: 0; font-size: 10.5px; line-height: 1.4; }
    .page { padding: 34px 44px; }
    h1 { text-align: center; font-size: 22px; margin: 0 0 4px; letter-spacing: 0.3px; }
    .contact { text-align: center; color: #444; font-size: 10px; margin-bottom: 2px; }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #999; padding-bottom: 2px; margin: 13px 0 6px; }
    .entry { margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; align-items: baseline; }
    .ttl { font-weight: bold; }
    .meta { color: #555; font-size: 9.5px; white-space: nowrap; padding-left: 10px; }
    .sub { font-style: italic; color: #444; margin: 1px 0 2px; }
    ul { margin: 2px 0 0 15px; padding: 0; }
    li { margin-bottom: 2px; }
    .summary { margin: 2px 0 0; }
    p { margin: 2px 0; }
    @media screen { body { background: #f1f3f6; } .page { background: #fff; max-width: 794px; margin: 16px auto; box-shadow: 0 1px 4px rgba(0,0,0,.12); min-height: 1000px; } }
  </style></head><body><div class="page">
    <h1>${esc(name)}</h1>
    ${contact ? `<div class="contact">${esc(contact)}</div>` : ""}
    ${links ? `<div class="contact">${esc(links)}</div>` : ""}
    ${sections}
  </div></body></html>`;
}
