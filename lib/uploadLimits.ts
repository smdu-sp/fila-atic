// Limits shared by the server (lib/uploads.ts) and the forms, which cannot
// import that file because it reads the disk.
export const MAX_UPLOAD_FILES = 3;
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
