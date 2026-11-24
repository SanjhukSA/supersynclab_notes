import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CornerDownLeft,
  Loader2,
  Plus,
  Sparkles,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { OrnamentalDivider } from "@/components/editorial/OrnamentalDivider";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";
import { ShareModal } from "@/features/sharing/ShareModal";
import {
  useChat,
  useChats,
  useCreateChat,
  useDeleteChat,
  useSendMessage,
} from "./useChat";
import { ChatMessageItem } from "./ChatMessageItem";
import { ScopeSelector } from "./ScopeSelector";
import type { AnswerMode, Citation, StudyScope } from "@/types";

interface ChatPanelProps {
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCitationClick?: (citation: Citation) => void;
  scope?: StudyScope;
  onScopeChange?: (scope: StudyScope) => void;
}

const EXAMPLE_PROMPTS = [
  "Summarize key formulas and laws from my notes",
  "Explain the core concept and its assumptions step-by-step",
  "What are the main past-exam questions on this topic?",
];

export function ChatPanel({
  activeChatId,
  onSelectChat,
  onCitationClick,
  scope,
  onScopeChange,
}: ChatPanelProps) {
  const [localScope, setLocalScope] = useState<StudyScope>({ type: "all" });
  const activeScope = scope ?? localScope;
  const handleScopeChange = onScopeChange ?? setLocalScope;

  const [input, setInput] = useState("");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("hybrid");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: chats = [] } = useChats();
  const { data: chatDetail, isLoading: isLoadingChat } = useChat(activeChatId);
  const createChatMutation = useCreateChat();
  const deleteChatMutation = useDeleteChat();
  const sendMessageMutation = useSendMessage(activeChatId);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatDetail?.messages, sendMessageMutation.isPending]);

  // Focus textarea when chat changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeChatId]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachedImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCreateNewChat = async () => {
    try {
      const newChat = await createChatMutation.mutateAsync("New Study Session");
      onSelectChat(newChat.id);
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this study chat?")) {
      await deleteChatMutation.mutateAsync(id);
      if (activeChatId === id) {
        const remaining = chats.filter((c) => c.id !== id);
        const nextChat = remaining[0];
        if (nextChat) {
          onSelectChat(nextChat.id);
        }
      }
    }
  };

  const handleSend = async (overrideContent?: string, forceExternal?: boolean) => {
    const textToSend = (overrideContent ?? input).trim();
    if ((!textToSend && !attachedImage) || sendMessageMutation.isPending) return;

    let targetChatId = activeChatId;

    // If no active chat, create one first
    if (!targetChatId) {
      try {
        const titleSeed = textToSend || "Problem Snap Study Session";
        const newChat = await createChatMutation.mutateAsync(
          titleSeed.slice(0, 30) + (titleSeed.length > 30 ? "..." : "")
        );
        targetChatId = newChat.id;
        onSelectChat(newChat.id);
      } catch (err) {
        console.error("Failed to auto-create chat:", err);
        return;
      }
    }

    const currentImg = attachedImage;
    if (!overrideContent) {
      setInput("");
      setAttachedImage(null);
    }

    try {
      await sendMessageMutation.mutateAsync({
        content: textToSend || "Please solve and explain the attached problem snap:",
        mode: forceExternal ? "ai_only" : answerMode,
        allowExternal: answerMode !== "notes_only",
        imageData: currentImg,
        noteIds: activeScope.type === "notes" ? activeScope.noteIds : null,
        folderId: activeScope.type === "folder" ? activeScope.folderId : null,
      });
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const messages = chatDetail?.messages || [];
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  return (
    <div className="flex h-full flex-col bg-bg-base">
      {/* Top Header Bar */}
      <div className="flex h-14 items-center justify-between border-b border-border bg-bg-surface px-6 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold text-text-primary truncate max-w-sm">
            {chatDetail?.data?.title || "AI Study Desk"}
          </h2>

          <ScopeSelector scope={activeScope} onScopeChange={handleScopeChange} />
        </div>

        <div className="flex items-center gap-2">
          {activeChatId && (
            <>
              <button
                type="button"
                onClick={() => setIsShareOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-primary bg-bg-raised border border-border hover:border-accent-primary/50 transition-colors shadow-xs"
                title="Share study session transcript"
              >
                <Share2 className="h-3.5 w-3.5 text-accent-primary" />
                <span className="hidden sm:inline">Share</span>
              </button>

              <button
                type="button"
                onClick={(e) => handleDeleteChat(activeChatId, e)}
                className="p-1.5 rounded-md text-text-muted hover:text-state-error hover:bg-state-error/10 transition-colors"
                title="Delete this chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleCreateNewChat}
            disabled={createChatMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-text-primary bg-bg-raised border border-border hover:border-accent-primary/50 transition-colors shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {/* Share Study Session Modal */}
      {activeChatId && (
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          resourceType="chat"
          resourceId={activeChatId}
          resourceTitle={chatDetail?.data?.title || "Study Session Transcript"}
        />
      )}

      {/* Center Messages Area with Classical Fresco Background */}
      <div className="relative flex-1 overflow-y-auto p-6 md:p-8">
        {/* Classical Artwork: Raphael's School of Athens */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-cover bg-no-repeat opacity-[0.15] dark:opacity-[0.09] mix-blend-multiply dark:mix-blend-screen filter contrast-105"
          style={{
            backgroundImage: "url('/assets/school-of-athens.png')",
            backgroundPosition: "center 25%",
            backgroundAttachment: "local",
          }}
        />

        {/* Soft paper vignette gradient overlay for comfortable reading contrast */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-bg-base/60 via-bg-base/30 to-bg-base/80"
        />

        <div className="relative z-10 mx-auto max-w-3xl space-y-6">
          {isLoadingChat && (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-accent-primary mb-2" />
              <p className="text-xs italic">Opening study transcript...</p>
            </div>
          )}

          {!isLoadingChat && messages.length === 0 && (
            <div className="relative mx-auto max-w-xl rounded-2xl border border-border bg-bg-surface/70 p-8 text-center shadow-xs overflow-hidden">
              <CornerFlourish size={14} />

              <div className="flex justify-center mb-4">
                <div className="p-2.5 rounded-full bg-bg-raised/40 border border-border/80 shadow-xs overflow-hidden">
                  <img
                    src="/assets/Superbot.svg"
                    alt="Ask Superbot"
                    className="h-16 w-16 object-contain rounded-full"
                  />
                </div>
              </div>

              <h3 className="font-display text-2xl font-semibold text-text-primary tracking-tight">
                Ask Superbot
              </h3>

              <div className="mx-auto max-w-xs mt-3">
                <OrnamentalDivider variant="flourish" />
              </div>

              {/* Sample Prompts */}
              <div className="mt-4 space-y-2 text-left">
                <p className="px-1 text-[11px] font-mono uppercase tracking-wider text-text-muted">
                  Suggested study inquiries
                </p>
                {EXAMPLE_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="group flex w-full items-center justify-between rounded-lg border border-border bg-bg-surface p-3 text-xs text-text-primary hover:border-accent-primary hover:bg-bg-raised/50 transition-all text-left shadow-2xs cursor-pointer"
                  >
                    <span className="font-sans leading-relaxed">{prompt}</span>
                    <Sparkles className="h-3.5 w-3.5 text-accent-highlight shrink-0 ml-2 group-hover:scale-110 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isLoadingChat &&
            messages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                onCitationClick={onCitationClick}
                onAskExternal={(origQuery) => handleSend(origQuery, true)}
                lastUserQuery={lastUserMessage?.content}
              />
            ))}

          {/* Assistant typing indicator */}
          {sendMessageMutation.isPending && (
            <div className="flex items-center gap-3 animate-in fade-in duration-200">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-primary/30 bg-accent-primary/10 text-accent-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="rounded-xl border border-border bg-bg-surface px-4 py-3 shadow-xs">
                <p className="text-xs font-serif italic text-text-muted">
                  Searching index, analyzing parent passages, and grounding citations...
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom Composer Area */}
      <div className="border-t border-border bg-bg-surface p-4 shrink-0">
        <div className="mx-auto max-w-3xl space-y-2">
          {/* Controls Bar: 3-Option Answer Mode Selector */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-base p-0.5 text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setAnswerMode("hybrid")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  answerMode === "hybrid"
                    ? "bg-bg-raised text-text-primary shadow-xs border border-border"
                    : "text-text-muted hover:text-text-primary"
                }`}
                title="Hybrid mode: general knowledge backbone personalized with your notes & citations"
              >
                <span>⚡ Hybrid</span>
              </button>
              <button
                type="button"
                onClick={() => setAnswerMode("notes_only")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  answerMode === "notes_only"
                    ? "bg-bg-raised text-text-primary shadow-xs border border-border"
                    : "text-text-muted hover:text-text-primary"
                }`}
                title="Notes Only mode: strictly answers from notes; triggers 'Not covered' if absent"
              >
                <span>📚 Notes Only</span>
              </button>
              <button
                type="button"
                onClick={() => setAnswerMode("ai_only")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  answerMode === "ai_only"
                    ? "bg-bg-raised text-text-primary shadow-xs border border-border"
                    : "text-text-muted hover:text-text-primary"
                }`}
                title="AI Only mode: answers purely from AI general knowledge without consulting notes"
              >
                <span>✨ AI Only</span>
              </button>
            </div>

            <span className="text-[11px] text-text-muted hidden sm:inline">
              Press <kbd className="px-1 py-0.5 rounded bg-bg-raised border border-border text-[10px]">Enter</kbd> to send
            </span>
          </div>

          {/* Image preview chip if attached */}
          {attachedImage && (
            <div className="flex items-center gap-2 rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-3 py-1.5 w-fit">
              <img
                src={attachedImage}
                alt="Attached Exam/Notes Snap"
                className="h-10 w-10 rounded object-cover border border-border"
              />
              <div className="text-xs">
                <span className="font-medium text-text-primary block">
                  Problem / PYQ Snap Attached
                </span>
                <span className="text-[10px] text-text-muted">
                  Multimodal OCR will transcribe math formulas
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="ml-2 rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary transition-colors cursor-pointer"
                title="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />

          {/* Text Input Box */}
          <div className="relative flex items-center rounded-xl border border-border bg-bg-base shadow-xs focus-within:border-accent-primary focus-within:ring-1 focus-within:ring-accent-primary transition-all">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="ml-3 rounded-lg p-2 text-text-muted hover:bg-bg-raised hover:text-accent-primary transition-colors cursor-pointer"
              title="Attach Exam Snap or Handwritten Problem"
            >
              <Camera className="h-4 w-4" />
            </button>

            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your uploaded notes or attach an exam snap..."
              disabled={sendMessageMutation.isPending}
              className="w-full resize-none bg-transparent px-3 py-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none"
            />

            <div className="pr-3">
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={(!input.trim() && !attachedImage) || sendMessageMutation.isPending}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                title="Send Message"
              >
                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CornerDownLeft className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
