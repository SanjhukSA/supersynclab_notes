import React, { useRef, useState } from "react";
import { UploadCloud, FileText, Loader2, AlertCircle, Cloud } from "lucide-react";
import { useUploadNote } from "./useNotes";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";

interface UploadDropzoneProps {
  folderId?: string | null;
  onOpenGoogleSync?: () => void;
}

export function UploadDropzone({
  folderId,
  onOpenGoogleSync,
}: UploadDropzoneProps = {}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: uploadNote, isPending } = useUploadNote();

  const handleFile = (file: File) => {
    setErrorMessage(null);

    // Basic extension check
    const validExtensions = [
      ".pdf",
      ".docx",
      ".pptx",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".txt",
    ];
    const hasValidExt = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext),
    );

    if (!hasValidExt) {
      setErrorMessage(
        "Supported formats: PDF, DOCX, PPTX, PNG, JPG, WEBP, or TXT notes only.",
      );
      return;
    }

    const isPptx = file.name.toLowerCase().endsWith(".pptx");
    const maxSizeBytes = (isPptx ? 35 : 25) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setErrorMessage(
        `File is too large. Maximum size is ${isPptx ? "35MB" : "25MB"}.`,
      );
      return;
    }

    uploadNote(
      { file, folderId },
      {
        onError: (err) => {
          setErrorMessage(err.message);
        },
      },
    );
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file) handleFile(file);
    }
    // reset input so the same file can be re-selected if desired
    e.target.value = "";
  };

  return (
    <div className="w-full">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !isPending && fileInputRef.current?.click()}
        className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all ${
          isDragOver
            ? "border-accent-primary bg-bg-raised/70 scale-[1.01]"
            : "border-border bg-bg-surface/50 hover:border-accent-primary/60 hover:bg-bg-raised/30"
        } ${isPending ? "pointer-events-none opacity-70" : ""}`}
      >
        <CornerFlourish size={12} />
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.txt"
          onChange={onFileSelect}
          className="hidden"
          disabled={isPending}
        />

        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bg-raised text-accent-primary transition-transform group-hover:scale-105">
          {isPending ? (
            <Loader2 className="h-6 w-6 animate-spin text-accent-primary" />
          ) : (
            <UploadCloud className="h-6 w-6" />
          )}
        </div>

        <h3 className="font-display text-lg font-medium text-text-primary">
          {isPending ? "Uploading study note…" : "Drop your lecture notes or slides here"}
        </h3>

        <p className="mt-1 text-xs text-text-muted">
          PDFs, Word docs (.docx), PowerPoint slides (.pptx), or handwritten notebook snaps
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs font-medium">
          <div className="flex items-center gap-1.5 text-accent-primary hover:underline">
            <FileText className="h-4 w-4" />
            <span>Click to browse from your device</span>
          </div>
          {onOpenGoogleSync && (
            <>
              <span className="text-text-muted">•</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenGoogleSync();
                }}
                className="flex items-center gap-1.5 text-accent-highlight hover:underline cursor-pointer"
              >
                <Cloud className="h-4 w-4" />
                <span>Import from Google Drive / Classroom</span>
              </button>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-state-error/30 bg-state-error/10 px-3 py-2 text-xs text-state-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
