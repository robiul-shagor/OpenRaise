import Link from "next/link";

/** `compact`: hide the wordmark below 360px so the header fits the smallest phones. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" aria-label="OpenRaise home" className="flex shrink-0 items-center gap-2 text-ink no-underline sm:gap-2.5">
      <svg className="h-7 w-7 sm:h-[30px] sm:w-[30px]" width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="9" fill="#1E4D2B" />
        <path d="M8 22l6-6 4 4 7-9" stroke="#E9F86B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="25" cy="11" r="2" fill="#E9F86B" />
      </svg>
      <span className={`font-display text-[17px] font-black sm:text-[19px] ${compact ? "hidden min-[360px]:inline" : ""}`}>OpenRaise</span>
    </Link>
  );
}
