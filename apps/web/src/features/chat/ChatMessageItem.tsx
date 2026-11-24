import React from "react";
import { Sparkles, User as UserIcon } from "lucide-react";
import { CitationBadge } from "./CitationBadge";
import type { ChatMessage, Citation } from "@/types";

interface ChatMessageItemProps {
  message: ChatMessage;
  onCitationClick?: (citation: Citation) => void;
  onAskExternal?: (originalQuery: string) => void;
  lastUserQuery?: string;
}

const GUARDRAIL_TEXT = "Not covered in your uploaded notes.";

function renderMarkdownSpan(text: string, keyPrefix: string): React.ReactNode[] {
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const k = `${keyPrefix}-${match.index}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={k} className="font-semibold text-text-primary">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={k} className="italic text-text-muted">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={k}
          className="rounded bg-bg-raised px-1 py-0.5 font-mono text-xs text-accent-primary border border-border/50"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

/**
 * Render assistant response text, parsing [cite:N] tokens into interactive CitationBadges,
 * rendering markdown formatting (bold, italic, code, blockquotes), and LaTeX equations.
 */
function FormattedAssistantContent({
  content,
  citations = [],
  onCitationClick,
}: {
  content: string;
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) {
  // Regex to split by [cite:1], [cite:2], etc.
  const citeRegex = /\[cite:(\d+)\]/g;

  // Split into paragraphs first
  const paragraphs = content.split("\n\n");

  return (
    <div className="space-y-3 font-sans text-sm leading-relaxed text-text-primary">
      {paragraphs.map((paragraph, pIdx) => {
        const trimmed = paragraph.trim();

        // Check for display math blocks $$ ... $$
        if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
          const mathCode = trimmed.slice(2, -2).trim();
          return (
            <div
              key={pIdx}
              className="my-3 overflow-x-auto rounded-lg border border-border bg-bg-raised/60 px-4 py-3 text-center font-mono text-sm tracking-wide text-text-primary shadow-xs"
            >
              {mathCode}
            </div>
          );
        }

        const isBlockquote = trimmed.startsWith("> ");
        const isHeader = trimmed.startsWith("### ");
        const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");

        const cleanParagraph = isBlockquote
          ? trimmed.slice(2)
          : isHeader
            ? trimmed.slice(4)
            : isBullet
              ? trimmed.slice(2)
              : paragraph;

        // Split paragraph by citation markers
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = citeRegex.exec(cleanParagraph)) !== null) {
          const matchIndex = match.index;
          if (matchIndex > lastIndex) {
            const rawSeg = cleanParagraph.slice(lastIndex, matchIndex);
            parts.push(...renderMarkdownSpan(rawSeg, `seg-${pIdx}-${lastIndex}`));
          }

          const citeNumber = parseInt(match[1] || "1", 10);
          const citation = citations[citeNumber - 1];

          if (citation) {
            parts.push(
              <CitationBadge
                key={`cite-${pIdx}-${matchIndex}`}
                citation={citation}
                index={citeNumber - 1}
                onClick={onCitationClick}
              />
            );
          } else {
            parts.push(match[0]);
          }

          lastIndex = citeRegex.lastIndex;
        }

        if (lastIndex < cleanParagraph.length) {
          const rawSeg = cleanParagraph.slice(lastIndex);
          parts.push(...renderMarkdownSpan(rawSeg, `seg-${pIdx}-${lastIndex}`));
        }

        if (isBlockquote) {
          return (
            <blockquote
              key={pIdx}
              className="border-l-2 border-accent-primary/60 pl-3 py-1 my-2 italic text-text-muted bg-bg-raised/30 rounded-r"
            >
              {parts}
            </blockquote>
          );
        }

        if (isHeader) {
          return (
            <h4 key={pIdx} className="font-display text-base font-semibold text-text-primary mt-3 mb-1">
              {parts}
            </h4>
          );
        }

        if (isBullet) {
          return (
            <div key={pIdx} className="flex items-start gap-2 text-sm leading-relaxed pl-2 my-0.5">
              <span className="text-accent-primary font-bold text-xs mt-0.5">•</span>
              <div>{parts}</div>
            </div>
          );
        }

        return (
          <p key={pIdx} className="leading-relaxed">
            {parts}
          </p>
        );
      })}
    </div>
  );
}

export function ChatMessageItem({
  message,
  onCitationClick,
  onAskExternal,
  lastUserQuery,
}: ChatMessageItemProps) {
  const isUser = message.role === "user";
  const citations = message.citations || [];
  const isGuardrail =
    !isUser && message.content.includes(GUARDRAIL_TEXT);

  return (
    <div
      className={`group flex gap-3.5 ${
        isUser ? "flex-row-reverse" : "flex-row"
      } animate-in fade-in duration-200`}
    >
      {/* Avatar / Icon */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-medium shadow-xs ${
          isUser
            ? "border-border bg-bg-raised text-text-primary"
            : "border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
        }`}
      >
        {isUser ? (
          <UserIcon className="h-4 w-4" />
        ) : (
          <img
            src="/assets/Superbot.svg"
            alt="Superbot"
            className="h-5 w-5 object-contain"
          />
        )}
      </div>

      {/* Message Bubble & Content */}
      <div
        className={`flex max-w-[82%] flex-col ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`relative rounded-xl px-4 py-3 border shadow-xs ${
            isUser
              ? "bg-bg-raised/90 border-border text-text-primary font-sans text-sm"
              : "bg-bg-surface border-border/80"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <div>
              <FormattedAssistantContent
                content={message.content}
                citations={citations}
                onCitationClick={onCitationClick}
              />
              {isGuardrail && onAskExternal && lastUserQuery && (
                <div className="mt-3 pt-2.5 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => onAskExternal(lastUserQuery)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary transition-colors cursor-pointer border border-accent-primary/20"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Answer using external AI knowledge instead</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer / Citations overview if assistant generated citations */}
        {!isUser && citations.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-text-muted">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/80">
              Grounded in:
            </span>
            {citations.map((c, i) => (
              <CitationBadge
                key={c.id || i}
                citation={c}
                index={i}
                onClick={onCitationClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
