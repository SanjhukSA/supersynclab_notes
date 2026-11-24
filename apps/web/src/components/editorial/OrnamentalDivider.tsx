interface OrnamentalDividerProps {
  className?: string;
  variant?: "diamond" | "section" | "flourish" | "simple";
}

/**
 * Illuminated Manuscript Ornamental Divider.
 * Implements ui-context.md: "decorative drop caps and ornamental dividers on headings and empty states".
 */
export function OrnamentalDivider({
  className = "",
  variant = "flourish",
}: OrnamentalDividerProps) {
  if (variant === "simple") {
    return (
      <div className={`flex w-full items-center gap-2 my-4 ${className}`}>
        <div className="h-px flex-1 bg-border/80" />
        <div className="h-1 w-1 rounded-full bg-border" />
        <div className="h-px flex-1 bg-border/80" />
      </div>
    );
  }

  return (
    <div className={`flex w-full items-center justify-center gap-3 my-5 select-none ${className}`}>
      {/* Left Double Hairline */}
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="h-px bg-border/90" />
        <div className="h-px bg-border/50" />
      </div>

      {/* Center Etched Flourish */}
      <div className="flex items-center gap-1.5 px-2 text-accent-primary">
        {variant === "section" && (
          <span className="font-display text-sm font-semibold text-accent-primary">§</span>
        )}
        {variant === "diamond" && (
          <div className="flex items-center gap-1 text-[10px] text-accent-highlight">
            <span>◆</span>
            <span className="text-xs">❖</span>
            <span>◆</span>
          </div>
        )}
        {variant === "flourish" && (
          <svg
            className="h-3.5 w-10 text-accent-primary/70"
            viewBox="0 0 40 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          >
            <path d="M2 7c5-4 10 4 18 0 8 4 13-4 18 0" strokeLinecap="round" />
            <circle cx="20" cy="7" r="2" fill="currentColor" />
          </svg>
        )}
      </div>

      {/* Right Double Hairline */}
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="h-px bg-border/90" />
        <div className="h-px bg-border/50" />
      </div>
    </div>
  );
}
