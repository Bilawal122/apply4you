import { Spinner } from "@/components/ui";

/** Route-transition feedback for every in-app page — nav clicks respond instantly. */
export default function AppLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-ink-soft">
      <Spinner />
      <span className="font-mono text-xs">loading…</span>
    </div>
  );
}
