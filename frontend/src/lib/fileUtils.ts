import type { Locale } from "@/i18n/config";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const BINARY_MIME_TYPES = ["application/pdf"];
const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json"];

/**
 * Human-readable attachment size.
 *
 * Intl.NumberFormat with a unit style carries both the separator and the unit
 * label, so Russian gets "3,3 МБ" without a hand-written table per language.
 * Where a language has no abbreviation of its own — Hebrew writes kB and MB in
 * Latin — CLDR leaves the Latin one, which is the right answer for that reader.
 */
export function formatBytes(bytes: number, locale: Locale): string {
  if (bytes < 1024) {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "byte",
      unitDisplay: "short",
    }).format(bytes);
  }
  if (bytes < 1024 * 1024) {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "kilobyte",
      unitDisplay: "short",
      maximumFractionDigits: 0,
    }).format(bytes / 1024);
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024));
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
