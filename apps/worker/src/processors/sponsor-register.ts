import { Worker, type Job } from "bullmq";
import { QUEUES } from "@apply4you/shared";
import { queues } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";

/**
 * Weekly Home Office sponsor-register refresh (tasks #27/#41, DECISIONS.md D5).
 * The register CSV URL changes per publication (asset UUID), so we scrape the
 * stable publication page for the current link, download, parse, and push
 * through the timeout-safe RPC chain: stage_sponsors (batched) ->
 * finalize_sponsor_swap (atomic) -> apply_sponsor_verdicts (set-based).
 *
 * Accuracy is the moat (COMPETITORS.md warning: never publish stale/wrong
 * visa data) — every failure path leaves the PREVIOUS register live and
 * logged, never a partial one.
 */

const PUBLICATION_URL =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";
const STAGE_BATCH = 5000;

/** Minimal quote-aware CSV parser (same pattern as the submit-mock harness). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field.trim());
      field = "";
    } else if (c === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

async function findCurrentCsvUrl(): Promise<{ url: string; date: string }> {
  const res = await fetch(PUBLICATION_URL, { headers: { "user-agent": "apply4you-register-sync/1.0" } });
  if (!res.ok) throw new Error(`publication page fetch failed: ${res.status}`);
  const html = await res.text();
  // Asset links look like: https://assets.publishing.service.gov.uk/media/<uuid>/..._-_2026-07-24.csv
  const matches = [...html.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[a-z0-9]+\/[^"'\s]+?\.csv/gi)];
  if (matches.length === 0) throw new Error("no CSV asset link found on the publication page");
  const url = matches[0]?.[0] ?? "";
  const dateMatch = url.match(/(\d{4}-\d{2}-\d{2})/);
  // No silent "today" fallback: a wrong displayed register date is a YMYL
  // fact, and defaulting to today would also permanently defeat the
  // skip-if-same-date check below, forcing a full 142k-row re-ingest weekly.
  if (!dateMatch) throw new Error(`could not find a YYYY-MM-DD date in the CSV asset URL: ${url}`);
  return { url, date: dateMatch[1]! };
}

async function refreshSponsorRegister(): Promise<void> {
  const db = supabaseAdmin();

  const { url, date } = await findCurrentCsvUrl();

  // Skip re-downloading if we already hold this edition — but ALWAYS ensure
  // verdicts are applied first (idempotent set-based update): if a prior run
  // downloaded+swapped successfully but then died before apply_sponsor_verdicts
  // (e.g. one PostgREST timeout), the skip-check alone would silently leave
  // jobs on stale verdicts forever, since this is the only place that calls it.
  const { data: current } = await db.from("sponsors").select("register_date").limit(1);
  if (current?.[0]?.register_date === date) {
    console.log(`[sponsors] register ${date} already loaded — re-applying verdicts in case a prior run died before this step`);
    const { error } = await db.rpc("apply_sponsor_verdicts");
    if (error) throw new Error(`apply_sponsor_verdicts (idempotent re-run) failed: ${error.message}`);
    return;
  }

  // Reset staging BEFORE this run's inserts: a previous run that threw after
  // partially staging rows would otherwise leave residue that merges with
  // this run's rows under finalize_sponsor_swap's SELECT DISTINCT, silently
  // resurrecting a sponsor revoked between editions under today's date.
  const { error: resetError } = await db.rpc("reset_sponsor_staging");
  if (resetError) throw new Error(`reset_sponsor_staging failed: ${resetError.message}`);

  console.log(`[sponsors] downloading register ${date}`);
  const res = await fetch(url, { headers: { "user-agent": "apply4you-register-sync/1.0" } });
  if (!res.ok) throw new Error(`register download failed: ${res.status}`);
  const csv = parseCsv(await res.text());

  const header = (csv[0] ?? []).map((h) => h.toLowerCase());
  const nameIdx = header.findIndex((h) => h.includes("organisation"));
  const townIdx = header.findIndex((h) => h.includes("town"));
  const countyIdx = header.findIndex((h) => h.includes("county"));
  const ratingIdx = header.findIndex((h) => h.includes("type") && h.includes("rating"));
  const routeIdx = header.findIndex((h) => h.includes("route"));
  if (nameIdx === -1 || routeIdx === -1) {
    throw new Error(`register format changed — headers: ${header.join(", ")}`);
  }

  const rows = csv.slice(1).filter((r) => (r[nameIdx] ?? "").length > 0);
  if (rows.length < 50_000) {
    throw new Error(`register suspiciously small (${rows.length} rows) — aborting, previous register stays live`);
  }

  for (let i = 0; i < rows.length; i += STAGE_BATCH) {
    const batch = rows.slice(i, i + STAGE_BATCH).map((r) => ({
      org_name: r[nameIdx],
      town: r[townIdx] ?? null,
      county: r[countyIdx] ?? null,
      type_rating: r[ratingIdx] ?? null,
      route: r[routeIdx] ?? null,
    }));
    const { error } = await db.rpc("stage_sponsors", { p_rows: batch });
    if (error) throw new Error(`stage_sponsors failed at offset ${i}: ${error.message}`);
  }

  const { data: swapped, error: swapError } = await db.rpc("finalize_sponsor_swap", { p_register_date: date });
  if (swapError) throw new Error(`finalize_sponsor_swap failed: ${swapError.message}`);

  const { data: verdicts, error: verdictError } = await db.rpc("apply_sponsor_verdicts");
  if (verdictError) throw new Error(`apply_sponsor_verdicts failed: ${verdictError.message}`);

  console.log(`[sponsors] register ${date}: ${swapped} sponsor rows live, ${verdicts} job verdicts updated`);
}

/** Weekly, Mondays 05:00 UTC — the Home Office republishes roughly weekly. */
export async function scheduleSponsorRefresh(): Promise<void> {
  await queues.sourcing.upsertJobScheduler("sponsor-register-scheduler", { pattern: "0 5 * * 1" }, {
    name: "refresh-sponsors",
    data: {},
  });
}

export { refreshSponsorRegister };
