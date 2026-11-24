import { useState } from "react";
import { Bookmark, FileText } from "lucide-react";
import type { Citation } from "@/types";

interface CitationBadgeProps {
  citation: Citation;
  index?: number;
  onClick?: (citation: Citation) => void;
}

/**
 * Editorial Margin Stamp Citation Badge.
 * Styled with --accent-highlight tokens to look like a vintage study stamp.
 */
export function CitationBadge({ citation, index, onClick }: CitationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const pageNum = citation.page_number ?? 1;
  const label = `p. ${pageNum}`;

  return (
    <span className="relative inline-block align-baseline mx-1">
      <button
        type="button"
        onClick={() => onClick?.(citation)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-tight bg-accent-highlight/15 text-accent-highlight border border-accent-highlight/35 hover:bg-accent-highlight/25 hover:border-accent-highlight/60 transition-all cursor-pointer shadow-xs select-none"
        title={`View Source on Page ${pageNum}`}
      >
        <Bookmark className="h-2.5 w-2.5" />
        <span>{index !== undefined ? `[${index + 1}] ${label}` : label}</span>
      </button>

      {/* Tooltip with snippet quote and note title */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 w-64 p-2.5 rounded-lg bg-bg-surface border border-border shadow-lg text-left pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-accent-primary mb-1">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{citation.note_title || "Course Material"}</span>
            <span className="text-text-muted ml-auto shrink-0">Page {pageNum}</span>
          </div>
          <p className="text-xs text-text-primary line-clamp-3 italic font-serif leading-relaxed bg-bg-raised/40 p-1.5 rounded border border-border/50">
            "{citation.snippet}"
          </p>
        </div>
      )}
    </span>
  );
}
