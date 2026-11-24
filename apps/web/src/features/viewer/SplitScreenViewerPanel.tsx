import { useEffect, useState } from "react";
import { BookOpen, Quote, X } from "lucide-react";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";
import { PageViewer } from "./PageViewer";
import { useNotePages } from "@/features/notes/useNotes";
import type { Citation } from "@/types";

interface SplitScreenViewerPanelProps {
  citation: Citation | null;
  noteId: string | null;
  noteTitle: string | null;
  onClose: () => void;
}

/**
 * SplitScreenViewerPanel — Slides open on the right when a student clicks any citation badge.
 * Displays high-resolution PyMuPDF page PNG and draws an ochre highlighter over the bounding box.
 */
export function SplitScreenViewerPanel({
  citation,
  noteId,
  noteTitle,
  onClose,
}: SplitScreenViewerPanelProps) {
  // Determine target note ID (from props or directly from citation)
  const effectiveNoteId = noteId || citation?.note_id || null;
  const effectiveTitle = noteTitle || citation?.note_title || "Course Material";

  const { data: pages = [], isLoading } = useNotePages(effectiveNoteId);

  const initialPage = citation?.page_number ?? 1;
  const [currentPageNumber, setCurrentPageNumber] = useState<number>(initialPage);

  // Sync current page whenever a different citation is clicked
  useEffect(() => {
    if (citation?.page_number) {
      setCurrentPageNumber(citation.page_number);
    }
  }, [citation?.id, citation?.page_number]);

  return (
    <aside className="flex h-full flex-col border-l border-border bg-bg-surface shadow-xl z-20 w-full animate-in slide-in-from-right duration-250 ease-out select-none">
      {/* Top Header */}
      <div className="flex h-14 items-center justify-between border-b border-border bg-bg-surface px-5 shrink-0">
        <div className="flex items-center gap-2.5 truncate max-w-[80%]">
          <BookOpen className="h-4 w-4 shrink-0 text-accent-highlight" />
          <div className="truncate">
            <h3 className="font-display text-sm font-semibold text-text-primary truncate">
              {effectiveTitle}
            </h3>
            <p className="text-[10px] font-mono text-text-muted">
              Source Document Verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors cursor-pointer"
            title="Close Split-Screen Viewer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Page Viewer Canvas */}
      <div className="flex-1 overflow-hidden relative">
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-text-muted">
            <div className="h-6 w-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="font-serif text-xs italic">Loading source pages...</p>
          </div>
        ) : (
          <PageViewer
            pages={pages}
            currentPageNumber={currentPageNumber}
            onPageChange={setCurrentPageNumber}
            activeCitation={citation}
          />
        )}
      </div>

      {/* Grounded Citation Excerpt Footer */}
      {citation && (
        <div className="relative border-t border-border bg-bg-raised/70 p-3.5 shrink-0 overflow-hidden">
          <CornerFlourish size={10} />
          <div className="flex items-start gap-2">
            <Quote className="h-3.5 w-3.5 text-accent-highlight shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-text-muted">
                <span className="font-semibold text-accent-highlight uppercase tracking-wider">
                  Cited Passage • Page {citation.page_number ?? currentPageNumber}
                </span>
                <span className="text-[10px] text-text-muted/80">
                  Exact Match Grounding
                </span>
              </div>
              <p className="font-serif text-xs italic text-text-primary leading-relaxed line-clamp-3 bg-bg-surface/80 p-2 rounded border border-border/60">
                "{citation.snippet}"
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
