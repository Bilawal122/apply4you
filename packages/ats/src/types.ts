import type { Page } from "playwright-core";
import type { AtsType, Field, NormalizedJob, ResolvedValues, SubmitResult } from "@apply4you/shared";

export interface JobRef {
  atsType: AtsType;
  externalId: string;
  applyUrl: string;
  /** Board slug the job was sourced from (needed for question-API calls). */
  boardSlug: string;
  raw?: unknown;
}

export interface LocalFile {
  path: string;
  filename: string;
  mimeType: string;
}

export type BlockKind = "captcha" | "bot_wall" | null;

/**
 * FR-29: one adapter per ATS. `readForm` is API-first (pass no page) with a
 * DOM fallback (pass a Playwright page). `fillForm` locates controls by the
 * same ATS-native `Field.id` that `readForm` produced.
 */
export interface PollOptions {
  /** Company display name from the board_sources row; fallback when the API lacks it. */
  companyName?: string;
}

/**
 * Which fields did not make it into the form.
 *
 * A fill error is caught per field so one awkward control cannot cost the whole
 * application — but the catch used to write only to the worker's stdout, while
 * `submitted_fields` recorded the values we *intended* to send. That made the
 * permanent record (DECISIONS.md D4) capable of asserting answers the browser
 * never typed. The report travels back so the row can say what actually
 * happened.
 */
export interface FillFailure {
  id: string;
  label: string;
  reason: string;
}

export interface FillReport {
  failed: FillFailure[];
}

export interface AtsAdapter {
  atsType: AtsType;
  /** Phase 2: poll the public board endpoint, normalize postings. */
  pollJobs(slug: string, opts?: PollOptions): Promise<NormalizedJob[]>;
  /**
   * Optional per-job enrichment, called only for jobs not yet in the DB
   * (e.g. Workable's list endpoint has no description; the detail endpoint does).
   */
  enrichJob?(slug: string, job: NormalizedJob): Promise<NormalizedJob>;
  /** Phase 4: read the application form into the Field schema. */
  readForm(job: JobRef, page?: Page): Promise<Field[]>;
  /** URL the fill worker should open (defaults to job.applyUrl). */
  fillUrl?(job: JobRef): string;
  /** Phase 5: fill the live form from resolved values. */
  fillForm(page: Page, fields: Field[], values: ResolvedValues, resume: LocalFile): Promise<FillReport>;
  /** Phase 5: click submit and detect the confirmation signal. */
  submit(page: Page): Promise<SubmitResult>;
  /** Phase 5: detect CAPTCHA / bot walls. Never bypass — record and stop. */
  detectBlock(page: Page): Promise<BlockKind>;
}
