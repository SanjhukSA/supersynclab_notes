import { HardDrive, Search } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { AppUserButton } from "@/features/auth/AuthContext";
import type { UserInfo } from "@/types";

interface TopBarProps {
  userInfo: UserInfo | null;
  onOpenGoogleSync?: () => void;
  onOpenSearch?: () => void;
}

/**
 * Top bar — workspace title, search, theme toggle, and user menu.
 *
 * From ui-context.md:
 * "Top bar: workspace title, search, theme toggle, and user menu,
 *  with a bottom border"
 */
export function TopBar({
  userInfo,
  onOpenGoogleSync,
  onOpenSearch,
}: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-bg-surface px-5">
      {/* Left: workspace title */}
      <div>
        <h1 className="font-display text-base font-semibold text-text-primary tracking-tight">
          {userInfo?.display_name
            ? `${userInfo.display_name}'s Desk`
            : "Academic Study Desk"}
        </h1>
      </div>

      {/* Center: Command Palette search trigger */}
      <div className="flex max-w-md flex-1 justify-center px-4 sm:px-8">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-bg-base/80 px-3 py-1.5 text-left text-sm text-text-muted transition-all hover:border-accent-primary/50 hover:bg-bg-raised/70 cursor-pointer shadow-2xs group"
          title="Search notes, slides, passages…"
        >
          <Search className="h-4 w-4 text-text-muted group-hover:text-accent-primary transition-colors shrink-0" />
          <span className="truncate text-xs sm:text-sm text-text-muted/80 group-hover:text-text-primary transition-colors">
            Search notes, slides, passages…
          </span>
        </button>
      </div>

      {/* Right: cloud sync + theme toggle + user menu */}
      <div className="flex items-center gap-2.5">
        {onOpenGoogleSync && (
          <button
            type="button"
            onClick={onOpenGoogleSync}
            className="rounded-md border border-border bg-bg-base p-2 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-primary cursor-pointer shadow-xs"
            title="Google Drive & Classroom Cloud Sync"
            aria-label="Google Drive & Classroom Cloud Sync"
          >
            <HardDrive className="h-4 w-4 text-accent-highlight" />
          </button>
        )}
        <ThemeToggle />
        <AppUserButton />
      </div>
    </header>
  );
}
