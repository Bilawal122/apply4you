import type { AtsAdapter } from "./types.js";
import { registerAdapter } from "./registry.js";
import { detectCommonBlocks } from "./fill-helpers.js";
import { pollGreenhouse } from "./greenhouse/poll.js";
import { pollLever } from "./lever/poll.js";
import { pollAshby } from "./ashby/poll.js";
import { pollWorkable, enrichWorkableJob } from "./workable/poll.js";
import { readGreenhouseForm } from "./greenhouse/form.js";
import { readLeverForm } from "./lever/form.js";
import { readAshbyForm } from "./ashby/form.js";
import { readWorkableForm } from "./workable/form.js";
import { fillGreenhouseForm, greenhouseFillUrl, submitGreenhouse } from "./greenhouse/fill.js";
import { fillLeverForm, submitLever } from "./lever/fill.js";
import { fillAshbyForm, submitAshby } from "./ashby/fill.js";
import { fillWorkableForm, submitWorkable, workableFillUrl } from "./workable/fill.js";

export const greenhouseAdapter: AtsAdapter = {
  atsType: "greenhouse",
  pollJobs: pollGreenhouse,
  readForm: readGreenhouseForm,
  fillUrl: greenhouseFillUrl,
  fillForm: fillGreenhouseForm,
  submit: submitGreenhouse,
  detectBlock: detectCommonBlocks,
};

export const leverAdapter: AtsAdapter = {
  atsType: "lever",
  pollJobs: pollLever,
  readForm: readLeverForm,
  fillUrl: (job) => (job.applyUrl.endsWith("/apply") ? job.applyUrl : `${job.applyUrl.replace(/\/$/, "")}/apply`),
  fillForm: fillLeverForm,
  submit: submitLever,
  detectBlock: detectCommonBlocks,
};

export const ashbyAdapter: AtsAdapter = {
  atsType: "ashby",
  pollJobs: pollAshby,
  readForm: readAshbyForm,
  fillForm: fillAshbyForm,
  submit: submitAshby,
  detectBlock: detectCommonBlocks,
};

export const workableAdapter: AtsAdapter = {
  atsType: "workable",
  pollJobs: pollWorkable,
  enrichJob: enrichWorkableJob,
  readForm: readWorkableForm,
  fillUrl: workableFillUrl,
  fillForm: fillWorkableForm,
  submit: submitWorkable,
  detectBlock: detectCommonBlocks,
};

export function registerAllAdapters(): void {
  registerAdapter(greenhouseAdapter);
  registerAdapter(leverAdapter);
  registerAdapter(ashbyAdapter);
  registerAdapter(workableAdapter);
}
