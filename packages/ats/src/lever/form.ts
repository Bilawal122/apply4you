import { parse, type HTMLElement } from "node-html-parser";
import type { Field } from "@apply4you/shared";
import { AtsHttpError } from "../fetch.js";
import type { JobRef } from "../types.js";

/**
 * Lever's postings API does not expose custom questions, but the apply page
 * is server-rendered plain HTML — parsed here without a browser.
 * Structure verified 2026-07: .application-question blocks containing
 * .application-label and inputs/selects/textareas named `name`, `email`,
 * `urls[LinkedIn]`, `cards[uuid][fieldN]`, etc.
 */

function applyPageUrl(job: JobRef): string {
  return job.applyUrl.endsWith("/apply") ? job.applyUrl : `${job.applyUrl.replace(/\/$/, "")}/apply`;
}

function fieldTypeFor(el: HTMLElement): Field["type"] | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  switch (type) {
    case "text":
      return "text";
    case "email":
      return "email";
    case "tel":
      return "phone";
    case "file":
      return "file";
    case "checkbox":
      return "multiselect";
    case "radio":
      return "radio";
    case "hidden":
      return null;
    default:
      return "text";
  }
}

export async function readLeverForm(job: JobRef): Promise<Field[]> {
  const url = applyPageUrl(job);
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; apply4you)" } });
  if (!res.ok) throw new AtsHttpError(res.status, url);
  const root = parse(await res.text());

  const fields: Field[] = [];
  const seen = new Set<string>();

  for (const block of root.querySelectorAll(".application-question")) {
    const label =
      block.querySelector(".application-label")?.structuredText.trim() ??
      block.querySelector("label")?.structuredText.trim() ??
      "";

    const controls = block.querySelectorAll("input, select, textarea");
    for (const control of controls) {
      const name = control.getAttribute("name");
      if (!name || seen.has(name)) continue;
      // Demographic/EEOC self-identification is never answered on the user's behalf.
      if (name.startsWith("eeo[")) continue;
      const type = fieldTypeFor(control);
      if (type === null) continue;

      let options: string[] | undefined;
      if (type === "select") {
        options = control
          .querySelectorAll("option")
          .map((o) => o.structuredText.trim())
          .filter((t) => t && !/^select/i.test(t));
      } else if (type === "multiselect" || type === "radio") {
        // Checkbox/radio groups share the name; collect all values in the block.
        options = controls
          .filter((c) => c.getAttribute("name") === name && c.getAttribute("value"))
          .map((c) => c.getAttribute("value")!)
          .filter(Boolean);
      }

      const cleanLabel = label.replace(/✱|\*/g, "").trim();
      fields.push({
        id: name,
        label: cleanLabel || name,
        type,
        options: options?.length ? options : undefined,
        required: control.hasAttribute("required") || /✱/.test(label),
      });
      seen.add(name);
    }
  }

  return fields;
}
