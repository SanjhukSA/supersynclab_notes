import { useState } from "react";
import { Check, Copy, Download, FileText, Loader2, X } from "lucide-react";
import { DropCap } from "@/components/editorial/DropCap";
import { OrnamentalDivider } from "@/components/editorial/OrnamentalDivider";
import type { CheatSheet } from "@/types";

interface CheatSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  cheatSheet: CheatSheet | null;
  isLoading: boolean;
  noteTitle: string;
}

export function CheatSheetModal({
  isOpen,
  onClose,
  cheatSheet,
  isLoading,
  noteTitle,
}: CheatSheetModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!cheatSheet?.markdown) return;
    await navigator.clipboard.writeText(cheatSheet.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const renderContent = (markdown: string) => {
    const lines = markdown.split("\n");
    let hasDropCapRendered = false;

    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return <div key={idx} className="h-3" />;
      }

      if (trimmed.startsWith("# ")) {
        return (
          <h1
            key={idx}
            className="mb-3 font-serif text-2xl font-bold tracking-tight text-text-primary border-b border-border/60 pb-2"
          >
            {trimmed.replace("# ", "")}
          </h1>
        );
      }

      if (trimmed.startsWith("## ")) {
        return (
          <div key={idx} className="mt-5 mb-2">
            <h2 className="font-serif text-lg font-semibold tracking-wide text-brand-secondary dark:text-brand-accent">
              {trimmed.replace("## ", "")}
            </h2>
            <div className="h-0.5 w-12 bg-brand-primary/40 rounded mt-0.5" />
          </div>
        );
      }

      if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
        const math = trimmed.slice(2, -2).trim();
        return (
          <div
            key={idx}
            className="my-3 overflow-x-auto rounded-lg border border-border bg-bg-raised/70 px-4 py-3 text-center font-mono text-sm tracking-wide text-text-primary shadow-xs"
          >
            {math}
          </div>
        );
      }

      if (trimmed.startsWith("- ")) {
        const text = trimmed.replace("- ", "");
        // Highlight bold **bold**
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return (
          <div key={idx} className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary pl-2 my-1">
            <span className="text-brand-primary font-bold mt-1 text-xs">•</span>
            <div>
              {parts.map((p, pIdx) => {
                if (p.startsWith("**") && p.endsWith("**")) {
                  return (
                    <strong key={pIdx} className="font-semibold text-text-primary">
                      {p.slice(2, -2)}
                    </strong>
                  );
                }
                return p;
              })}
            </div>
          </div>
        );
      }

      // First narrative paragraph gets a DropCap for editorial luxury
      if (!hasDropCapRendered && trimmed.length > 20 && !trimmed.startsWith("*")) {
        hasDropCapRendered = true;
        const firstLetter = trimmed.charAt(0) || "T";
        const rest = trimmed.slice(1);
        return (
          <div key={idx} className="my-2 text-sm leading-relaxed text-text-secondary">
            <DropCap letter={firstLetter} />
            <span>{rest}</span>
          </div>
        );
      }

      return (
        <p key={idx} className="my-1.5 text-sm leading-relaxed text-text-secondary">
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-xl border border-border bg-bg-paper p-6 shadow-2xl transition-all max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-text-primary">
                1-Page High-Yield Cheat Sheet
              </h3>
              <p className="text-xs text-text-muted">
                {cheatSheet?.subject ? `${cheatSheet.subject} • ` : ""}
                {noteTitle}
              </p>
              {cheatSheet?.source_note_titles && cheatSheet.source_note_titles.length > 1 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="text-[10px] font-mono text-accent-highlight bg-accent-highlight/10 px-1.5 py-0.5 rounded border border-accent-highlight/20">
                    Synthesized across {cheatSheet.source_note_titles.length} notes: {cheatSheet.source_note_titles.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cheatSheet && (
              <>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Markdown</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Print</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-4 px-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
              <p className="font-serif text-sm text-text-secondary">
                Distilling core formulas, laws, and exam pitfalls...
              </p>
            </div>
          ) : cheatSheet ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-bg-surface/50 border border-border/60 p-4">
                {renderContent(cheatSheet.markdown)}
              </div>
              <OrnamentalDivider className="my-4 opacity-50" />
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-text-muted">
              No cheat sheet content available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
