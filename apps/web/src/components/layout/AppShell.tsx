import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { apiFetch } from "@/lib/api";
import { useAppAuth } from "@/features/auth/AuthContext";
import { UploadDropzone } from "@/features/notes/UploadDropzone";
import { NoteList } from "@/features/notes/NoteList";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { SplitScreenViewerPanel } from "@/features/viewer/SplitScreenViewerPanel";
import { SettingsModal } from "@/features/settings/SettingsModal";
import { GoogleImportModal } from "@/features/integrations/GoogleImportModal";
import { GlobalSearchModal } from "@/features/search/GlobalSearchModal";
import { OrnamentalDivider } from "@/components/editorial/OrnamentalDivider";
import { useCreateChat } from "@/features/chat/useChat";
import type { Citation, StudyScope, UserInfo } from "@/types";

/**
 * Main app shell — the three-region PC layout from ui-context.md:
 *
 *  ┌──────────────┬────────────────────────────────┬──────────────┐
 *  │   Sidebar    │          Center area           │  Right panel │
 *  │ (folder tree)│      (chat / note list)        │   (viewer)   │
 *  │              │                                │  hidden by   │
 *  │              │                                │   default    │
 *  └──────────────┴────────────────────────────────┴──────────────┘
 */
export function AppShell() {
  const { getToken } = useAppAuth();
  const [activeTab, setActiveTab] = useState<"library" | "chat">("library");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [chatScope, setChatScope] = useState<StudyScope>({ type: "all" });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGoogleSyncOpen, setIsGoogleSyncOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener for Command Palette
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Split-screen viewer state
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeViewerCitation, setActiveViewerCitation] = useState<Citation | null>(null);
  const [activeViewerNoteId, setActiveViewerNoteId] = useState<string | null>(null);
  const [activeViewerNoteTitle, setActiveViewerNoteTitle] = useState<string | null>(null);

  const createChatMutation = useCreateChat();

  // Verify the auth flow works end-to-end by calling /health/me
  const { data: userInfo, isLoading } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch<{ status: string; user: UserInfo }>(
        "/health/me",
        token,
      );
      return res.user;
    },
    retry: false,
  });

  const handleNewChat = async () => {
    try {
      const chat = await createChatMutation.mutateAsync("New Study Session");
      setActiveChatId(chat.id);
      setActiveTab("chat");
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  };

  /**
   * Called when a student clicks any margin stamp citation badge [p. X].
   * Automatically slides open the viewer and scrolls to the highlighted bounding box.
   */
  const handleCitationClick = (citation: Citation) => {
    setActiveViewerCitation(citation);
    setActiveViewerNoteId(citation.note_id || null);
    setActiveViewerNoteTitle(citation.note_title || null);
    setIsViewerOpen(true);
  };

  /**
   * Called when a student clicks "View Pages" from the Library note list.
   */
  const handleOpenViewerFromLibrary = (
    noteId: string,
    title: string,
    pageNumber?: number
  ) => {
    setActiveViewerCitation(
      pageNumber
        ? {
            id: `manual-${pageNumber}`,
            chunk_id: "",
            page_id: "",
            note_id: noteId,
            note_title: title,
            page_number: pageNumber,
            bbox_x: 0,
            bbox_y: 0,
            bbox_width: 0,
            bbox_height: 0,
            snippet: "",
          }
        : null
    );
    setActiveViewerNoteId(noteId);
    setActiveViewerNoteTitle(title);
    setIsViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setIsViewerOpen(false);
    setActiveViewerCitation(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base">
      {/* Left sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeChatId={activeChatId}
        onSelectChat={(id) => {
          setActiveChatId(id);
          setActiveTab("chat");
        }}
        onNewChat={handleNewChat}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main center study area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <TopBar
          userInfo={isLoading ? null : (userInfo ?? null)}
          onOpenGoogleSync={() => setIsGoogleSyncOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
        />

        {activeTab === "library" ? (
          /* Center reading / study area: Library */
          <main className="flex-1 overflow-y-auto p-8">
            <div className="mx-auto max-w-3xl space-y-8">
              {/* Header intro */}
              <div>
                <h1 className="font-display text-2xl font-semibold text-text-primary">
                  Study Library
                </h1>
                <div className="max-w-xs mt-2">
                  <OrnamentalDivider variant="flourish" />
                </div>
              </div>

              {/* Ingestion Dropzone */}
              <UploadDropzone
                folderId={selectedFolderId}
                onOpenGoogleSync={() => setIsGoogleSyncOpen(true)}
              />

              {/* Note Library List */}
              <NoteList
                onOpenViewer={handleOpenViewerFromLibrary}
                selectedFolderId={selectedFolderId}
                onClearFolderFilter={() => setSelectedFolderId(null)}
                onOpenStudyDesk={(scope) => {
                  setChatScope(scope);
                  setActiveTab("chat");
                }}
              />
            </div>
          </main>
        ) : (
          /* Center reading / study area: Chat */
          <main className="flex-1 overflow-hidden">
            <ChatPanel
              activeChatId={activeChatId}
              onSelectChat={setActiveChatId}
              onCitationClick={handleCitationClick}
              scope={chatScope}
              onScopeChange={setChatScope}
            />
          </main>
        )}
      </div>

      {/* Right panel: Split-Screen Source Verification Viewer */}
      {isViewerOpen && (
        <div className="w-[45vw] min-w-[360px] max-w-[750px] h-full shrink-0">
          <SplitScreenViewerPanel
            citation={activeViewerCitation}
            noteId={activeViewerNoteId}
            noteTitle={activeViewerNoteTitle}
            onClose={handleCloseViewer}
          />
        </div>
      )}

      {/* AI Provider & API Key BYOK Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Google Drive & Classroom Cloud Sync Modal */}
      <GoogleImportModal
        isOpen={isGoogleSyncOpen}
        onClose={() => setIsGoogleSyncOpen(false)}
        defaultFolderId={selectedFolderId}
      />

      {/* Global Search & Command Palette Modal (Ctrl+K / Cmd+K) */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onOpenViewer={handleOpenViewerFromLibrary}
        onOpenStudyDesk={(scope) => {
          setChatScope(scope);
          setActiveTab("chat");
        }}
        onOpenUpload={() => {
          setActiveTab("library");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}
