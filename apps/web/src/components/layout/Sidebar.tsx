import React, { useState } from "react";
import {
  Folder as FolderIcon,
  FolderPlus,
  MessageSquare,
  Plus,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { useNotes } from "@/features/notes/useNotes";
import { useChats, useDeleteChat } from "@/features/chat/useChat";
import {
  useFolders,
  useCreateFolder,
  useDeleteFolder,
} from "@/features/folders/useFolders";
import { OrnamentalDivider } from "@/components/editorial/OrnamentalDivider";

interface SidebarProps {
  activeTab: "library" | "chat";
  onSelectTab: (tab: "library" | "chat") => void;
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onOpenSettings?: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  activeChatId,
  onSelectChat,
  onNewChat,
  selectedFolderId,
  onSelectFolder,
  onOpenSettings,
}: SidebarProps) {
  const { data: notes } = useNotes();
  const { data: chats = [] } = useChats();
  const { data: folders = [] } = useFolders();
  const deleteChatMutation = useDeleteChat();
  const createFolderMutation = useCreateFolder();
  const deleteFolderMutation = useDeleteFolder();

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const noteCount = notes?.length ?? 0;

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this chat?")) {
      await deleteChatMutation.mutateAsync(id);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await createFolderMutation.mutateAsync({ name: newFolderName.trim() });
      setNewFolderName("");
      setIsCreatingFolder(false);
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
  };

  const handleDeleteFolder = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete folder "${name}"? Notes inside will become unfiled.`)) {
      await deleteFolderMutation.mutateAsync(id);
      if (selectedFolderId === id) {
        onSelectFolder(null);
      }
    }
  };

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-bg-surface select-none shrink-0">
      {/* Brand / Logo */}
      <div className="flex items-center border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <img
            src="/assets/Logo.svg"
            alt="SuperNotes Logo"
            className="h-6 w-auto max-h-6 object-contain rounded-xs"
          />
          <span className="font-display text-lg font-semibold text-text-primary">
            SuperNotes
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {/* Workspace Views */}
        <div>
          <p className="px-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Workspace
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              <button
                type="button"
                onClick={() => {
                  onSelectTab("library");
                  onSelectFolder(null);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === "library" && selectedFolderId === null
                    ? "bg-bg-raised text-text-primary border border-border shadow-2xs"
                    : "text-text-muted hover:text-text-primary hover:bg-bg-raised/50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src="/assets/nav-notes.svg"
                    alt="All Notes"
                    className="h-4 w-4 object-contain dark:invert opacity-90"
                  />
                  <span>All Notes</span>
                </div>
                {noteCount > 0 && (
                  <span className="rounded-full bg-bg-base px-2 py-0.5 text-[11px] text-text-muted border border-border">
                    {noteCount}
                  </span>
                )}
              </button>
            </li>

            <li>
              <button
                type="button"
                onClick={() => onSelectTab("chat")}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === "chat"
                    ? "bg-bg-raised text-text-primary border border-border shadow-2xs"
                    : "text-text-muted hover:text-text-primary hover:bg-bg-raised/50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src="/assets/nav-chat.svg"
                    alt="Study Chat"
                    className="h-4 w-4 object-contain dark:invert opacity-90"
                  />
                  <span>Study Chat</span>
                </div>
                {chats.length > 0 && (
                  <span className="rounded-full bg-bg-base px-2 py-0.5 text-[11px] text-text-muted border border-border">
                    {chats.length}
                  </span>
                )}
              </button>
            </li>
          </ul>
        </div>

        {/* Folders Section */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Folders
            </p>
            <button
              type="button"
              onClick={() => setIsCreatingFolder(true)}
              className="p-1 rounded text-text-muted hover:text-accent-primary hover:bg-bg-raised transition-colors cursor-pointer"
              title="Create New Folder"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* New folder creation input */}
          {isCreatingFolder && (
            <form onSubmit={handleCreateFolder} className="mb-2 px-1">
              <div className="flex items-center gap-1 rounded-md border border-accent-primary bg-bg-base p-1">
                <input
                  type="text"
                  autoFocus
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="flex-1 bg-transparent px-1.5 py-0.5 text-xs text-text-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="rounded p-0.5 text-accent-primary hover:bg-bg-raised disabled:opacity-40 cursor-pointer"
                  title="Save folder"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName("");
                  }}
                  className="rounded p-0.5 text-text-muted hover:bg-bg-raised cursor-pointer"
                  title="Cancel"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </form>
          )}

          {folders.length === 0 ? (
            <p className="px-2 text-xs italic text-text-muted">
              No folders created yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {folders.map((f) => {
                const isSelected =
                  activeTab === "library" && selectedFolderId === f.id;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTab("library");
                        onSelectFolder(f.id);
                      }}
                      className={`group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-accent-primary/10 text-accent-primary font-medium border border-accent-primary/20"
                          : "text-text-primary hover:bg-bg-raised/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderIcon className="h-3.5 w-3.5 shrink-0 text-accent-primary/80" />
                        <span className="truncate">{f.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {f.note_count !== undefined && f.note_count > 0 && (
                          <span className="rounded-full bg-bg-base px-1.5 py-0.2 text-[10px] text-text-muted border border-border">
                            {f.note_count}
                          </span>
                        )}
                        <span
                          onClick={(e) => handleDeleteFolder(f.id, f.name, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-state-error transition-opacity"
                          title="Delete folder"
                        >
                          <Trash2 className="h-3 w-3" />
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Ornamental divider */}
        <div className="px-4">
          <OrnamentalDivider variant="diamond" className="my-1" />
        </div>

        {/* Recent Chats Section */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Study Chats
            </p>
            <button
              type="button"
              onClick={() => {
                onSelectTab("chat");
                onNewChat();
              }}
              className="p-1 rounded text-text-muted hover:text-accent-primary hover:bg-bg-raised transition-colors cursor-pointer"
              title="Create New Chat"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {chats.length === 0 ? (
            <p className="px-2 text-xs italic text-text-muted">
              No chat sessions yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((c) => {
                const isSelected = activeTab === "chat" && activeChatId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTab("chat");
                        onSelectChat(c.id);
                      }}
                      className={`group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-accent-primary/10 text-accent-primary font-medium border border-accent-primary/20"
                          : "text-text-primary hover:bg-bg-raised/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-muted group-hover:text-text-primary" />
                        <span className="truncate">{c.title}</span>
                      </div>
                      <span
                        onClick={(e) => handleDeleteChat(c.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-state-error transition-opacity"
                        title="Delete chat"
                      >
                        <Trash2 className="h-3 w-3" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </nav>

      {/* Footer / Settings Shortcut */}
      {onOpenSettings && (
        <div className="border-t border-border p-2.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <img
                src="/assets/nav-settings.svg"
                alt="Settings"
                className="h-3.5 w-3.5 object-contain dark:invert opacity-80"
              />
              <span>Settings</span>
            </div>
          </button>
        </div>
      )}
    </aside>
  );
}
