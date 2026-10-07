// Client-side mirror of backend/app/core/config.py's allowed_upload_types —
// purely a fast, friendly UX check (correct extension, correct error message
// before even hitting the network). The backend re-validates extension AND
// declared MIME type independently and is the only authoritative check.
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
  ".txt",
  ".doc",
  ".docx",
  ".zip",
];

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export function isImageAttachment(filename: string, mimeType?: string | null): boolean {
  if (mimeType) return mimeType.startsWith("image/");
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function validateFileForUpload(file: File): string | null {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "File is too large. Maximum size is 10 MB.";
  }
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
    return "This file type isn't supported.";
  }
  return null;
}
