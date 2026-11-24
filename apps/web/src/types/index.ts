/**
 * Shared TypeScript types used across multiple features.
 *
 * These mirror the backend Pydantic response shapes.
 * Defined once here and imported everywhere (see code-standards.md).
 */

export interface UserInfo {
  id: string;
  clerk_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Folder {
  id: string;
  owner_id: string;
  name: string;
  parent_id: string | null;
  note_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  owner_id: string;
  folder_id: string | null;
  title: string;
  file_type: string;
  file_path: string;
  subject: string | null;
  topic: string | null;
  tags: string | null;
  summary: string | null;
  status: "pending" | "processing" | "ready" | "failed";
  page_count: number;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  id: string;
  message_id?: string;
  chunk_id: string;
  page_id: string;
  note_id?: string;
  page_number?: number;
  note_title?: string;
  page_image_path?: string | null;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  snippet: string;
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  created_at: string;
}

export interface Chat {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface CheatSheet {
  note_id?: string | null;
  title: string;
  subject: string;
  markdown: string;
  source_note_titles?: string[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  page_reference?: number | null;
  source_note_title?: string | null;
}

export interface Quiz {
  note_id?: string | null;
  note_title: string;
  questions: QuizQuestion[];
  source_note_titles?: string[];
}

export type StudyScope =
  | { type: "all" }
  | { type: "folder"; folderId: string; folderName: string }
  | { type: "notes"; noteIds: string[]; noteTitles: string[] };

export type AnswerMode = "hybrid" | "notes_only" | "ai_only";

export type LLMProvider = "gemini" | "openai" | "anthropic";

export interface LLMSettings {
  active_provider: LLMProvider;
  active_model: string | null;
  has_gemini_key: boolean;
  has_openai_key: boolean;
  has_anthropic_key: boolean;
  masked_key: string | null;
}

export interface TestConnectionResult {
  success: boolean;
  provider: string;
  model?: string | null;
  message?: string | null;
  reply?: string | null;
  error?: string | null;
}

export interface ShareLinkResponse {
  share_token: string;
  share_url: string;
  resource_type: "note" | "chat" | "folder";
  resource_id: string;
  created_at: string;
}

export interface SharedResource {
  resource_type: "note" | "chat" | "folder";
  resource_id: string;
  title: string;
  subject?: string | null;
  creator_name?: string | null;
  note?: Note | null;
  pages: {
    id: string;
    note_id: string;
    page_number: number;
    image_path?: string | null;
    text_content?: string | null;
  }[];
  chat_messages: ChatMessage[];
  created_at: string;
}

export interface GoogleConnectionStatus {
  is_connected: boolean;
  email?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  drive_available: boolean;
  classroom_available: boolean;
  error?: string | null;
}

export interface GoogleDriveItem {
  id: string;
  name: string;
  mime_type: string;
  is_folder: boolean;
  size_bytes?: number | null;
  modified_time?: string | null;
  icon_url?: string | null;
  web_view_link?: string | null;
  parent_id?: string | null;
}

export interface GoogleDriveBrowseResponse {
  folder_id: string;
  folder_name?: string | null;
  parent_id?: string | null;
  items: GoogleDriveItem[];
  next_page_token?: string | null;
}

export interface GoogleClassroomCourse {
  id: string;
  name: string;
  section?: string | null;
  description?: string | null;
  alternate_link?: string | null;
}

export interface GoogleClassroomMaterial {
  id: string;
  course_id: string;
  course_name: string;
  title: string;
  description?: string | null;
  file_id: string;
  file_name: string;
  mime_type: string;
  size_bytes?: number | null;
  alternate_link?: string | null;
}

export interface GoogleImportItem {
  file_id: string;
  file_name: string;
  mime_type: string;
  source: "drive" | "classroom";
  course_name?: string | null;
}

export interface GoogleImportRequest {
  items: GoogleImportItem[];
  folder_id?: string | null;
  access_token?: string | null;
  create_subfolder?: boolean;
  subfolder_name?: string | null;
}

export interface GoogleImportResponse {
  imported_count: number;
  notes: Note[];
  message: string;
}

export interface SearchMatchSnippet {
  page_number: number;
  snippet: string;
  chunk_id: string;
}

export interface SearchNoteResult {
  note_id: string;
  title: string;
  subject: string | null;
  topic: string | null;
  file_type: string;
  page_count: number;
  match_type: "title" | "subject" | "content";
  snippets: SearchMatchSnippet[];
}

export interface GlobalSearchResponse {
  query: string;
  results: SearchNoteResult[];
  total_matches: number;
}
