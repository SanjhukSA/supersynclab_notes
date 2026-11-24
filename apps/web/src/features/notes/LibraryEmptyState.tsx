import { VintageEngraving } from "@/components/editorial/VintageEngraving";
import { OrnamentalDivider } from "@/components/editorial/OrnamentalDivider";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";
import { BookCheck, FileText, Sparkles } from "lucide-react";

export function LibraryEmptyState() {
  return (
    <div className="relative rounded-2xl border border-border bg-bg-surface/70 p-8 md:p-12 text-center shadow-xs overflow-hidden">
      <CornerFlourish size={16} />

      {/* Center Engraving Illustration */}
      <div className="flex justify-center mb-6">
        <div className="relative p-4 rounded-full bg-bg-raised/40 border border-border/80">
          <VintageEngraving className="h-24 w-24 text-accent-primary" />
        </div>
      </div>

      {/* Serif Display Heading */}
      <h3 className="font-display text-2xl font-semibold text-text-primary tracking-tight">
        Your Study Desk is Ready
      </h3>

      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-text-muted font-sans">
        Upload your digital lecture slides, question papers, or PDF notes above. SuperNotes will extract each page at 150 DPI and construct a grounded academic index.
      </p>

      {/* Manuscript Ornamental Divider */}
      <div className="mx-auto max-w-xs">
        <OrnamentalDivider variant="flourish" />
      </div>

      {/* Feature Hallmarks */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[11px] font-mono text-text-muted">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-raised border border-border">
          <FileText className="h-3 w-3 text-accent-primary" />
          <span>PyMuPDF 150 DPI</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-raised border border-border">
          <Sparkles className="h-3 w-3 text-accent-highlight" />
          <span>768-dim Vector Embeddings</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-raised border border-border">
          <BookCheck className="h-3 w-3 text-accent-primary" />
          <span>Zero-Hallucination Guardrails</span>
        </div>
      </div>
    </div>
  );
}
