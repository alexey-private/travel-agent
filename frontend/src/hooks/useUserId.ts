"use client";

import { useSyncExternalStore } from "react";
import { getOrCreateUserId } from "@/lib/api";

/** The id is fixed for the lifetime of a browser profile, so nothing to watch. */
const subscribe = () => () => {};

/** localStorage is unreachable on the server, so the first paint gets null. */
const serverSnapshot = () => null;

/**
 * The session id kept in localStorage.
 *
 * Read through an external store rather than an effect that calls setState:
 * the id genuinely lives outside React, and this keeps the server snapshot and
 * the client snapshot in one place instead of re-rendering once after mount.
 */
export function useUserId(): string | null {
  return useSyncExternalStore(subscribe, getOrCreateUserId, serverSnapshot);
}
