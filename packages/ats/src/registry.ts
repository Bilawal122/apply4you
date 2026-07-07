import type { AtsType } from "@apply4you/shared";
import type { AtsAdapter } from "./types.js";

const adapters = new Map<AtsType, AtsAdapter>();

export function registerAdapter(adapter: AtsAdapter): void {
  adapters.set(adapter.atsType, adapter);
}

export function getAdapter(atsType: AtsType): AtsAdapter {
  const adapter = adapters.get(atsType);
  if (!adapter) throw new Error(`No adapter registered for ATS type: ${atsType}`);
  return adapter;
}
