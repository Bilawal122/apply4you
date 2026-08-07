import { cardCls } from "@/components/ui";

/**
 * Route-transition feedback for every in-app page — nav clicks respond
 * instantly. A skeleton in the shape the page is about to take: a heading, a
 * row of small cards, one full-width card. It sits still for anyone who has
 * asked for reduced motion, and announces itself for anyone who can't see it.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-7" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="flex flex-col gap-3">
        <div className="h-8 w-full max-w-sm animate-pulse rounded-full bg-paper-deep motion-reduce:animate-none" />
        <div className="h-4 w-full max-w-[15rem] animate-pulse rounded-full bg-paper-deep motion-reduce:animate-none" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${cardCls} h-24 animate-pulse motion-reduce:animate-none`} />
        ))}
      </div>

      <div className={`${cardCls} h-72 animate-pulse motion-reduce:animate-none`} />
    </div>
  );
}
