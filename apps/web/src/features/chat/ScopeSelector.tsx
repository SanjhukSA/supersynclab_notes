import { useState, useRef, useEffect } from "react";
import {
  Folder as FolderIcon,
  FileText,
  ChevronDown,
  Check,
  X,
  Layers,
} from "lucide-react";
import { useFolders } from "@/features/folders/useFolders";
import { useNotes } from "@/features/notes/useNotes";
import type { StudyScope } from "@/types";

interface ScopeSelectorProps {
  scope: StudyScope;
  onScopeChange: (scope: StudyScope) => void;
}

export function ScopeSelector({ scope, onScopeChange }: ScopeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: folders = [] } = useFolders();
  const { data: notes = [] } = useNotes();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const readyNotes = notes.filter((n) => n.status === "ready");

  const getScopeLabel = () => {
    if (scope.type === "all") return "All Notes";
    if (scope.type === "folder") return `Folder: ${scope.folderName}`;
    return `${scope.noteIds.length} Note${scope.noteIds.length > 1 ? "s" : ""}`;
  };

  const getScopeIcon = () => {
    if (scope.type === "all")
      return (
        <img
          src="/assets/nav-notes.svg"
          alt="All Notes"
          className="h-3 w-3 object-contain dark:invert opacity-90"
        />
      );
    if (scope.type === "folder")
      return <FolderIcon className="h-3 w-3 text-accent-highlight" />;
    return <Layers className="h-3 w-3 text-accent-primary" />;
  };

  const toggleNoteSelection = (noteId: string, noteTitle: string) => {
    if (scope.type !== "notes") {
      onScopeChange({
        type: "notes",
        noteIds: [noteId],
        noteTitles: [noteTitle],
      });
      return;
    }

    const exists = scope.noteIds.includes(noteId);
    if (exists) {
      const newIds = scope.noteIds.filter((id) => id !== noteId);
      const newTitles = scope.noteTitles.filter((_, idx) => scope.noteIds[idx] !== noteId);
      if (newIds.length === 0) {
        onScopeChange({ type: "all" });
      } else {
        onScopeChange({ type: "notes", noteIds: newIds, noteTitles: newTitles });
      }
    } else {
      onScopeChange({
        type: "notes",
        noteIds: [...scope.noteIds, noteId],
        noteTitles: [...scope.noteTitles, noteTitle],
      });
    }
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Pill Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border border-border bg-bg-raised text-text-primary hover:border-accent-primary/50 transition-colors shadow-xs"
        title="Add context to AI study session from specific notes or a course folder"
      >
        {getScopeIcon()}
        <span className="truncate max-w-[150px] font-medium">{getScopeLabel()}</span>
        <ChevronDown className="h-3 w-3 text-text-muted" />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 rounded-lg border border-border bg-bg-surface p-2 shadow-xl z-50 animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border px-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
              Add Context
            </span>
            {scope.type !== "all" && (
              <button
                type="button"
                onClick={() => onScopeChange({ type: "all" })}
                className="text-[10px] text-accent-primary hover:underline flex items-center gap-0.5"
              >
                <X className="h-2.5 w-2.5" />
                Reset to All
              </button>
            )}
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {/* Option: All Notes */}
            <button
              type="button"
              onClick={() => {
                onScopeChange({ type: "all" });
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                scope.type === "all"
                  ? "bg-accent-primary/10 text-accent-primary font-medium"
                  : "text-text-primary hover:bg-bg-raised"
              }`}
            >
              <div className="flex items-center gap-2">
                <img
                  src="/assets/nav-notes.svg"
                  alt="All Notes"
                  className="h-3.5 w-3.5 object-contain dark:invert opacity-90"
                />
                <span>All Notes</span>
              </div>
              {scope.type === "all" && <Check className="h-3.5 w-3.5" />}
            </button>

            {/* Folder section */}
            {folders.length > 0 && (
              <div className="pt-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2 pb-1">
                  By Course Folder
                </div>
                {folders.map((folder) => {
                  const isSelected =
                    scope.type === "folder" && scope.folderId === folder.id;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        onScopeChange({
                          type: "folder",
                          folderId: folder.id,
                          folderName: folder.name,
                        });
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                        isSelected
                          ? "bg-accent-highlight/15 text-accent-highlight font-medium"
                          : "text-text-primary hover:bg-bg-raised"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderIcon className="h-3.5 w-3.5 text-accent-highlight shrink-0" />
                        <span className="truncate">{folder.name}</span>
                        {folder.note_count !== undefined && (
                          <span className="text-[10px] text-text-muted font-mono">
                            ({folder.note_count})
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Individual Notes section */}
            {readyNotes.length > 0 && (
              <div className="pt-2 border-t border-border mt-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2 pb-1">
                  Pick Specific Notes
                </div>
                {readyNotes.map((note) => {
                  const isChecked =
                    scope.type === "notes" && scope.noteIds.includes(note.id);
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => toggleNoteSelection(note.id, note.title)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${
                        isChecked
                          ? "bg-accent-primary/10 text-accent-primary font-medium"
                          : "text-text-primary hover:bg-bg-raised"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="h-3.5 w-3.5 text-text-muted shrink-0" />
                        <span className="truncate">{note.title}</span>
                      </div>
                      {isChecked && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
