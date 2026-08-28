"use client";

import { useState, useCallback } from "react";
import { type Attachment } from "@/types/agent";
import {
  isTextFile,
  isBinaryAttachment,
  readAsBase64,
  readAsText,
  MAX_FILE_BYTES,
  formatBytes,
} from "@/lib/fileUtils";
import type { TKey } from "@/i18n/dictionaries";
import type { TVars } from "@/i18n/types";

export interface PendingTextFile {
  name: string;
  content: string;
}

export interface UseFileAttachmentsResult {
  attachments: Attachment[];
  textFiles: PendingTextFile[];
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  removeAttachment: (name: string) => void;
  removeTextFile: (name: string) => void;
  clearAll: () => void;
  buildMessageText: (baseText: string) => string;
  buildDisplayLabel: (baseText: string) => string;
}

/**
 * Hooks cannot call useT() on their own behalf here — the translator is passed
 * in by the component that owns the surface, so the alert speaks the same
 * language as the rest of the chat window.
 */
export function useFileAttachments(t: (key: TKey, vars?: TVars) => string): UseFileAttachmentsResult {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [textFiles, setTextFiles] = useState<PendingTextFile[]>([]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        alert(t("errors.fileLarge", { name: file.name, size: formatBytes(file.size) }));
      }
      if (isBinaryAttachment(file)) {
        const base64 = await readAsBase64(file);
        setAttachments((prev) => [...prev, { name: file.name, mimeType: file.type, base64, size: file.size }]);
      } else if (isTextFile(file)) {
        const content = await readAsText(file);
        setTextFiles((prev) => [...prev, { name: file.name, content }]);
      }
    }
  }, [t]);

  const removeAttachment = useCallback((name: string) => {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }, []);

  const removeTextFile = useCallback((name: string) => {
    setTextFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const clearAll = useCallback(() => {
    setAttachments([]);
    setTextFiles([]);
  }, []);

  const buildMessageText = useCallback(
    (baseText: string) => {
      let full = baseText;
      for (const tf of textFiles) {
        full = `[File: ${tf.name}]\n${tf.content}\n---\n${full}`;
      }
      return full;
    },
    [textFiles],
  );

  const buildDisplayLabel = useCallback(
    (baseText: string) =>
      [baseText, ...attachments.map((a) => `📎 ${a.name}`), ...textFiles.map((f) => `📄 ${f.name}`)]
        .filter(Boolean)
        .join("\n"),
    [attachments, textFiles],
  );

  return { attachments, textFiles, handleFileChange, removeAttachment, removeTextFile, clearAll, buildMessageText, buildDisplayLabel };
}
