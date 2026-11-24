interface VintageEngravingProps {
  className?: string;
}

/**
 * Vintage Botanical & Scientific Plate Style Etched Illustration.
 *
 * Implements ui-context.md:
 * - "Vintage botanical and scientific plates: fine engraved line illustrations"
 * - "Woodblock and etching prints: textured line work, slightly imperfect edges"
 * - Drawn strictly in palette tokens (currentColor) so it adapts to light & dark themes seamlessly.
 */
export function VintageEngraving({ className = "h-28 w-28 text-accent-primary" }: VintageEngravingProps) {
  return (
    <svg
      className={`${className} select-none`}
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer celestial/astronomical orbit rings */}
      <circle
        cx="60"
        cy="60"
        r="54"
        strokeWidth="0.8"
        strokeDasharray="2 3"
        className="opacity-40"
      />
      <circle
        cx="60"
        cy="60"
        r="50"
        strokeWidth="1"
        className="opacity-60"
      />

      {/* Sun/star compass mark at top */}
      <path
        d="M60 4L62 10L60 8L58 10Z"
        fill="currentColor"
        strokeWidth="0.5"
        className="text-accent-highlight"
      />

      {/* Open leather study tome */}
      {/* Spine */}
      <path
        d="M60 42 V88"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Left Page Curved Boundary */}
      <path
        d="M60 42 C48 38 32 40 22 45 V89 C32 85 48 84 60 88"
        strokeWidth="1.4"
        className="opacity-90"
      />
      {/* Left Page Bottom Stack Edge */}
      <path
        d="M22 89 C32 87 48 86 60 90"
        strokeWidth="1"
        className="opacity-60"
      />
      <path
        d="M22 91 C32 89 48 88 60 92"
        strokeWidth="0.8"
        className="opacity-40"
      />

      {/* Right Page Curved Boundary */}
      <path
        d="M60 42 C72 38 88 40 98 45 V89 C88 85 72 84 60 88"
        strokeWidth="1.4"
        className="opacity-90"
      />
      {/* Right Page Bottom Stack Edge */}
      <path
        d="M98 89 C88 87 72 86 60 90"
        strokeWidth="1"
        className="opacity-60"
      />
      <path
        d="M98 91 C88 89 72 88 60 92"
        strokeWidth="0.8"
        className="opacity-40"
      />

      {/* Ruled lines on Left Page */}
      <line x1="28" y1="53" x2="54" y2="51" strokeWidth="0.8" strokeDasharray="1 2" className="opacity-70" />
      <line x1="28" y1="60" x2="54" y2="58" strokeWidth="0.8" strokeDasharray="1 2" className="opacity-70" />
      <line x1="28" y1="67" x2="54" y2="65" strokeWidth="0.8" strokeDasharray="1 2" className="opacity-70" />
      <line x1="28" y1="74" x2="54" y2="72" strokeWidth="0.8" strokeDasharray="1 2" className="opacity-70" />

      {/* Ruled lines on Right Page */}
      <line x1="66" y1="51" x2="92" y2="53" strokeWidth="0.8" strokeDasharray="1 2" className="opacity-70" />
      <line x1="66" y1="58" x2="92" y2="60" strokeWidth="0.8" strokeDasharray="1 2" className="opacity-70" />
      <line x1="66" y1="65" x2="92" y2="67" strokeWidth="0.8" strokeDasharray="1 2" className="opacity-70" />
      <line x1="66" y1="72" x2="92" y2="74" strokeWidth="0.8" strokeDasharray="1 2" className="opacity-70" />

      {/* Feather Quill Pen across the book */}
      <path
        d="M84 26 C82 34 76 52 50 78 L46 80 L48 76 C64 54 74 38 84 26 Z"
        strokeWidth="1.2"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <path
        d="M84 26 L47 79"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Quill vane feather barbs */}
      <line x1="78" y1="36" x2="84" y2="42" strokeWidth="0.8" className="opacity-60" />
      <line x1="72" y1="44" x2="78" y2="50" strokeWidth="0.8" className="opacity-60" />
      <line x1="66" y1="52" x2="71" y2="57" strokeWidth="0.8" className="opacity-60" />

      {/* Small ink droplet / sparkle */}
      <circle cx="43" cy="83" r="1.5" fill="currentColor" className="text-accent-highlight" />
    </svg>
  );
}
