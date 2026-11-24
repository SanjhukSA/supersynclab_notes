import { useEffect, useRef } from "react";
import { Bookmark } from "lucide-react";
import type { Citation } from "@/types";

interface HighlighterOverlayProps {
  citation: Citation;
}

/**
 * Vintage Highlighter Pen Overlay.
 *
 * Implements ui-context.md specification:
 * - "Source highlighting in the viewer looks like a highlighter pen, not a hard box"
 * - Uses --accent-highlight ochre token
 * - Soft edges, slight vertical bleed, and warm glow
 * - Auto-scrolls into view when mounted or updated
 */
export function HighlighterOverlay({ citation }: HighlighterOverlayProps) {
  const highlightRef = useRef<HTMLDivElement>(null);

  // Normalize bounding box coordinates (values 0.0 to 1.0)
  const leftPct = Math.max(0, Math.min(100, citation.bbox_x * 100));
  const topPct = Math.max(0, Math.min(100, citation.bbox_y * 100));
  const widthPct = Math.max(2, Math.min(100 - leftPct, citation.bbox_width * 100));
  const heightPct = Math.max(1.5, Math.min(100 - topPct, citation.bbox_height * 100));

  // Auto-scroll highlight into comfortable center reading view
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  }, [citation.id, citation.bbox_y]);

  return (
    <div
      ref={highlightRef}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
      }}
      className="absolute z-20 pointer-events-none transition-all duration-300"
    >
      {/* Highlighter Pen ink body */}
      <div className="relative w-full h-full rounded-xs bg-accent-highlight/30 border-y-2 border-accent-highlight/60 shadow-[0_0_12px_rgba(217,154,30,0.35)] dark:shadow-[0_0_14px_rgba(232,185,79,0.4)] animate-in fade-in duration-300">
        {/* Margin stamp tag above the highlight */}
        <div className="absolute -top-6 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent-highlight text-bg-surface font-mono text-[10px] font-bold tracking-tight shadow-md select-none pointer-events-auto">
          <Bookmark className="h-2.5 w-2.5" />
          <span>Cited Source</span>
        </div>
      </div>
    </div>
  );
}
