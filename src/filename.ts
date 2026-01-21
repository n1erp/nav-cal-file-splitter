export function sanitizeFileName(name: string): string {
  // Replace invalid filename characters and trim whitespace
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeFileName(
  type: string,
  id: string,
  name: string,
  extension: string = "txt"
): string {
  const safeName = sanitizeFileName(name || "Unnamed");
  const ext = (extension || "txt").replace(/^\./, "").toLowerCase();
  return `${type}_${id}_${safeName}.${ext}`;
}
