"use client";

import { useState, useRef, useCallback } from "react";
import { API_URL } from "@/lib/config";
import type { TKey } from "@/i18n/dictionaries";
import type { TVars } from "@/i18n/types";
import type { Locale } from "@/i18n/config";

export type VoiceState = "idle" | "recording" | "transcribing";

/**
 * `locale` is passed to the transcription endpoint as a hint: left to guess,
 * Whisper mis-detects short Hebrew clips and returns them transliterated.
 */
export function useVoiceRecording(
  onTranscribed: (text: string) => void,
  t: (key: TKey, vars?: TVars) => string,
  locale: Locale,
) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    if (voiceState !== "idle") return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert(t("errors.microphoneDenied"));
      return;
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());

      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });

      setVoiceState("transcribing");
      try {
        const base64 = await blobToBase64(blob);
        const res = await fetch(`${API_URL}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64, mimeType, language: locale }),
        });
        if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
        const { text } = (await res.json()) as { text: string };
        if (text) onTranscribed(text);
      } catch (err) {
        console.error("[voice]", err);
      } finally {
        setVoiceState("idle");
      }
    };

    recorder.start();
    recorderRef.current = recorder;
    setVoiceState("recording");
  }, [voiceState, onTranscribed, t, locale]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const toggleRecording = useCallback(() => {
    if (voiceState === "idle") void startRecording();
    else if (voiceState === "recording") stopRecording();
  }, [voiceState, startRecording, stopRecording]);

  return { voiceState, toggleRecording };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
