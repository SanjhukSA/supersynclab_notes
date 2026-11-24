interface CornerFlourishProps {
  className?: string;
  size?: number;
}

/**
 * Vintage Bookplate / Woodblock Corner Flourishes.
 * Frames cards and panels with subtle etched manuscript corner marks.
 */
export function CornerFlourish({ className = "", size = 12 }: CornerFlourishProps) {
  return (
    <>
      {/* Top Left */}
      <span
        style={{ width: size, height: size }}
        className={`absolute top-2 left-2 border-t-2 border-l-2 border-accent-primary/30 pointer-events-none rounded-tl-xs ${className}`}
      />
      {/* Top Right */}
      <span
        style={{ width: size, height: size }}
        className={`absolute top-2 right-2 border-t-2 border-r-2 border-accent-primary/30 pointer-events-none rounded-tr-xs ${className}`}
      />
      {/* Bottom Left */}
      <span
        style={{ width: size, height: size }}
        className={`absolute bottom-2 left-2 border-b-2 border-l-2 border-accent-primary/30 pointer-events-none rounded-bl-xs ${className}`}
      />
      {/* Bottom Right */}
      <span
        style={{ width: size, height: size }}
        className={`absolute bottom-2 right-2 border-b-2 border-r-2 border-accent-primary/30 pointer-events-none rounded-br-xs ${className}`}
      />
    </>
  );
}
