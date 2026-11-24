import { useState } from "react";
import {
  FileText,
  Globe,
  Loader2,
  Sparkles,
} from "lucide-react";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";
import { OrnamentalDivider } from "@/components/editorial/OrnamentalDivider";
import { usePublicSharedResource } from "./useSharing";
import { ChatMessageItem } from "@/features/chat/ChatMessageItem";
import type { Citation } from "@/types";

interface SharedStudyDeskProps {
  token: string;
  onExitShare?: () => void;
}

export function SharedStudyDesk({ token, onExitShare }: SharedStudyDeskProps) {
  const { data: resource, isLoading, error } = usePublicSharedResource(token);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bg-base text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-accent-primary mb-3" />
        <p className="font-serif text-sm">Opening shared study desk...</p>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bg-base p-6 text-center">
        <div className="max-w-md space-y-3">
          <p className="font-display text-2xl font-bold text-text-primary">
            Link Expired or Not Found
          </p>
          <p className="text-xs text-text-muted">
            The study material you are trying to view is either private, removed, or the link has expired.
          </p>
          {onExitShare && (
            <button
              type="button"
              onClick={onExitShare}
              className="mt-4 px-4 py-2 rounded-lg bg-accent-primary text-bg-base text-xs font-medium hover:opacity-90"
            >
              Return to App
            </button>
          )}
        </div>
      </div>
    );
  }

  const isNote = resource.resource_type === "note";
  const activePage = resource.pages[activePageIndex];

  return (
    <div className="flex h-screen flex-col bg-bg-base overflow-hidden">
      {/* Top Banner */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-bg-surface px-6 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-base font-semibold text-text-primary truncate max-w-md">
              {resource.title}
            </h1>
            {resource.subject && (
              <span className="hidden sm:inline-block rounded-full bg-accent-primary/10 px-2 py-0.5 text-[10px] font-medium text-accent-primary border border-accent-primary/20">
                {resource.subject}
              </span>
            )}
          </div>
          <span className="text-xs text-text-muted hidden md:inline">
            • Shared by {resource.creator_name || "a Classmate"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono text-accent-primary bg-accent-primary/10 border border-accent-primary/25">
            <Globe className="h-3 w-3" />
            <span>Read-Only Study Link</span>
          </div>

          {onExitShare && (
            <button
              type="button"
              onClick={onExitShare}
              className="text-xs text-text-muted hover:text-text-primary font-mono"
            >
              Close
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {isNote ? (
          /* Shared Note Document & Page Viewer */
          <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
            {/* Left metadata & page filmstrip */}
            <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-border bg-bg-surface p-4 overflow-y-auto space-y-4 shrink-0">
              <div>
                <h3 className="font-serif text-sm font-semibold text-text-primary">
                  Document Overview
                </h3>
                {resource.note?.summary && (
                  <p className="mt-1 text-xs text-text-secondary leading-relaxed font-sans">
                    {resource.note.summary}
                  </p>
                )}
                {resource.note?.tags && (
                  <p className="mt-2 text-[10px] font-mono text-text-muted">
                    Topics: {resource.note.tags}
                  </p>
                )}
              </div>

              <OrnamentalDivider variant="section" />

              <div>
                <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-2">
                  Pages ({resource.pages.length})
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {resource.pages.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePageIndex(idx)}
                      className={`flex flex-col items-center p-2 rounded-lg border text-left transition-all ${
                        activePageIndex === idx
                          ? "border-accent-primary bg-accent-primary/10 shadow-xs"
                          : "border-border bg-bg-raised hover:border-accent-primary/50"
                      }`}
                    >
                      {p.image_path ? (
                        <img
                          src={`/${p.image_path}`}
                          alt={`Page ${p.page_number}`}
                          className="h-24 w-full object-cover rounded border border-border"
                        />
                      ) : (
                        <div className="h-24 w-full flex items-center justify-center bg-bg-base rounded text-text-muted font-mono text-xs">
                          P. {p.page_number}
                        </div>
                      )}
                      <span className="mt-1 text-[11px] font-mono text-text-primary font-medium">
                        Page {p.page_number}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right high-res page reader canvas */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-start bg-bg-base">
              {activePage?.image_path ? (
                <div className="relative max-w-2xl w-full rounded-xl border border-border bg-bg-surface p-4 shadow-xl">
                  <CornerFlourish size={12} />
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-border text-xs text-text-muted font-mono">
                    <span>PAGE {activePage.page_number} OF {resource.pages.length}</span>
                    <span>High-Resolution Scan</span>
                  </div>
                  <img
                    src={`/${activePage.image_path}`}
                    alt={`Page ${activePage.page_number}`}
                    className="w-full h-auto rounded-lg border border-border shadow-xs"
                  />
                </div>
              ) : (
                <div className="max-w-xl w-full p-8 rounded-xl border border-border bg-bg-surface text-center">
                  <FileText className="h-10 w-10 text-accent-primary mx-auto mb-2" />
                  <p className="font-serif text-sm font-semibold text-text-primary">
                    Digital Document Page
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    {activePage?.text_content || "No page scan available for this page."}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Shared Chat Session Transcript */
          <div className="flex-1 overflow-y-auto p-6 md:p-8 flex justify-center bg-bg-base">
            <div className="max-w-3xl w-full space-y-6">
              <div className="p-4 rounded-xl border border-border bg-bg-surface shadow-xs">
                <div className="flex items-center gap-2 text-accent-primary mb-1">
                  <Sparkles className="h-4 w-4" />
                  <h3 className="font-serif text-sm font-semibold">
                    Shared Study Session Transcript
                  </h3>
                </div>
                <p className="text-xs text-text-muted">
                  Every answer in this transcript is strictly grounded in course notes with interactive margin stamp citations.
                </p>
              </div>

              {resource.chat_messages.map((msg) => (
                <ChatMessageItem
                  key={msg.id}
                  message={msg}
                  onCitationClick={(cite) => setSelectedCitation(cite)}
                />
              ))}

              {selectedCitation && (
                <div className="fixed bottom-6 right-6 max-w-sm rounded-xl border border-accent-highlight bg-bg-surface p-4 shadow-2xl z-50 animate-in fade-in-50">
                  <div className="flex items-center justify-between pb-1 border-b border-border">
                    <span className="text-[11px] font-mono text-accent-highlight font-semibold">
                      Cited Source: {selectedCitation.note_title || "Course Material"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedCitation(null)}
                      className="text-xs text-text-muted hover:text-text-primary"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="mt-2 text-xs italic text-text-secondary leading-relaxed">
                    "{selectedCitation.snippet}"
                  </p>
                  {selectedCitation.page_number && (
                    <p className="mt-1 text-[10px] font-mono text-text-muted text-right">
                      Page {selectedCitation.page_number}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
