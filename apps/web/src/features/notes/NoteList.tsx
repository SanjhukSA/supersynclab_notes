import { useState } from "react";
import {
  FileText,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Eye,
  X,
  BookOpen,
  Folder as FolderIcon,
  Sparkles,
  CheckSquare,
  Square,
  MessageSquare,
  Share2,
} from "lucide-react";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";
import { LibraryEmptyState } from "./LibraryEmptyState";
import { ShareModal } from "@/features/sharing/ShareModal";
import {
  useNotes,
  useDeleteNote,
  useProcessNote,
  useNotePages,
  useUpdateNote,
} from "./useNotes";
import { useFolders } from "@/features/folders/useFolders";
import {
  useGenerateCheatSheet,
  useGenerateQuiz,
  useSynthesizeCheatSheet,
  useSynthesizeQuiz,
} from "@/features/study/useStudy";
import { CheatSheetModal } from "@/features/study/CheatSheetModal";
import { QuizModal } from "@/features/study/QuizModal";
import type { CheatSheet, Note, Quiz, StudyScope } from "@/types";

interface NoteListProps {
  onOpenViewer?: (noteId: string, title: string, pageNumber?: number) => void;
  selectedFolderId?: string | null;
  onClearFolderFilter?: () => void;
  onOpenStudyDesk?: (scope: StudyScope) => void;
}

export function NoteList({
  onOpenViewer,
  selectedFolderId,
  onClearFolderFilter,
  onOpenStudyDesk,
}: NoteListProps = {}) {
  const { data: notes, isLoading, error } = useNotes();
  const { data: folders = [] } = useFolders();
  const { mutate: deleteNote, isPending: isDeleting } = useDeleteNote();
  const { mutate: processNote, isPending: isProcessing } = useProcessNote();
  const updateNoteMutation = useUpdateNote();

  // Multi-selection state
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);

  // Study workflow state
  const cheatSheetMutation = useGenerateCheatSheet();
  const quizMutation = useGenerateQuiz();
  const synthesizeCheatSheetMutation = useSynthesizeCheatSheet();
  const synthesizeQuizMutation = useSynthesizeQuiz();

  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Modals state
  const [activeCheatSheet, setActiveCheatSheet] = useState<{
    noteTitle: string;
    data: CheatSheet | null;
  } | null>(null);

  const [activeQuiz, setActiveQuiz] = useState<{
    noteTitle: string;
    data: Quiz | null;
  } | null>(null);

  const [activeShareNote, setActiveShareNote] = useState<Note | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-accent-primary" />
        Loading your notes library…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-state-error/30 bg-state-error/10 p-4 text-xs text-state-error">
        Failed to load notes. Please check that the API is running.
      </div>
    );
  }

  if (!notes || notes.length === 0) {
    return <LibraryEmptyState />;
  }

  // Filter notes by selectedFolderId if provided
  const filteredNotes = selectedFolderId
    ? notes.filter((n) => n.folder_id === selectedFolderId)
    : notes;

  const currentFolder = folders.find((f) => f.id === selectedFolderId);

  const renderStatusBadge = (status: Note["status"]) => {
    switch (status) {
      case "ready":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-state-success/15 px-2.5 py-0.5 text-[11px] font-medium text-state-success">
            <CheckCircle2 className="h-3 w-3" />
            Ready
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-highlight/20 px-2.5 py-0.5 text-[11px] font-medium text-accent-highlight animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-state-error/15 px-2.5 py-0.5 text-[11px] font-medium text-state-error">
            <AlertCircle className="h-3 w-3" />
            Failed
          </span>
        );
      case "pending":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-highlight/15 px-2.5 py-0.5 text-[11px] font-medium text-accent-highlight">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const handleFolderChange = async (noteId: string, folderId: string) => {
    try {
      await updateNoteMutation.mutateAsync({
        noteId,
        folderId: folderId === "none" ? null : folderId,
      });
    } catch (err) {
      console.error("Failed to move note:", err);
    }
  };

  const handleOpenCheatSheet = async (note: Note) => {
    setActiveCheatSheet({ noteTitle: note.title, data: null });
    try {
      const data = await cheatSheetMutation.mutateAsync(note.id);
      setActiveCheatSheet({ noteTitle: note.title, data });
    } catch (err) {
      console.error("Failed to generate cheat sheet:", err);
    }
  };

  const handleOpenQuiz = async (note: Note) => {
    setActiveQuiz({ noteTitle: note.title, data: null });
    try {
      const data = await quizMutation.mutateAsync(note.id);
      setActiveQuiz({ noteTitle: note.title, data });
    } catch (err) {
      console.error("Failed to generate quiz:", err);
    }
  };

  const toggleSelectNote = (id: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const readyFiltered = filteredNotes.filter((n) => n.status === "ready").map((n) => n.id);
    if (selectedNoteIds.length === readyFiltered.length) {
      setSelectedNoteIds([]);
    } else {
      setSelectedNoteIds(readyFiltered);
    }
  };

  const handleSynthesizeCheatSheet = async () => {
    const isFolderSynth = selectedNoteIds.length === 0 && selectedFolderId;
    const targetTitle =
      isFolderSynth && currentFolder
        ? `Course Synthesis: ${currentFolder.name}`
        : `Course Synthesis (${selectedNoteIds.length} Notes)`;

    setActiveCheatSheet({ noteTitle: targetTitle, data: null });
    try {
      const data = await synthesizeCheatSheetMutation.mutateAsync({
        noteIds: selectedNoteIds.length > 0 ? selectedNoteIds : undefined,
        folderId: isFolderSynth ? selectedFolderId : undefined,
        title: targetTitle,
      });
      setActiveCheatSheet({ noteTitle: targetTitle, data });
    } catch (err) {
      console.error("Failed to synthesize cheat sheet:", err);
    }
  };

  const handleSynthesizeQuiz = async () => {
    const isFolderSynth = selectedNoteIds.length === 0 && selectedFolderId;
    const targetTitle =
      isFolderSynth && currentFolder
        ? `Practice Exam: ${currentFolder.name}`
        : `Practice Exam (${selectedNoteIds.length} Notes)`;

    setActiveQuiz({ noteTitle: targetTitle, data: null });
    try {
      const data = await synthesizeQuizMutation.mutateAsync({
        noteIds: selectedNoteIds.length > 0 ? selectedNoteIds : undefined,
        folderId: isFolderSynth ? selectedFolderId : undefined,
        title: targetTitle,
      });
      setActiveQuiz({ noteTitle: targetTitle, data });
    } catch (err) {
      console.error("Failed to synthesize quiz:", err);
    }
  };

  const handleOpenStudyDeskWithSelection = () => {
    if (!onOpenStudyDesk) return;
    if (selectedNoteIds.length > 0) {
      const selectedTitles =
        notes?.filter((n) => selectedNoteIds.includes(n.id)).map((n) => n.title) || [];
      onOpenStudyDesk({
        type: "notes",
        noteIds: selectedNoteIds,
        noteTitles: selectedTitles,
      });
    } else if (selectedFolderId && currentFolder) {
      onOpenStudyDesk({
        type: "folder",
        folderId: selectedFolderId,
        folderName: currentFolder.name,
      });
    }
  };

  const isSelectionActive = selectedNoteIds.length > 0;
  const readyInScope = filteredNotes.filter((n) => n.status === "ready");

  return (
    <div className="space-y-3">
      {/* List Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-medium text-text-primary">
            {currentFolder ? `Folder: ${currentFolder.name}` : "Uploaded Notes"} (
            {filteredNotes.length})
          </h2>
          {selectedFolderId && onClearFolderFilter && (
            <button
              type="button"
              onClick={onClearFolderFilter}
              className="text-xs text-accent-primary hover:underline ml-2"
            >
              Show all notes
            </button>
          )}
        </div>

        {readyInScope.length > 1 && (
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-xs text-text-muted hover:text-accent-primary flex items-center gap-1 font-mono transition-colors"
          >
            {selectedNoteIds.length === readyInScope.length ? (
              <>
                <CheckSquare className="h-3.5 w-3.5 text-accent-primary" />
                <span>Deselect All</span>
              </>
            ) : (
              <>
                <Square className="h-3.5 w-3.5" />
                <span>Select All ({readyInScope.length})</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Course Synthesis & Batch Action Bar */}
      {(isSelectionActive || (selectedFolderId && readyInScope.length > 1)) && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-accent-primary/25 bg-bg-surface shadow-xs animate-in fade-in-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-primary text-[11px] font-mono font-bold text-bg-base">
              {isSelectionActive ? selectedNoteIds.length : readyInScope.length}
            </div>
            <div>
              <p className="text-xs font-serif font-semibold text-text-primary">
                {isSelectionActive
                  ? `${selectedNoteIds.length} notes selected`
                  : `All notes in ${currentFolder?.name || "folder"}`}
              </p>
              <p className="text-[10px] text-text-muted">
                Synthesize across course materials or scope study desk
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSynthesizeCheatSheet}
              disabled={synthesizeCheatSheetMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary text-bg-base text-xs font-medium hover:opacity-90 transition-opacity shadow-xs"
              title="Generate a 1-page high-yield cheat sheet synthesizing all selected notes"
            >
              {synthesizeCheatSheetMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              <span>Synthesize Cheat Sheet</span>
            </button>

            <button
              type="button"
              onClick={handleSynthesizeQuiz}
              disabled={synthesizeQuizMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-bg-raised text-text-primary text-xs font-medium hover:border-accent-primary/50 transition-colors shadow-xs"
              title="Generate active-recall practice questions synthesizing all selected notes"
            >
              {synthesizeQuizMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-highlight" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-accent-highlight" />
              )}
              <span>Practice Exam</span>
            </button>

            {onOpenStudyDesk && (
              <button
                type="button"
                onClick={handleOpenStudyDeskWithSelection}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-bg-raised text-text-primary text-xs font-medium hover:border-accent-primary/50 transition-colors shadow-xs"
                title="Switch to chat desk pre-scoped to these notes"
              >
                <MessageSquare className="h-3.5 w-3.5 text-accent-primary" />
                <span>Study Desk</span>
              </button>
            )}

            {isSelectionActive && (
              <button
                type="button"
                onClick={() => setSelectedNoteIds([])}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {filteredNotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-text-muted bg-bg-surface">
          No notes in this folder. Drop a note above to add one!
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-bg-surface overflow-hidden shadow-xs">
          {filteredNotes.map((note) => {
            const isSelected = selectedNoteIds.includes(note.id);
            return (
              <div
                key={note.id}
                className={`flex items-center justify-between p-4 transition-colors cursor-pointer ${
                  isSelected ? "bg-accent-primary/5 hover:bg-accent-primary/10" : "hover:bg-bg-raised/40"
                }`}
                onClick={() => setSelectedNote(note)}
              >
                <div className="flex items-center gap-3.5 min-w-0 pr-4">
                  {note.status === "ready" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectNote(note.id);
                      }}
                      className="p-1 -ml-1 text-text-muted hover:text-accent-primary transition-colors cursor-pointer shrink-0"
                      title={isSelected ? "Deselect note" : "Select note for synthesis"}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-accent-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-text-muted/50" />
                      )}
                    </button>
                  )}

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-base border border-border text-accent-primary">
                    <FileText className="h-5 w-5" />
                  </div>

                <div className="min-w-0">
                  <h4 className="truncate font-sans text-sm font-medium text-text-primary">
                    {note.title}
                  </h4>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="font-mono uppercase text-[10px] tracking-wider bg-bg-base px-1.5 py-0.5 rounded border border-border">
                      {note.file_type}
                    </span>
                    <span>•</span>
                    <span>{formatDate(note.created_at)}</span>
                    {note.page_count > 0 && (
                      <>
                        <span>•</span>
                        <span>
                          {note.page_count} {note.page_count === 1 ? "page" : "pages"}
                        </span>
                      </>
                    )}
                    {note.subject && (
                      <>
                        <span>•</span>
                        <span className="rounded bg-accent-primary/10 px-1.5 py-0.2 text-[10px] font-medium text-accent-primary border border-accent-primary/20">
                          {note.subject}
                        </span>
                      </>
                    )}
                    {note.topic && (
                      <span className="text-text-muted text-[11px] italic">
                        {note.topic}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="flex items-center gap-2.5 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Folder assignment dropdown */}
                {folders.length > 0 && (
                  <div className="relative inline-flex items-center">
                    <FolderIcon className="absolute left-2 h-3 w-3 text-text-muted pointer-events-none" />
                    <select
                      value={note.folder_id || "none"}
                      onChange={(e) => handleFolderChange(note.id, e.target.value)}
                      className="rounded-md border border-border bg-bg-raised pl-6 pr-2 py-1 text-[11px] text-text-secondary hover:border-accent-primary/50 focus:outline-none cursor-pointer"
                      title="Move to Folder"
                    >
                      <option value="none">Unfiled</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {renderStatusBadge(note.status)}

                {/* Process button if pending or failed */}
                {(note.status === "pending" || note.status === "failed") && (
                  <button
                    onClick={() => processNote(note.id)}
                    disabled={isProcessing}
                    className="flex items-center gap-1 rounded-md bg-accent-primary/10 px-2.5 py-1 text-xs font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors"
                    title="Run ingestion pipeline"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    <span>Process</span>
                  </button>
                )}

                {/* Study tools for ready notes */}
                {note.status === "ready" && (
                  <>
                    <button
                      onClick={() => handleOpenCheatSheet(note)}
                      disabled={cheatSheetMutation.isPending}
                      className="flex items-center gap-1 rounded-md bg-brand-primary/10 px-2 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary/20 transition-colors cursor-pointer"
                      title="Generate 1-Page High-Yield Cheat Sheet"
                    >
                      <FileText className="h-3 w-3" />
                      <span>Cheat Sheet</span>
                    </button>

                    <button
                      onClick={() => handleOpenQuiz(note)}
                      disabled={quizMutation.isPending}
                      className="flex items-center gap-1 rounded-md bg-accent-primary/10 px-2 py-1 text-xs font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors cursor-pointer"
                      title="Practice Active Recall Quiz"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Quiz</span>
                    </button>

                    {onOpenViewer && (
                      <button
                        onClick={() => onOpenViewer(note.id, note.title)}
                        className="flex items-center gap-1 rounded-md bg-accent-highlight/15 px-2 py-1 text-xs font-medium text-accent-highlight hover:bg-accent-highlight/25 transition-colors cursor-pointer"
                        title="Open in Split-Screen Viewer"
                      >
                        <BookOpen className="h-3 w-3" />
                        <span>Pages</span>
                      </button>
                    )}
                  </>
                )}

                {/* Share button */}
                {note.status === "ready" && (
                  <button
                    onClick={() => setActiveShareNote(note)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-raised hover:text-accent-primary"
                    title="Share note or study link"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                )}

                {/* View details button */}
                <button
                  onClick={() => setSelectedNote(note)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-raised hover:text-text-primary"
                  title="View note details"
                >
                  <Eye className="h-4 w-4" />
                </button>

                {/* Delete button */}
                <button
                  onClick={() => {
                    if (confirm(`Delete "${note.title}"?`)) {
                      deleteNote(note.id);
                      if (selectedNote?.id === note.id) setSelectedNote(null);
                    }
                  }}
                  disabled={isDeleting}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-state-error/10 hover:text-state-error"
                  title="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Note Detail Modal */}
      {selectedNote && (
        <NoteDetailModal
          note={selectedNote}
          onClose={() => setSelectedNote(null)}
          onProcess={() => processNote(selectedNote.id)}
          onOpenViewer={(pageNumber) => {
            setSelectedNote(null);
            onOpenViewer?.(selectedNote.id, selectedNote.title, pageNumber);
          }}
        />
      )}

      {/* High-Yield Cheat Sheet Modal */}
      <CheatSheetModal
        isOpen={Boolean(activeCheatSheet)}
        onClose={() => setActiveCheatSheet(null)}
        cheatSheet={activeCheatSheet?.data ?? null}
        isLoading={cheatSheetMutation.isPending}
        noteTitle={activeCheatSheet?.noteTitle ?? ""}
      />

      {/* Active-Recall Quiz Modal */}
      <QuizModal
        isOpen={Boolean(activeQuiz)}
        onClose={() => setActiveQuiz(null)}
        quiz={activeQuiz?.data ?? null}
        isLoading={quizMutation.isPending}
        noteTitle={activeQuiz?.noteTitle ?? ""}
      />

      {/* Share Note Modal */}
      {activeShareNote && (
        <ShareModal
          isOpen={Boolean(activeShareNote)}
          onClose={() => setActiveShareNote(null)}
          resourceType="note"
          resourceId={activeShareNote.id}
          resourceTitle={activeShareNote.title}
        />
      )}
    </div>
  );
}

function NoteDetailModal({
  note,
  onClose,
  onProcess,
  onOpenViewer,
}: {
  note: Note;
  onClose: () => void;
  onProcess: () => void;
  onOpenViewer?: (pageNumber: number) => void;
}) {
  const { data: pages, isLoading: isLoadingPages } = useNotePages(note.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-bg-surface shadow-xl overflow-hidden">
        <CornerFlourish size={14} />
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <BookOpen className="h-5 w-5 text-accent-primary shrink-0" />
            <h3 className="truncate font-display text-lg font-semibold text-text-primary">
              {note.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Metadata badges */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-bg-base/50 p-4 text-xs">
            <div>
              <span className="text-text-muted block">Status</span>
              <span className="font-medium text-text-primary capitalize">{note.status}</span>
            </div>
            <div>
              <span className="text-text-muted block">File Type</span>
              <span className="font-mono text-text-primary uppercase">{note.file_type}</span>
            </div>
            <div>
              <span className="text-text-muted block">Pages Extracted</span>
              <span className="font-medium text-text-primary">{note.page_count}</span>
            </div>
            <div>
              <span className="text-text-muted block">Uploaded On</span>
              <span className="font-medium text-text-primary">
                {new Date(note.created_at).toLocaleString()}
              </span>
            </div>
            {note.subject && (
              <div>
                <span className="text-text-muted block">Auto-Classified Subject</span>
                <span className="font-medium text-accent-primary">{note.subject}</span>
              </div>
            )}
            {note.topic && (
              <div>
                <span className="text-text-muted block">Topic</span>
                <span className="font-medium text-text-primary">{note.topic}</span>
              </div>
            )}
          </div>

          {note.summary && (
            <div className="rounded-lg border border-border bg-bg-base/30 p-3 text-xs leading-relaxed">
              <span className="text-text-muted block font-medium mb-1">Key Summary</span>
              <p className="text-text-secondary">{note.summary}</p>
            </div>
          )}

          {/* Action trigger if not ready */}
          {note.status !== "ready" && (
            <div className="rounded-lg border border-accent-highlight/30 bg-accent-highlight/10 p-4 flex items-center justify-between">
              <div className="text-xs text-text-primary">
                <p className="font-medium">Ingestion Pipeline</p>
                <p className="text-text-muted mt-0.5">
                  Click process to extract pages, render high-res images, and build search embeddings.
                </p>
              </div>
              <button
                onClick={onProcess}
                className="flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Process Now
              </button>
            </div>
          )}

          {/* Rendered Pages Gallery */}
          <div className="space-y-3">
            <h4 className="font-display text-sm font-medium text-text-primary">
              Extracted Pages ({pages?.length ?? 0})
            </h4>

            {isLoadingPages ? (
              <div className="flex items-center justify-center py-8 text-xs text-text-muted">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-accent-primary" />
                Loading rendered pages…
              </div>
            ) : pages && pages.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {pages.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => onOpenViewer?.(p.page_number)}
                    className="group relative flex flex-col rounded-lg border border-border bg-bg-base overflow-hidden hover:border-accent-primary transition-all cursor-pointer shadow-2xs hover:shadow-sm"
                    title="Click to view in Split-Screen Page Viewer"
                  >
                    {p.image_path ? (
                      <img
                        src={`/storage/${p.image_path}`}
                        alt={`Page ${p.page_number}`}
                        className="h-44 w-full object-contain bg-white/50 p-2"
                      />
                    ) : (
                      <div className="flex h-44 items-center justify-center text-xs text-text-muted italic">
                        No image preview
                      </div>
                    )}
                    <div className="border-t border-border bg-bg-surface px-3 py-1.5 text-[11px] font-medium text-text-muted flex justify-between">
                      <span>Page {p.page_number}</span>
                      <span className="text-accent-primary">Indexed</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted italic py-4">
                No pages extracted yet. Once processed, rendered page thumbnails will appear here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
