interface DropCapProps {
  letter: string;
  className?: string;
}

/**
 * Illuminated Manuscript Drop Cap.
 *
 * Implements ui-context.md:
 * - "Illuminated manuscripts: decorative drop caps and ornamental dividers"
 * - Styled with Fraunces serif display font
 * - Double hairline frame with vintage paper tone
 */
export function DropCap({ letter, className = "" }: DropCapProps) {
  return (
    <span
      className={`float-left mr-3.5 mb-1 flex h-14 w-14 items-center justify-center rounded-md border border-border bg-bg-surface p-1 shadow-xs select-none ${className}`}
    >
      <span className="flex h-full w-full items-center justify-center rounded-xs border border-dashed border-accent-primary/40 bg-accent-primary/5">
        <span className="font-display text-2xl font-bold tracking-wider text-accent-primary">
          {letter}
        </span>
      </span>
    </span>
  );
}
