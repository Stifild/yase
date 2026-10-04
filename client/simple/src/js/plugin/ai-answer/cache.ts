// SPDX-License-Identifier: AGPL-3.0-or-later

import type { TierKey } from "./models.ts";

/**
 * A small per-browser cache of generated answers. It never leaves the
 * browser: nothing is sent to the server.
 */

export type CachedAnswer = {
  key: string;
  /** raw model output, rendered again on every show */
  text: string;
  tier: TierKey;
  /** ms since epoch */
  at: number;
};

const STORAGE_KEY = "aiAnswer.cache";
const MAX_ENTRIES = 20;
const MAX_AGE = 24 * 60 * 60 * 1000;

// two polynomial hashes with different moduli: enough to tell two queries apart
const hash = (input: string): string => {
  let h1 = 7;
  let h2 = 11;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = (h1 * 131 + code) % 1_000_000_007;
    h2 = (h2 * 137 + code) % 998_244_353;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
};

/**
 * The answer cites sources by number, so it is only valid for the same query
 * *and* the same list of sources in the same order.
 */
export const cacheKey = (query: string, urls: string[]): string =>
  hash(`${query.trim().toLowerCase()}\n${urls.join("\n")}`);

const isEntry = (value: unknown): value is CachedAnswer => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.key === "string" &&
    typeof entry.text === "string" &&
    (entry.tier === "basic" || entry.tier === "full") &&
    typeof entry.at === "number"
  );
};

const read = (): CachedAnswer[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((entry): entry is CachedAnswer => isEntry(entry) && now - entry.at < MAX_AGE);
  } catch {
    // storage may be blocked or hold garbage
    return [];
  }
};

export const loadAnswer = (key: string): CachedAnswer | undefined => read().find((entry) => entry.key === key);

/** Stores an answer; the oldest ones beyond the limit are dropped. */
export const saveAnswer = (key: string, text: string, tier: TierKey): void => {
  const entries = [{ key: key, text: text, tier: tier, at: Date.now() }, ...read().filter((e) => e.key !== key)];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // storage may be blocked or full, the answer just won't be cached
  }
};
