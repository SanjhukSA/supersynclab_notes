import { useState, useEffect, useRef } from "react";
import {
  Search,
  X,
  FileText,
  BookOpen,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Loader2,
  Clock,
  Layers,
  FileUp,
} from "lucide-react";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";
import { useGlobalSearch } from "./useSearch";
import { useNotes } from "@/features/notes/useNotes";
import type { SearchNoteResult, StudyScope } from "@/types";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenViewer?: (noteId: string, title: string, pageNumber?: number) => void;
  onOpenStudyDesk?: (scope: StudyScope) => void;
  onOpenUpload?: () => void;
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  onOpenViewer,
  onOpenStudyDesk,
  onOpenUpload,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: recentNotes = [] } = useNotes();
  const { data: searchResponse, isLoading } = useGlobalSearch(debouncedQuery);

  // Debounce query by 180ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input on open and reset query
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [isOpen]);

  const results: SearchNoteResult[] = searchResponse?.results || [];

  // Keyboard navigation within modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const max = results.length > 0 ? results.length - 1 : Math.min(recentNotes.length, 5) - 1;
          return prev < max ? prev + 1 : 0;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const max = results.length > 0 ? results.length - 1 : Math.min(recentNotes.length, 5) - 1;
          return prev > 0 ? prev - 1 : Math.max(0, max);
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results.length > 0 && results[selectedIndex]) {
          const selected = results[selectedIndex];
          const firstPage = selected.snippets[0]?.page_number || 1;
          handleOpenInViewer(selected.note_id, selected.title, firstPage);
        } else if (recentNotes.length > 0 && recentNotes[selectedIndex]) {
          const note = recentNotes[selectedIndex];
          handleOpenInViewer(note.id, note.title, 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, recentNotes, selectedIndex]);

  const handleOpenInViewer = (noteId: string, title: string, pageNumber = 1) => {
    if (onOpenViewer) {
      onOpenViewer(noteId, title, pageNumber);
    }
    onClose();
  };

  const handleStudyInChat = (noteId: string, title: string) => {
    if (onOpenStudyDesk) {
      onOpenStudyDesk({
        type: "notes",
        noteIds: [noteId],
        noteTitles: [title],
      });
    }
    onClose();
  };

  if (!isOpen) return null;

  // Highlight matching substrings safely in text
  const highlightMatch = (text: string, term: string) => {
    if (!term.trim()) return text;
    const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark
          key={i}
          className="bg-accent-highlight/25 text-accent-highlight font-semibold px-0.5 rounded"
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-bg-surface shadow-2xl overflow-hidden transition-all animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <CornerFlourish size={14} />

        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-border bg-bg-base/60">
          <Search className="h-5 w-5 text-accent-primary shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search notes, slides, subjects, or verbatim passages…"
            className="flex-1 bg-transparent text-sm sm:text-base text-text-primary placeholder:text-text-muted/60 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setDebouncedQuery("");
              }}
              className="p-1 rounded-md text-text-muted hover:text-text-primary mr-1"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <div className="flex items-center gap-1.5 pl-2 border-l border-border text-[11px] font-mono text-text-muted">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-raised border border-border">ESC</kbd>
            <span className="hidden sm:inline">to close</span>
          </div>
        </div>

        {/* Results Container */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
          {isLoading && debouncedQuery && (
            <div className="flex items-center justify-center py-10 text-xs text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent-primary mr-2" />
              Searching through library and lecture chunks…
            </div>
          )}

          {!isLoading && debouncedQuery && results.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-serif text-sm text-text-muted">
                No notes or lecture pages matching &ldquo;
                <span className="font-medium text-text-primary">{debouncedQuery}</span>
                &rdquo;
              </p>
              <p className="mt-1 text-xs text-text-muted/70">
                Try searching for broader keywords, topics, or course subjects.
              </p>
            </div>
          )}

          {/* Search Results List */}
          {!isLoading && results.length > 0 && (
            <div className="space-y-2">
              <div className="px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-text-muted flex justify-between">
                <span>Matching Documents ({results.length})</span>
                <span>Navigate with ↑ ↓ • Press Enter to view</span>
              </div>

              {results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const firstSnippet = item.snippets[0];
                return (
                  <div
                    key={item.note_id}
                    onClick={() =>
                      handleOpenInViewer(
                        item.note_id,
                        item.title,
                        firstSnippet?.page_number || 1,
                      )
                    }
                    className={`group relative rounded-xl border p-3 cursor-pointer transition-all ${
                      isSelected
                        ? "border-accent-primary bg-bg-raised/70 shadow-xs"
                        : "border-border/60 bg-bg-surface/60 hover:border-accent-primary/50 hover:bg-bg-raised/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-base border border-border text-accent-primary mt-0.5">
                          <FileText className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-serif text-sm font-semibold text-text-primary truncate">
                              {highlightMatch(item.title, debouncedQuery)}
                            </h4>
                            <span className="font-mono text-[10px] uppercase px-1.5 py-0.2 rounded border border-border bg-bg-base text-text-muted shrink-0">
                              {item.file_type}
                            </span>
                            {item.subject && (
                              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/20 shrink-0">
                                {item.subject}
                              </span>
                            )}
                          </div>

                          {/* Matching Snippets */}
                          {item.snippets.map((snip, sIdx) => (
                            <div
                              key={sIdx}
                              className="mt-2 text-xs text-text-muted/90 bg-bg-base/70 rounded-lg p-2 border border-border/50 font-serif leading-relaxed"
                            >
                              <div className="flex items-center gap-1.5 text-[10px] font-mono text-accent-highlight font-semibold mb-1">
                                <Layers className="h-3 w-3" />
                                <span>Page {snip.page_number}</span>
                              </div>
                              <p className="line-clamp-2">
                                {highlightMatch(snip.snippet, debouncedQuery)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action Shortcuts */}
                      <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStudyInChat(item.note_id, item.title);
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors"
                          title="Start AI Study Chat with this note"
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span className="hidden sm:inline">Study</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenInViewer(
                              item.note_id,
                              item.title,
                              firstSnippet?.page_number || 1,
                            );
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-bg-raised text-text-primary hover:bg-border transition-colors border border-border"
                          title="Open Split-Screen Page Viewer"
                        >
                          <BookOpen className="h-3 w-3" />
                          <span className="hidden sm:inline">View</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty Query State: Show Recent Notes and Quick Commands */}
          {!debouncedQuery && (
            <div className="space-y-4 py-2">
              {/* Quick Actions Bar */}
              <div>
                <p className="px-2 pb-1.5 text-[11px] font-mono uppercase tracking-wider text-text-muted">
                  Quick Actions
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenStudyDesk) onOpenStudyDesk({ type: "all" });
                      onClose();
                    }}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/60 bg-bg-surface/70 hover:bg-bg-raised/60 hover:border-accent-primary/40 text-left transition-all group"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary group-hover:scale-105 transition-transform">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-serif font-semibold text-text-primary">
                        Open Study Desk
                      </p>
                      <p className="text-[11px] text-text-muted">
                        Chat with AI across all course notes
                      </p>
                    </div>
                  </button>

                  {onOpenUpload && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenUpload();
                        onClose();
                      }}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/60 bg-bg-surface/70 hover:bg-bg-raised/60 hover:border-accent-primary/40 text-left transition-all group"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-highlight/10 text-accent-highlight group-hover:scale-105 transition-transform">
                        <FileUp className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-serif font-semibold text-text-primary">
                          Upload New Notes
                        </p>
                        <p className="text-[11px] text-text-muted">
                          Drop PDF, Word docs, or slides
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Recent Notes */}
              {recentNotes.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-text-muted flex justify-between">
                    <span>Recent Study Notes</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Recently Ingested
                    </span>
                  </div>

                  <div className="space-y-1.5 mt-1">
                    {recentNotes.slice(0, 5).map((note, idx) => {
                      const isSelected = idx === selectedIndex;
                      return (
                        <div
                          key={note.id}
                          onClick={() => handleOpenInViewer(note.id, note.title, 1)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? "border-accent-primary bg-bg-raised/70"
                              : "border-border/40 hover:border-accent-primary/40 hover:bg-bg-raised/40"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="h-4 w-4 text-accent-primary shrink-0" />
                            <span className="font-serif text-xs font-medium text-text-primary truncate">
                              {note.title}
                            </span>
                            <span className="font-mono text-[9px] uppercase px-1 py-0.2 rounded border border-border bg-bg-base text-text-muted shrink-0">
                              {note.file_type}
                            </span>
                            {note.subject && (
                              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/20 shrink-0 hidden sm:inline">
                                {note.subject}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-muted shrink-0 ml-2">
                            {note.page_count > 0 && (
                              <span className="text-[11px] font-mono">
                                {note.page_count}p
                              </span>
                            )}
                            <ArrowRight className="h-3 w-3 text-text-muted/60" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-bg-base/40 flex items-center justify-between text-[11px] text-text-muted font-mono">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-raised border border-border">↑</kbd>
              <kbd className="px-1 py-0.5 rounded bg-bg-raised border border-border ml-1">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-raised border border-border">↵</kbd> Select
            </span>
          </div>
          <span className="italic font-serif">SuperNotes Spotlight</span>
        </div>
      </div>
    </div>
  );
}
