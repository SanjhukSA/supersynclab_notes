import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckSquare,
  ChevronRight,
  ExternalLink,
  Folder as FolderIcon,
  GraduationCap,
  HardDrive,
  Key,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Square,
  X,
} from "lucide-react";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";
import {
  getStoredGoogleToken,
  setStoredGoogleToken,
  useBrowseGoogleDrive,
  useGoogleClassroomCourses,
  useGoogleClassroomMaterials,
  useGoogleStatus,
  useImportGoogleMaterials,
} from "./useGoogleSync";
import { useFolders } from "@/features/folders/useFolders";
import type { GoogleDriveItem, GoogleImportItem } from "@/types";

interface GoogleImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFolderId?: string | null;
}

interface Breadcrumb {
  id: string;
  name: string;
}

export function GoogleImportModal({
  isOpen,
  onClose,
  defaultFolderId,
}: GoogleImportModalProps) {
  const [googleToken, setGoogleToken] = useState<string | null>(getStoredGoogleToken());
  const [manualTokenInput, setManualTokenInput] = useState("");
  const [customClientId, setCustomClientId] = useState<string>(
    () => (typeof window !== "undefined" ? localStorage.getItem("supernotes_google_client_id") || "" : "")
  );
  const [showClientIdConfig, setShowClientIdConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<"drive" | "classroom">("drive");

  // Navigation & Search State
  const [currentFolderId, setCurrentFolderId] = useState<string>("root");
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
    { id: "root", name: "My Drive" },
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Target SuperNotes Folder State
  const [targetFolderId, setTargetFolderId] = useState<string | null>(
    defaultFolderId || null
  );
  const [createSubfolder, setCreateSubfolder] = useState(false);

  // Selection & Feedback
  const [selectedItems, setSelectedItems] = useState<GoogleImportItem[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync token from localStorage
  useEffect(() => {
    if (isOpen) {
      setGoogleToken(getStoredGoogleToken());
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  // Status check with Google
  const {
    data: statusData,
    isLoading: isCheckingStatus,
    refetch: refetchStatus,
  } = useGoogleStatus(googleToken);

  // Real Google Drive Query
  const {
    data: driveData,
    isLoading: isLoadingDrive,
    refetch: refetchDrive,
  } = useBrowseGoogleDrive(currentFolderId, debouncedSearch, googleToken);

  // Real Google Classroom Queries
  const { data: courses = [], isLoading: isLoadingCourses } =
    useGoogleClassroomCourses(googleToken);

  useEffect(() => {
    if (courses.length > 0 && !selectedCourseId) {
      const firstCourse = courses[0];
      if (firstCourse) {
        setSelectedCourseId(firstCourse.id);
      }
    }
  }, [courses, selectedCourseId]);

  const { data: materials = [], isLoading: isLoadingMaterials } =
    useGoogleClassroomMaterials(selectedCourseId, googleToken);

  const { data: folders = [] } = useFolders();
  const importMutation = useImportGoogleMaterials();

  if (!isOpen) return null;

  const isConnected = Boolean(statusData?.is_connected && googleToken);

  // Connect via GIS / OAuth Popup
  const handleGoogleOAuthConnect = () => {
    try {
      const envObj = (import.meta as unknown as { env?: Record<string, string> }).env;
      const storedClientId = typeof window !== "undefined" ? localStorage.getItem("supernotes_google_client_id") || "" : "";
      const clientId = (customClientId.trim() || storedClientId || envObj?.VITE_GOOGLE_CLIENT_ID || "").trim();

      if (!clientId) {
        setErrorMessage(
          "Please configure a valid Google Cloud Client ID below, or connect instantly using an Access Token from Google OAuth Playground."
        );
        setShowClientIdConfig(true);
        return;
      }

      // Dynamically load Google Identity Services if not already present
      const scriptId = "google-gis-client";
      const initClient = () => {
        const google = (window as any).google;
        if (!google?.accounts?.oauth2) {
          setErrorMessage("Google Identity Services library failed to load.");
          return;
        }

        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope:
            "https://www.googleapis.com/auth/drive.readonly " +
            "https://www.googleapis.com/auth/classroom.courses.readonly " +
            "https://www.googleapis.com/auth/classroom.coursework.materials.readonly",
          callback: (response: any) => {
            if (response.access_token) {
              setStoredGoogleToken(response.access_token);
              setGoogleToken(response.access_token);
              setErrorMessage(null);
              refetchStatus();
            } else if (response.error) {
              setErrorMessage(`Google sign-in error: ${response.error}`);
            }
          },
        });
        client.requestAccessToken();
      };

      if ((window as any).google?.accounts?.oauth2) {
        initClient();
      } else {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = initClient;
        script.onerror = () => {
          setErrorMessage("Failed to load Google Identity Services script.");
        };
        document.body.appendChild(script);
      }
    } catch (e: any) {
      setErrorMessage(e?.message || "Could not start Google authentication.");
    }
  };

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTokenInput.trim()) return;
    const token = manualTokenInput.trim();
    setStoredGoogleToken(token);
    setGoogleToken(token);
    setManualTokenInput("");
    setErrorMessage(null);
    refetchStatus();
  };

  const handleDisconnect = () => {
    setStoredGoogleToken(null);
    setGoogleToken(null);
    setSelectedItems([]);
    setCurrentFolderId("root");
    setBreadcrumbs([{ id: "root", name: "My Drive" }]);
  };

  // Folder navigation
  const handleEnterFolder = (folder: GoogleDriveItem) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery("");
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = breadcrumbs[index];
    if (!target) return;
    setCurrentFolderId(target.id);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSearchQuery("");
  };

  const handleNavigateUp = () => {
    if (breadcrumbs.length <= 1) return;
    const newBreadcrumbs = breadcrumbs.slice(0, -1);
    const parent = newBreadcrumbs[newBreadcrumbs.length - 1];
    if (!parent) return;
    setCurrentFolderId(parent.id);
    setBreadcrumbs(newBreadcrumbs);
    setSearchQuery("");
  };

  // Item selection
  const isItemSelected = (fileId: string) =>
    selectedItems.some((i) => i.file_id === fileId);

  const toggleItem = (item: GoogleImportItem) => {
    setSelectedItems((prev) => {
      const exists = prev.some((i) => i.file_id === item.file_id);
      return exists
        ? prev.filter((i) => i.file_id !== item.file_id)
        : [...prev, item];
    });
  };

  // Select all non-folder files currently displayed in this folder
  const handleSelectAllInCurrentFolder = () => {
    if (!driveData?.items) return;
    const filesToImport: GoogleImportItem[] = driveData.items
      .filter((i) => !i.is_folder)
      .map((i) => ({
        file_id: i.id,
        file_name: i.name,
        mime_type: i.mime_type,
        source: "drive",
      }));

    if (filesToImport.length === 0) return;

    setSelectedItems((prev) => {
      const allSelected = filesToImport.every((f) =>
        prev.some((p) => p.file_id === f.file_id)
      );
      if (allSelected) {
        // Deselect current folder files
        return prev.filter(
          (p) => !filesToImport.some((f) => f.file_id === p.file_id)
        );
      }
      // Add missing files
      const newItems = [...prev];
      filesToImport.forEach((f) => {
        if (!newItems.some((p) => p.file_id === f.file_id)) {
          newItems.push(f);
        }
      });
      return newItems;
    });
  };

  const handleImport = async () => {
    if (selectedItems.length === 0 || !googleToken) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const lastCrumb =
      breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 1] : undefined;
    const subfolderName = createSubfolder && lastCrumb ? lastCrumb.name : undefined;

    try {
      const res = await importMutation.mutateAsync({
        items: selectedItems,
        folderId: targetFolderId,
        accessToken: googleToken,
        createSubfolder,
        subfolderName,
      });

      setSuccessMessage(res.message);
      setSelectedItems([]);
      setTimeout(() => {
        onClose();
      }, 2200);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to download and import notes.");
    }
  };

  const currentFolderName =
    breadcrumbs.length > 0
      ? (breadcrumbs[breadcrumbs.length - 1]?.name ?? "My Drive")
      : "My Drive";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="relative flex flex-col w-full max-w-4xl h-[85vh] max-h-[820px] rounded-xl border border-border bg-bg-surface p-6 shadow-2xl">
        <CornerFlourish size={16} />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-highlight/10 text-accent-highlight">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-medium text-text-primary">
                  Google Drive & Classroom Sync
                </span>
                {isConnected && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted">
                Browse your original lecture notes, PDFs, and slide decks from your real Google account.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Not Connected View */}
        {!isConnected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center overflow-y-auto">
            {isCheckingStatus ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
                <p className="text-sm text-text-muted">Verifying Google connection…</p>
              </div>
            ) : (
              <div className="max-w-xl w-full space-y-5">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary shadow-inner">
                  <HardDrive className="h-7 w-7" />
                </div>

                <div>
                  <h3 className="font-display text-xl font-medium text-text-primary">
                    Connect Your Real Google Drive
                  </h3>
                  <p className="mt-1 text-xs text-text-muted leading-relaxed max-w-md mx-auto">
                    Browse your actual Google Drive folders, open subdirectories, and select your original lecture slides, PDFs, and assignments for intake.
                  </p>
                </div>

                {errorMessage && (
                  <div className="flex items-start gap-2 rounded-lg border border-state-error/30 bg-state-error/10 p-3 text-left text-xs text-state-error">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Primary Method: Instant Token Connect via Google OAuth Playground */}
                <div className="rounded-xl border border-accent-primary/40 bg-accent-primary/5 p-5 text-left space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary text-[11px] font-bold text-bg-base">1</span>
                        <h4 className="text-sm font-semibold text-text-primary">
                          Instant Access via Google OAuth Playground
                        </h4>
                      </div>
                      <p className="text-xs text-text-muted mt-1">
                        Zero setup required. Works for any personal or university Google account in 15 seconds.
                      </p>
                    </div>

                    <a
                      href="https://developers.google.com/oauthplayground/#step1&apisSelect=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.readonly"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-accent-primary/60 bg-bg-surface px-3 py-1.5 text-xs font-medium text-accent-primary hover:bg-accent-primary/10 transition-colors shrink-0 shadow-xs cursor-pointer"
                    >
                      <span>Open Google Playground</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  {/* Step by step callout */}
                  <div className="rounded-lg border border-border/80 bg-bg-surface/80 p-3 text-xs space-y-1.5 text-text-muted">
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-accent-highlight font-bold">1.</span>
                      <span>Click <strong>Open Google Playground</strong> above (Drive scope is pre-selected).</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-accent-highlight font-bold">2.</span>
                      <span>Click the blue <strong>Authorize APIs</strong> button and choose your Google account.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-accent-highlight font-bold">3.</span>
                      <span>Click <strong>Exchange authorization code for tokens</strong>, copy the <strong>Access token</strong> (starts with <code>ya29.</code>), and paste it below:</span>
                    </div>
                  </div>

                  {/* Token input form */}
                  <form onSubmit={handleManualTokenSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-muted" />
                      <input
                        type="password"
                        placeholder="Paste your Access token here (ya29.a0...)"
                        value={manualTokenInput}
                        onChange={(e) => setManualTokenInput(e.target.value)}
                        className="w-full rounded-lg border border-border bg-bg-surface pl-9 pr-3 py-2 text-xs text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!manualTokenInput.trim()}
                      className="flex items-center gap-1.5 rounded-lg border border-accent-primary bg-accent-primary px-4 py-2 text-xs font-semibold text-bg-base hover:bg-accent-secondary disabled:opacity-50 cursor-pointer transition-colors shadow-xs"
                    >
                      <span>Connect & Open Drive</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>

                {/* Secondary Option: 1-Click Google Sign-In with Custom Client ID */}
                <div className="rounded-xl border border-border bg-bg-raised/40 p-4 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-border text-[11px] font-bold text-text-muted">2</span>
                      <span className="text-xs font-medium text-text-primary">
                        Have a Google Cloud OAuth Client ID?
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClientIdConfig(!showClientIdConfig)}
                      className="text-xs text-accent-primary hover:underline cursor-pointer"
                    >
                      {showClientIdConfig ? "Hide Config" : "Configure 1-Click Sign-In"}
                    </button>
                  </div>

                  {showClientIdConfig && (
                    <div className="mt-3 pt-3 border-t border-border space-y-3">
                      <p className="text-[11px] text-text-muted">
                        Enter a Web Client ID created in your Google Cloud Console with authorized origin <code>http://localhost:5173</code> to enable 1-click Google popups.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. 123456789-xxxxxx.apps.googleusercontent.com"
                          value={customClientId}
                          onChange={(e) => setCustomClientId(e.target.value)}
                          className="flex-1 rounded-md border border-border bg-bg-surface px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customClientId.trim()) {
                              localStorage.setItem("supernotes_google_client_id", customClientId.trim());
                              setErrorMessage(null);
                              handleGoogleOAuthConnect();
                            }
                          }}
                          className="rounded-md border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-raised cursor-pointer"
                        >
                          Save & Connect
                        </button>
                      </div>

                      {Boolean(customClientId.trim()) && (
                        <button
                          type="button"
                          onClick={handleGoogleOAuthConnect}
                          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-bg-surface px-4 py-2 text-xs font-medium text-text-primary hover:bg-bg-raised transition-colors cursor-pointer"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24">
                            <path
                              fill="currentColor"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="currentColor"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="currentColor"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                            />
                            <path
                              fill="currentColor"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                            />
                          </svg>
                          <span>1-Click Sign In with Google</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Connected Explorer View */
          <div className="flex flex-1 flex-col overflow-hidden pt-4 gap-3">
            {/* Top Bar: Connected User + Mode Tabs + Disconnect */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("drive")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                    activeTab === "drive"
                      ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                      : "border-transparent text-text-muted hover:text-text-primary"
                  }`}
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>Google Drive</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("classroom")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                    activeTab === "classroom"
                      ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                      : "border-transparent text-text-muted hover:text-text-primary"
                  }`}
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>Google Classroom</span>
                </button>
              </div>

              {/* User Account Pill & Disconnect */}
              <div className="flex items-center gap-2">
                {statusData?.avatar_url ? (
                  <img
                    src={statusData.avatar_url}
                    alt="Google Profile"
                    className="h-5 w-5 rounded-full border border-border"
                  />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary/20 text-[10px] font-bold text-accent-primary">
                    G
                  </div>
                )}
                <span className="text-xs font-mono text-text-muted">
                  {statusData?.email || statusData?.display_name || "Connected"}
                </span>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  title="Disconnect Google account"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-muted hover:bg-state-error/10 hover:text-state-error transition-colors cursor-pointer"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>

            {/* Target SuperNotes Folder Config */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg-raised/50 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <FolderIcon className="h-4 w-4 text-accent-highlight" />
                <span className="text-text-muted">Import into Folder:</span>
                <select
                  value={targetFolderId || "none"}
                  onChange={(e) =>
                    setTargetFolderId(e.target.value === "none" ? null : e.target.value)
                  }
                  className="rounded-md border border-border bg-bg-surface px-2.5 py-1 text-xs text-text-primary focus:outline-none"
                >
                  <option value="none">Unfiled (Library Root)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {activeTab === "drive" && currentFolderId !== "root" && (
                <label className="flex items-center gap-2 cursor-pointer text-text-muted hover:text-text-primary select-none">
                  <input
                    type="checkbox"
                    checked={createSubfolder}
                    onChange={(e) => setCreateSubfolder(e.target.checked)}
                    className="rounded border-border text-accent-primary focus:ring-0"
                  />
                  <span>
                    Auto-create subfolder <strong>"{currentFolderName}"</strong>
                  </span>
                </label>
              )}
            </div>

            {/* TAB CONTENT: GOOGLE DRIVE */}
            {activeTab === "drive" && (
              <div className="flex flex-1 flex-col overflow-hidden gap-2">
                {/* Search & Breadcrumb Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Breadcrumb path */}
                  <div className="flex items-center gap-1 overflow-x-auto py-1 text-xs text-text-muted">
                    {breadcrumbs.length > 1 && (
                      <button
                        type="button"
                        onClick={handleNavigateUp}
                        className="flex items-center gap-1 rounded-md border border-border bg-bg-raised px-2 py-1 text-[11px] font-medium text-text-primary hover:bg-bg-surface transition-colors cursor-pointer mr-1"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        <span>Up</span>
                      </button>
                    )}

                    {breadcrumbs.map((bc, idx) => {
                      const isLast = idx === breadcrumbs.length - 1;
                      return (
                        <div key={bc.id} className="flex items-center gap-1 shrink-0">
                          {idx > 0 && <ChevronRight className="h-3 w-3 text-border" />}
                          <button
                            type="button"
                            onClick={() => handleBreadcrumbClick(idx)}
                            className={`rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
                              isLast
                                ? "font-semibold text-text-primary bg-bg-raised"
                                : "text-text-muted hover:text-text-primary hover:underline"
                            }`}
                          >
                            {bc.name}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions & Search */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-text-muted" />
                      <input
                        type="text"
                        placeholder="Search Drive notes…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-48 rounded-md border border-border bg-bg-base pl-8 pr-2.5 py-1 text-xs text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => refetchDrive()}
                      title="Refresh Drive files"
                      className="rounded-md border border-border bg-bg-raised p-1.5 text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>

                    {driveData && driveData.items.some((i) => !i.is_folder) && (
                      <button
                        type="button"
                        onClick={handleSelectAllInCurrentFolder}
                        className="rounded-md border border-border bg-bg-raised px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-bg-surface cursor-pointer"
                      >
                        Select All Notes in Folder
                      </button>
                    )}
                  </div>
                </div>

                {/* Drive Files & Folders List */}
                <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-bg-raised/40">
                  {isLoadingDrive ? (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-accent-primary" />
                      <p className="text-xs">Browsing your Google Drive…</p>
                    </div>
                  ) : !driveData || driveData.items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted text-center p-4">
                      <FolderIcon className="h-8 w-8 text-border mb-2" />
                      <p className="text-sm font-medium text-text-primary">No items found</p>
                      <p className="text-xs mt-1">This folder contains no files or matching search results.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {driveData.items.map((item) => {
                        const selected = isItemSelected(item.id);
                        return (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-3 transition-colors ${
                              item.is_folder
                                ? "hover:bg-bg-raised cursor-pointer"
                                : selected
                                ? "bg-accent-primary/10 border-l-2 border-accent-primary"
                                : "hover:bg-bg-raised/60 cursor-pointer"
                            }`}
                            onClick={() => {
                              if (item.is_folder) {
                                handleEnterFolder(item);
                              } else {
                                toggleItem({
                                  file_id: item.id,
                                  file_name: item.name,
                                  mime_type: item.mime_type,
                                  source: "drive",
                                });
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                              {/* Checkbox (for files) or Folder Icon */}
                              {item.is_folder ? (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-highlight/15 text-accent-highlight">
                                  <FolderIcon className="h-4 w-4" />
                                </div>
                              ) : (
                                <div className="text-text-muted hover:text-accent-primary shrink-0">
                                  {selected ? (
                                    <CheckSquare className="h-4 w-4 text-accent-primary" />
                                  ) : (
                                    <Square className="h-4 w-4" />
                                  )}
                                </div>
                              )}

                              {/* Title & Metadata */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs font-medium truncate ${
                                      item.is_folder
                                        ? "text-text-primary font-semibold hover:underline"
                                        : "text-text-primary"
                                    }`}
                                  >
                                    {item.name}
                                  </span>
                                </div>
                                <p className="text-[10px] text-text-muted font-mono mt-0.5">
                                  {item.is_folder
                                    ? "Google Drive Folder • Click to open"
                                    : `${item.mime_type.split("/").pop()} • ${
                                        item.size_bytes
                                          ? `${(item.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                                          : "Cloud Doc"
                                      }`}
                                </p>
                              </div>
                            </div>

                            {/* Right action button */}
                            <div className="flex items-center gap-2 shrink-0">
                              {item.is_folder ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEnterFolder(item);
                                  }}
                                  className="flex items-center gap-1 rounded-md border border-border bg-bg-surface px-2.5 py-1 text-xs text-text-primary hover:bg-bg-raised transition-colors cursor-pointer"
                                >
                                  <span>Open Folder</span>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <>
                                  {item.web_view_link && (
                                    <a
                                      href={item.web_view_link}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      title="Open in Google Drive"
                                      className="rounded p-1 text-text-muted hover:text-text-primary cursor-pointer"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                  <span
                                    className={`rounded px-2 py-0.5 text-[10px] font-mono ${
                                      selected
                                        ? "bg-accent-primary/20 text-accent-primary font-medium"
                                        : "bg-bg-surface text-text-muted"
                                    }`}
                                  >
                                    {selected ? "Selected" : "Click to select"}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: GOOGLE CLASSROOM */}
            {activeTab === "classroom" && (
              <div className="flex flex-1 flex-col overflow-hidden gap-3">
                {/* Course selector tabs */}
                {isLoadingCourses ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
                    <span>Loading your enrolled Classroom courses…</span>
                  </div>
                ) : courses.length === 0 ? (
                  <div className="p-4 text-center rounded-lg border border-border bg-bg-raised/40 text-xs text-text-muted">
                    No active Google Classroom courses found for this account.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {courses.map((course) => (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => setSelectedCourseId(course.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 border transition-colors cursor-pointer ${
                          selectedCourseId === course.id
                            ? "border-accent-primary bg-accent-primary/10 text-accent-primary font-semibold"
                            : "border-border bg-bg-raised text-text-muted hover:text-text-primary"
                        }`}
                      >
                        {course.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Course Materials List */}
                <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-bg-raised/40">
                  {isLoadingMaterials ? (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-accent-primary" />
                      <p className="text-xs">Loading course materials & assignments…</p>
                    </div>
                  ) : materials.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted text-center p-4">
                      <GraduationCap className="h-8 w-8 text-border mb-2" />
                      <p className="text-sm font-medium text-text-primary">No coursework attachments</p>
                      <p className="text-xs mt-1">This course has no attached PDF materials or assignments posted.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {materials.map((mat) => {
                        const selected = isItemSelected(mat.file_id);
                        return (
                          <div
                            key={mat.id}
                            onClick={() =>
                              toggleItem({
                                file_id: mat.file_id,
                                file_name: mat.file_name,
                                mime_type: mat.mime_type,
                                source: "classroom",
                                course_name: mat.course_name,
                              })
                            }
                            className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                              selected
                                ? "bg-accent-primary/10 border-l-2 border-accent-primary"
                                : "hover:bg-bg-raised"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-4">
                              <div className="text-text-muted hover:text-accent-primary shrink-0">
                                {selected ? (
                                  <CheckSquare className="h-4 w-4 text-accent-primary" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-text-primary truncate">
                                  {mat.title}
                                </p>
                                <p className="text-[10px] text-text-muted font-mono mt-0.5">
                                  {mat.file_name} • Attached Drive Note
                                </p>
                              </div>
                            </div>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-mono shrink-0 ${
                                selected
                                  ? "bg-accent-primary/20 text-accent-primary font-medium"
                                  : "bg-bg-surface text-text-muted"
                              }`}
                            >
                              {selected ? "Selected" : "Click to select"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error & Success Feedback */}
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-state-error/30 bg-state-error/10 p-2.5 text-xs text-state-error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400">
                <Check className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-text-muted font-mono">
                {selectedItems.length === 0
                  ? "No notes selected"
                  : `${selectedItems.length} original note${
                      selectedItems.length > 1 ? "s" : ""
                    } selected`}
              </span>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-medium text-text-muted hover:bg-bg-raised hover:text-text-primary transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleImport}
                  disabled={selectedItems.length === 0 || importMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-accent-primary bg-accent-primary px-4 py-1.5 text-xs font-medium text-bg-base transition-all hover:bg-accent-secondary disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Downloading from Drive…</span>
                    </>
                  ) : (
                    <>
                      <HardDrive className="h-3.5 w-3.5" />
                      <span>
                        Import {selectedItems.length > 0 ? selectedItems.length : ""}{" "}
                        Original Notes
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
