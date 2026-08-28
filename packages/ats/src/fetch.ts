import { SUPPORT_EMAIL } from "@apply4you/shared";

export class AtsHttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`ATS request failed: ${status} ${url}`);
  }
}

const USER_AGENT = `apply4you-sourcing/0.1 (job aggregation; contact: ${SUPPORT_EMAIL})`;

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "user-agent": USER_AGENT, ...init?.headers },
  });
  if (!res.ok) throw new AtsHttpError(res.status, url);
  return (await res.json()) as T;
}
