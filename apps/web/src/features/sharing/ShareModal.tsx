import { useState } from "react";
import {
  Check,
  Copy,
  Globe,
  Link as LinkIcon,
  Loader2,
  Mail,
  UserCheck,
  X,
} from "lucide-react";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";
import { OrnamentalDivider } from "@/components/editorial/OrnamentalDivider";
import {
  useCreateShareGrant,
  useCreateShareLink,
} from "./useSharing";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: "note" | "chat" | "folder";
  resourceId: string;
  resourceTitle: string;
}

export function ShareModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
}: ShareModalProps) {
  const createLinkMutation = useCreateShareLink();
  const createGrantMutation = useCreateShareGrant();

  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [grantEmail, setGrantEmail] = useState<string>("");
  const [grantRole, setGrantRole] = useState<"viewer" | "editor">("viewer");
  const [grantSuccess, setGrantSuccess] = useState<boolean>(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerateLink = async () => {
    try {
      const res = await createLinkMutation.mutateAsync({
        resourceType,
        resourceId,
      });
      const fullUrl = `${window.location.origin}${res.share_url}`;
      setShareUrl(fullUrl);
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to generate link:", err);
    }
  };

  const handleCopyExistingLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantEmail.trim()) return;

    setGrantError(null);
    setGrantSuccess(false);

    try {
      await createGrantMutation.mutateAsync({
        resourceType,
        resourceId,
        granteeEmail: grantEmail.trim(),
        role: grantRole,
      });
      setGrantSuccess(true);
      setGrantEmail("");
      setTimeout(() => setGrantSuccess(false), 4000);
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : "Failed to share");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl border border-border bg-bg-surface p-6 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <CornerFlourish size={14} />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
              <LinkIcon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-text-primary">
                Share Study Materials
              </h3>
              <p className="text-xs text-text-muted truncate max-w-xs">
                {resourceTitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:bg-bg-raised hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="py-4 space-y-6">
          {/* Section 1: Instant Public / Peer Read-Only Link */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-accent-primary" />
              <h4 className="font-serif text-sm font-semibold text-text-primary">
                Instant Read-Only Study Link
              </h4>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Anyone with this link can view the high-res note scans, cheat sheets, or chat transcripts without needing an account or API key.
            </p>

            {shareUrl ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-lg border border-border bg-bg-raised px-3 py-1.5 text-xs font-mono text-text-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyExistingLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary text-bg-base text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGenerateLink}
                disabled={createLinkMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border bg-bg-raised text-text-primary text-xs font-medium hover:border-accent-primary/50 transition-colors cursor-pointer"
              >
                {createLinkMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LinkIcon className="h-3.5 w-3.5 text-accent-primary" />
                )}
                <span>Generate Shareable Study Link</span>
              </button>
            )}
          </div>

          <OrnamentalDivider variant="section" />

          {/* Section 2: Direct Peer Sharing by Email */}
          <form onSubmit={handleSendGrant} className="space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-accent-highlight" />
              <h4 className="font-serif text-sm font-semibold text-text-primary">
                Share with a Classmate
              </h4>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Grant permissions directly to a registered classmate's university email.
            </p>

            <div className="flex gap-2">
              <input
                type="email"
                placeholder="classmate@university.edu"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-bg-raised px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
              />

              <select
                value={grantRole}
                onChange={(e) => setGrantRole(e.target.value as "viewer" | "editor")}
                className="rounded-lg border border-border bg-bg-raised px-2.5 py-1.5 text-xs text-text-primary focus:outline-none"
              >
                <option value="viewer">Viewer (Read-only)</option>
                <option value="editor">Editor (Can edit)</option>
              </select>

              <button
                type="submit"
                disabled={createGrantMutation.isPending || !grantEmail.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary text-bg-base text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
              >
                {createGrantMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5" />
                )}
                <span>Share</span>
              </button>
            </div>

            {grantSuccess && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-state-success bg-state-success/10 border border-state-success/25 rounded-md p-2">
                <Check className="h-3.5 w-3.5" />
                <span>Access granted to {grantRole}!</span>
              </div>
            )}

            {grantError && (
              <div className="text-[11px] font-mono text-state-error bg-state-error/10 border border-state-error/25 rounded-md p-2">
                {grantError}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
