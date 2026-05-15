export function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

export function joinPath(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot !== -1 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isTextFile(name: string): boolean {
  return [
    "txt", "md", "js", "ts", "tsx", "jsx", "json", "html", "css", "sh", "py",
    "java", "go", "rs", "yml", "yaml", "toml", "ini", "cfg", "conf", "log",
    "env", "xml", "sql", "csv", "bak"
  ].includes(fileExtension(name));
}

export function isVideoFile(name: string): boolean {
  return ["mp4", "mkv", "avi", "mov", "webm"].includes(fileExtension(name));
}

export function isImageFile(name: string): boolean {
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(fileExtension(name));
}

export function tsToStr(ts: number): string {
  return new Date(ts * 1000).toLocaleString("uk-UA");
}
