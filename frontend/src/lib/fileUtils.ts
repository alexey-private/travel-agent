export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const BINARY_MIME_TYPES = ["application/pdf"];
const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json"];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isTextFile(file: File): boolean {
  return file.type.startsWith("text/") || TEXT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

export function isBinaryAttachment(file: File): boolean {
  return file.type.startsWith("image/") || BINARY_MIME_TYPES.includes(file.type);
}

export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
