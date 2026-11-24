import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import { HighlighterOverlay } from "./HighlighterOverlay";
import type { Citation } from "@/types";
import type { NotePageItem } from "@/features/notes/useNotes";

interface PageViewerProps {
  pages: NotePageItem[];
  currentPageNumber: number;
  onPageChange: (pageNum: number) => void;
  activeCitation?: Citation | null;
}

export function PageViewer({
  pages,
  currentPageNumber,
  onPageChange,
  activeCitation,
}: PageViewerProps) {
  const [zoom, setZoom] = useState(1.0);
  const [isFitWidth, setIsFitWidth] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentPage = pages.find((p) => p.page_number === currentPageNumber);
  const totalPages = pages.length;

  const handlePrevPage = () => {
    if (currentPageNumber > 1) {
      onPageChange(currentPageNumber - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPageNumber < totalPages) {
      onPageChange(currentPageNumber + 1);
    }
  };

  const handleZoomIn = () => {
    setIsFitWidth(false);
    setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100));
  };

  const handleZoomOut = () => {
    setIsFitWidth(false);
    setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100));
  };

  const handleResetZoom = () => {
    setIsFitWidth(true);
    setZoom(1.0);
  };

  // Determine if active citation is on this current page
  const isCitationOnThisPage =
    activeCitation &&
    (activeCitation.page_number === currentPageNumber ||
      activeCitation.page_id === currentPage?.id);

  // Compute image URL
  const imageUrl = currentPage?.image_path
    ? currentPage.image_path.startsWith("/") ||
      currentPage.image_path.startsWith("http")
      ? currentPage.image_path
      : `/storage/${currentPage.image_path}`
    : null;

  return (
    <div className="flex h-full flex-col bg-bg-base overflow-hidden select-none">
      {/* Viewer Navigation and Zoom Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-bg-surface px-4 py-2 shrink-0 text-xs">
        {/* Page Switcher */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPageNumber <= 1}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Previous Page (Left Arrow)"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="font-mono text-text-primary px-2 py-0.5 rounded bg-bg-raised border border-border">
            {currentPageNumber} / {totalPages || 1}
          </span>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPageNumber >= totalPages}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Next Page (Right Arrow)"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            className="px-1.5 py-0.5 rounded font-mono text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors cursor-pointer"
            title="Reset Zoom / Fit Width"
          >
            {isFitWidth ? "Fit" : `${Math.round(zoom * 100)}%`}
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <div className="h-3 w-px bg-border mx-1" />

          <button
            type="button"
            onClick={() => setIsFitWidth(!isFitWidth)}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors cursor-pointer"
            title={isFitWidth ? "Actual Size" : "Fit to Width"}
          >
            {isFitWidth ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Main Page Canvas Scroll Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 md:p-6 flex items-start justify-center bg-bg-base/70"
      >
        {imageUrl ? (
          <div
            style={{
              width: isFitWidth ? "100%" : `${zoom * 100}%`,
              maxWidth: isFitWidth ? "800px" : "none",
            }}
            className="relative transition-all duration-150 ease-out shadow-md rounded-sm border border-border bg-white"
          >
            {/* The high-res rendered page image */}
            <img
              src={imageUrl}
              alt={`Page ${currentPageNumber}`}
              className="w-full h-auto block select-none pointer-events-none rounded-sm"
              loading="eager"
            />

            {/* Highlighter overlay if citation is on this page */}
            {isCitationOnThisPage && activeCitation && (
              <HighlighterOverlay citation={activeCitation} />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center text-text-muted">
            <div className="p-4 rounded-xl bg-bg-raised border border-border mb-3">
              <RotateCcw className="h-8 w-8 text-accent-primary animate-pulse" />
            </div>
            <p className="font-display text-base font-semibold text-text-primary mb-1">
              Rendering Page {currentPageNumber}
            </p>
            <p className="text-xs max-w-xs">
              Page image extraction in progress or text-only document.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
