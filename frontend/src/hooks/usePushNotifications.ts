"use client";

import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";

export type PushStatus =
  | "unsupported"
  | "denied"
  | "subscribed"
  | "unsubscribed"
  | "subscribing";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function usePushNotifications(userId: string | null) {
  const [status, setStatus] = useState<PushStatus>("unsubscribed");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Register SW and check existing subscription on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // navigator and Notification.permission are unreachable during SSR, so
      // browser capability can only be read after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        setRegistration(reg);
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setStatus("subscribed");
        } else {
          setStatus(Notification.permission === "denied" ? "denied" : "unsubscribed");
        }
      })
      .catch((err) => {
        console.error("[push] SW registration failed:", err);
        setStatus("unsupported");
      });
  }, []);

  const subscribe = useCallback(async () => {
    if (!registration || !userId) return;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.error("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus("denied");
      return;
    }

    setStatus("subscribing");
    try {
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      });

      const json = sub.toJSON();
      await fetch(`${API_URL}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
      });

      setStatus("subscribed");
    } catch (err) {
      console.error("[push] Subscribe failed:", err);
      setStatus("unsubscribed");
    }
  }, [registration, userId]);

  const unsubscribe = useCallback(async () => {
    if (!registration || !userId) return;

    try {
      const sub = await registration.pushManager.getSubscription();
      if (!sub) {
        setStatus("unsubscribed");
        return;
      }

      await fetch(`${API_URL}/api/push/unsubscribe`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, endpoint: sub.endpoint }),
      });

      await sub.unsubscribe();
      setStatus("unsubscribed");
    } catch (err) {
      console.error("[push] Unsubscribe failed:", err);
    }
  }, [registration, userId]);

  return { status, subscribe, unsubscribe };
}
