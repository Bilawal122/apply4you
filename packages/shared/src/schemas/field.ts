import { z } from "zod";

/**
 * FR-11: normalized representation of one ATS form field.
 * `id` is the ATS-native field name (Greenhouse question `name`,
 * Ashby `fieldPath`, Workable field `key`, Lever input `name` attr) —
 * form reading, resolution, and DOM filling all key off it.
 */
export const FieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["text", "select", "multiselect", "radio", "checkbox", "textarea", "file", "date", "email", "phone", "number"]),
  options: z.array(z.string()).optional(),
  required: z.boolean(),
  maxLength: z.number().int().positive().optional(),
});

export type Field = z.infer<typeof FieldSchema>;

/** fieldId -> resolved value. null = no profile-backed value (FR-14/15). */
export const ResolvedValuesSchema = z.record(z.string(), z.string().nullable());
export type ResolvedValues = z.infer<typeof ResolvedValuesSchema>;

export const UnresolvedFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean(),
});
export type UnresolvedField = z.infer<typeof UnresolvedFieldSchema>;
