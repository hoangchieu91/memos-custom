/**
 * useMemosStore — generic key-value store backed by Memos API.
 *
 * Uses a single system memo tagged `#_store/<key>` as a JSON envelope.
 * Falls back to localStorage when the API is unavailable.
 */

import { useState, useEffect, useCallback } from "react";

const MEMOS_API = "http://10.25.7.212:5230/api/v1";
const TOKEN = localStorage.getItem("memos_pat") || "";
const STORE_TAG_PREFIX = "#_store/";

async function fetchSystemMemo(key: string): Promise<string | null> {
  try {
    const tag = `${STORE_TAG_PREFIX}${key}`;
    const res = await fetch(`${MEMOS_API}/memos?filter=tag%3D%22${encodeURIComponent(tag)}%22&pageSize=1`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const memo = json.memos?.[0];
    if (!memo) return null;
    // Extract JSON payload from memo content
    const match = memo.content.match(/```json\n([\s\S]+?)\n```/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function upsertSystemMemo(key: string, data: unknown): Promise<void> {
  try {
    const tag = `${STORE_TAG_PREFIX}${key}`;
    const content = `${tag}\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

    // Check if memo exists first
    const res = await fetch(`${MEMOS_API}/memos?filter=tag%3D%22${encodeURIComponent(tag)}%22&pageSize=1`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const json = await res.json();
    const existing = json.memos?.[0];

    if (existing) {
      await fetch(`${MEMOS_API}/${existing.name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ content, updateMask: "content" }),
      });
    } else {
      await fetch(`${MEMOS_API}/memos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ content, visibility: "PRIVATE" }),
      });
    }
  } catch {
    // silent — localStorage fallback will handle persistence
  }
}

/**
 * useMemosStore<T>
 * Drop-in replacement for useState that persists to both localStorage AND Memos API.
 */
export function useMemosStore<T>(key: string, defaultValue: T): [T, (updater: T | ((prev: T) => T)) => void, boolean] {
  const lsKey = `personal_os_${key}`;
  const [data, setData] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const [syncing, setSyncing] = useState(false);

  // On mount: try to fetch from Memos API (server wins over localStorage for initial load)
  useEffect(() => {
    setSyncing(true);
    fetchSystemMemo(key).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setData(parsed);
          localStorage.setItem(lsKey, raw);
        } catch { /**/ }
      }
      setSyncing(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const persist = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setData((prev) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
        const raw = JSON.stringify(next);
        localStorage.setItem(lsKey, raw);
        upsertSystemMemo(key, next); // async fire-and-forget
        return next;
      });
    },
    [key, lsKey],
  );

  return [data, persist, syncing];
}

export default useMemosStore;
