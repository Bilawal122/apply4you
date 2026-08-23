import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { isDemographicField, type Field, type ResolvedValues } from "@apply4you/shared";
import { registerAllAdapters, getAdapter, type LocalFile } from "@apply4you/ats";

/**
 * Task #15 (mechanical half): validates the never-executed submit path against
 * a local high-fidelity mock of a Greenhouse embed form — fill fidelity, the
 * submit click, both confirmation-detection branches, form_error capture,
 * confirmation_timeout, captcha blocking, and the v3-badge false-positive
 * guard. No real ATS is touched. The residual risk (does a real Greenhouse
 * accept the POST) still needs a self-owned sandbox board.
 *
 * Run: pnpm --filter @apply4you/worker exec tsx src/scripts/test-submit-mock.ts
 */

const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}`;

// ---------- tiny multipart parser (test-only) ----------
interface PostedForm {
  fields: Record<string, string | string[]>;
  files: Record<string, { filename: string; size: number }>;
}

function parseMultipart(body: Buffer, contentType: string): PostedForm {
  const out: PostedForm = { fields: {}, files: {} };
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return out;
  const parts = body.toString("binary").split(`--${boundary}`);
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headers = part.slice(0, headerEnd);
    const name = headers.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    const value = part.slice(headerEnd + 4).replace(/\r\n$/, "");
    const filename = headers.match(/filename="([^"]*)"/)?.[1];
    if (filename !== undefined) {
      out.files[name] = { filename, size: Buffer.byteLength(value, "binary") };
    } else {
      const existing = out.fields[name];
      if (existing === undefined) out.fields[name] = value;
      else out.fields[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    }
  }
  return out;
}

// ---------- the mock Greenhouse-style form ----------
function captchaBlock(mode: string): string {
  if (mode === "captcha") {
    // Visible v2-style anchor iframe NOT inside a badge + empty response token.
    return `<iframe title="reCAPTCHA" src="/recaptcha/api2/anchor?k=test" style="width:304px;height:78px;border:0"></iframe>
      <textarea name="g-recaptcha-response" style="display:none"></textarea>`;
  }
  if (mode === "badge") {
    // v3 ambient badge: same anchor, wrapped in .grecaptcha-badge — must NOT block.
    return `<div class="grecaptcha-badge" style="width:256px;height:60px;overflow:hidden">
      <iframe title="reCAPTCHA" src="/recaptcha/api2/anchor?k=test" style="width:256px;height:60px;border:0"></iframe>
    </div>
    <textarea name="g-recaptcha-response" style="display:none"></textarea>`;
  }
  return "";
}

function formPage(mode: string): string {
  return `<!doctype html><html><head><title>Mock Job Application</title><style>
    .menu[hidden]{display:none}
    .menu div[role="option"]{padding:4px;cursor:pointer;border:1px solid #ccc}
  </style></head><body>
  <h1>Software Engineer, Mock — Apply</h1>
  <form id="application_form" action="/apply?mode=${mode}" method="POST" enctype="multipart/form-data">
    <label for="first_name">First Name *</label><input id="first_name" name="first_name" type="text">
    <label for="last_name">Last Name *</label><input id="last_name" name="last_name" type="text">
    <label for="email">Email *</label><input id="email" name="email" type="text">
    <label for="phone">Phone</label><input id="phone" name="phone" type="text">

    <label for="resume">Resume/CV *</label>
    <input id="resume" name="resume" type="file">

    <label for="question_cover">Why do you want to work here?</label>
    <textarea id="question_cover" name="question_cover"></textarea>

    <!-- demographic trap: must NEVER be auto-filled even when a value exists -->
    <label for="gender">Gender (voluntary self-identification)</label>
    <input id="gender" name="gender" type="text">

    <!-- react-select-style single select (mirrors Greenhouse multi_value_single_select) -->
    <label>Are you authorized to work in this country? *</label>
    <div class="select-wrap">
      <input id="question_auth" role="combobox" readonly placeholder="Select...">
      <div class="menu" hidden>
        <div role="option">Yes</div>
        <div role="option">No</div>
        <div role="option">Decline to self identify</div>
      </div>
    </div>
    <input type="hidden" name="question_auth" id="question_auth_value">

    <!-- checkbox-group multiselect (mirrors Greenhouse multi_value_multi_select) -->
    <fieldset id="question_langs[]">
      <legend>Which languages do you use?</legend>
      <label><input type="checkbox" name="question_langs[]" value="TypeScript">TypeScript</label>
      <label><input type="checkbox" name="question_langs[]" value="Python">Python</label>
      <label><input type="checkbox" name="question_langs[]" value="COBOL">COBOL</label>
    </fieldset>

    ${captchaBlock(mode)}
    <button type="submit">Submit Application</button>
  </form>
  <script>
    const combo = document.getElementById("question_auth");
    const menu = document.querySelector(".menu");
    const hidden = document.getElementById("question_auth_value");
    document.querySelector(".select-wrap").addEventListener("click", () => { menu.hidden = false; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.hidden = true; });
    for (const opt of menu.querySelectorAll('[role="option"]')) {
      opt.addEventListener("click", (e) => {
        combo.value = e.target.textContent; hidden.value = e.target.textContent;
        menu.hidden = true; e.stopPropagation();
      });
    }
  </script>
  </body></html>`;
}

const CONFIRM_PAGE = `<!doctype html><html><head><title>Confirmation</title></head>
  <body><h1>Application submitted</h1><p>Thank you for applying. We'll be in touch.</p></body></html>`;

// ---------- scenario server ----------
const lastPost: Record<string, PostedForm> = {};

function startServer(): Promise<() => void> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", BASE);
    const mode = url.searchParams.get("mode") ?? "redirect";

    if (req.method === "GET" && url.pathname === "/form") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(formPage(mode));
      return;
    }
    if (req.method === "GET" && url.pathname === "/confirmation") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(CONFIRM_PAGE);
      return;
    }
    if (url.pathname.startsWith("/recaptcha/")) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>fake widget</body></html>");
      return;
    }
    if (req.method === "POST" && url.pathname === "/apply") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        lastPost[mode] = parseMultipart(Buffer.concat(chunks), req.headers["content-type"] ?? "");
        if (mode === "redirect") {
          res.writeHead(302, { location: "/confirmation" });
          res.end();
        } else if (mode === "inline") {
          res.writeHead(200, { "content-type": "text/html" });
          res.end(`<html><body><h1>Thank you for applying to MockCo!</h1></body></html>`);
        } else if (mode === "error") {
          res.writeHead(200, { "content-type": "text/html" });
          res.end(`<html><body><h1>Please fix the following</h1>
            <div class="error-message" role="alert">Email is invalid</div></body></html>`);
        } else {
          // timeout: neither confirmation URL nor text nor error markers
          res.writeHead(200, { "content-type": "text/html" });
          res.end(`<html><body><h1>Processing</h1><p>Please wait.</p></body></html>`);
        }
      });
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve(() => server.close()));
  });
}

// ---------- fields + values under test ----------
const FIELDS: Field[] = [
  { id: "resume", label: "Resume/CV", type: "file", required: true },
  { id: "first_name", label: "First Name", type: "text", required: true },
  { id: "last_name", label: "Last Name", type: "text", required: true },
  { id: "email", label: "Email", type: "text", required: true },
  { id: "phone", label: "Phone", type: "text", required: false },
  { id: "question_cover", label: "Why do you want to work here?", type: "textarea", required: false },
  { id: "gender", label: "Gender (voluntary self-identification)", type: "text", required: false },
  { id: "question_auth", label: "Are you authorized?", type: "select", options: ["Yes", "No"], required: true },
  { id: "question_langs[]", label: "Which languages do you use?", type: "multiselect", options: ["TypeScript", "Python", "COBOL"], required: false },
];

const VALUES: ResolvedValues = {
  first_name: "Test",
  last_name: "Candidate",
  email: "test.candidate@example.com",
  phone: "+44 7000 000000",
  question_cover: "I build reliable form-filling machinery and want to prove it works.",
  // Resolution NEVER generates demographic values (DECISIONS.md D3) — this is
  // exactly what resolved_fields contains for such a field in the auto flow.
  gender: null,
  question_auth: "Yes",
  "question_langs[]": "TypeScript||Python",
};

// ---------- assertions ----------
let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  // --- pure-function gate: isDemographicField must catch known evasions and
  // spare legitimate questions (D3 hard rule; regressions here are critical).
  console.log("--- isDemographicField ---");
  const mustMatch = [
    "Ethnicity",
    "Disability status",
    "Do you have a disability?",
    "Voluntary Self-Identification of Disability",
    "Sexuality",
    "disabilities",
    "veterans",
    "genderIdentity",
    "veteranStatus",
    "raceEthnicity",
    "Are you Hispanic/Latino?",
    "date_of_birth",
    "Pronouns",
    "Religion",
  ];
  const mustNotMatch = [
    "What is your notice period?",
    "Current location",
    "How did you hear about us?",
    "trace elements experience",
    "Can you embrace ambiguity?",
    "Does this role engender excitement?",
    "Salary expectations",
  ];
  for (const label of mustMatch) {
    check(`demographic detected: "${label}"`, isDemographicField("question_1", label));
  }
  for (const label of mustNotMatch) {
    check(`NOT demographic: "${label}"`, !isDemographicField("question_1", label));
  }

  registerAllAdapters();
  const adapter = getAdapter("greenhouse");
  const close = await startServer();

  const dir = mkdtempSync(join(tmpdir(), "a4y-mock-"));
  const resumePath = join(dir, "resume.pdf");
  writeFileSync(resumePath, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF\n");
  const resume: LocalFile = { path: resumePath, filename: "resume.pdf", mimeType: "application/pdf" };

  const browser = await chromium.launch({ headless: true });

  async function runScenario(mode: string, fill: boolean): Promise<{ outcome: string; reason?: string; detail?: string } | null> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/form?mode=${mode}`, { waitUntil: "domcontentloaded" });
    let result: { outcome: string; reason?: string; detail?: string } | null = null;
    if (fill) {
      await adapter.fillForm(page, FIELDS, VALUES, resume);
      result = await adapter.submit(page);
    }
    return result;
  }

  // 1. Happy path A: POST -> 302 -> /confirmation (URL branch)
  console.log("\n--- scenario: redirect confirmation ---");
  const r1 = await runScenario("redirect", true);
  check("outcome is submitted (URL branch)", r1?.outcome === "submitted", JSON.stringify(r1));
  const posted = lastPost["redirect"];
  check("first_name posted", posted?.fields["first_name"] === "Test");
  check("last_name posted", posted?.fields["last_name"] === "Candidate");
  check("email posted", posted?.fields["email"] === "test.candidate@example.com");
  check("phone posted", posted?.fields["phone"] === "+44 7000 000000");
  check("textarea posted", posted?.fields["question_cover"] === VALUES["question_cover"]);
  check("combobox picked Yes", posted?.fields["question_auth"] === "Yes", String(posted?.fields["question_auth"]));
  const langs = posted?.fields["question_langs[]"];
  check(
    "multiselect checked TypeScript+Python only",
    Array.isArray(langs) && langs.length === 2 && langs.includes("TypeScript") && langs.includes("Python"),
    JSON.stringify(langs),
  );
  check("resume file uploaded", (posted?.files["resume"]?.size ?? 0) > 20, JSON.stringify(posted?.files["resume"]));
  check(
    "demographic field left empty in the auto flow (resolve nulls it, fill skips nulls)",
    posted?.fields["gender"] === "",
    `posted gender="${String(posted?.fields["gender"])}"`,
  );

  // 2. Happy path B: inline "thank you" text (text branch)
  console.log("\n--- scenario: inline confirmation text ---");
  const r2 = await runScenario("inline", true);
  check("outcome is submitted (text branch)", r2?.outcome === "submitted", JSON.stringify(r2));

  // 3. Validation error page -> form_error with detail
  console.log("\n--- scenario: form validation error (20s wait) ---");
  const r3 = await runScenario("error", true);
  check("outcome failed/form_error", r3?.outcome === "failed" && r3?.reason === "form_error", JSON.stringify(r3));
  check("error detail captured", (r3?.detail ?? "").includes("Email is invalid"), r3?.detail);

  // 4. No confirmation signal at all -> confirmation_timeout
  console.log("\n--- scenario: confirmation timeout (20s wait) ---");
  const r4 = await runScenario("timeout", true);
  check("outcome failed/confirmation_timeout", r4?.outcome === "failed" && r4?.reason === "confirmation_timeout", JSON.stringify(r4));

  // 5. Unsolved v2 captcha on the form -> detectBlock reports captcha (pre-fill gate)
  console.log("\n--- scenario: unsolved v2 captcha ---");
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/form?mode=captcha`, { waitUntil: "domcontentloaded" });
    const block = await adapter.detectBlock(page);
    check("v2 challenge detected as captcha", block === "captcha", String(block));
  }

  // 6. v3 ambient badge -> must NOT be a false positive
  console.log("\n--- scenario: v3 badge false-positive guard ---");
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/form?mode=badge`, { waitUntil: "domcontentloaded" });
    const block = await adapter.detectBlock(page);
    check("v3 badge is NOT a block", block === null, String(block));
  }

  // 7. Regression (TESTING.md T0-2): a throwing resume upload must not abort
  //    the fill. Greenhouse opened its per-field try AFTER the file branch, so
  //    a single unreadable resume escaped the loop and left every remaining
  //    field empty — on the one ATS cleared for real submissions.
  console.log("\n--- scenario: resume upload throws mid-fill ---");
  {
    const missing: LocalFile = { path: join(dir, "vanished.pdf"), filename: "vanished.pdf", mimeType: "application/pdf" };
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/form?mode=inline`, { waitUntil: "domcontentloaded" });

    let threw: string | null = null;
    try {
      await adapter.fillForm(page, FIELDS, VALUES, missing);
    } catch (err) {
      threw = String(err).slice(0, 100);
    }
    check("fillForm survives an unreadable resume", threw === null, threw ?? "");

    const r7 = await adapter.submit(page);
    const p7 = lastPost["inline"];
    check(
      "every non-file field still posted after the file throw",
      p7?.fields["first_name"] === "Test" &&
        p7?.fields["last_name"] === "Candidate" &&
        p7?.fields["email"] === "test.candidate@example.com" &&
        p7?.fields["question_auth"] === "Yes",
      JSON.stringify(p7?.fields),
    );
    check("submission still completes", r7?.outcome === "submitted", JSON.stringify(r7));
  }

  await browser.close();
  close();

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} — submit machinery ${failures === 0 ? "validated against mock" : "needs fixes"}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
