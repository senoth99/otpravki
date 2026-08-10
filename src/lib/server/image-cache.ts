const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export function getImageContentType(filePath: string): string {
  const ext = filePath.includes(".") ? `.${filePath.split(".").pop()!.toLowerCase()}` : "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
