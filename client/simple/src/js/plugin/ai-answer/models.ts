// SPDX-License-Identifier: AGPL-3.0-or-later

export type TierKey = "basic" | "full";

export type Tier = {
  /** Hugging Face model id (ONNX build for transformers.js) */
  model: string;
  /** ONNX weights precision */
  dtype: "q4" | "q4f16";
  /** approximate download size, shown to the user before the click */
  size: string;
  /** small model: answers are noticeably less reliable, warn the user */
  compact?: boolean;
};

/**
 * Model tiers.
 *
 * @remarks
 * Gemma 3 1B must not use `q4f16`: fp16 overflows on WebGPU and yields
 * garbage (onnxruntime#26732), hence `q4`.
 */
export const TIERS: Record<TierKey, Tier> = {
  basic: { model: "onnx-community/gemma-3-1b-it-ONNX", dtype: "q4", size: "~1 GB", compact: true },
  full: { model: "onnx-community/gemma-4-E2B-it-ONNX", dtype: "q4f16", size: "~3.2 GB" }
};

const MOBILE_UA = /Mobi|Android/i;
const STORAGE_KEY = "aiAnswer.tier";

type NavigatorGPU = Navigator & {
  gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> };
  deviceMemory?: number;
};

export type Support = Record<TierKey, boolean>;

/**
 * Which tiers can run on this device. Both `false` means the feature should
 * stay hidden (no WebGPU).
 */
export const detectSupport = async (): Promise<Support> => {
  const none: Support = { basic: false, full: false };

  const nav = navigator as NavigatorGPU;
  if (!nav.gpu) return none;

  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return none;

    const mobile = navigator.maxTouchPoints > 0 && MOBILE_UA.test(navigator.userAgent);
    // deviceMemory is capped at 8 and only exists in Chromium
    const memory = nav.deviceMemory ?? 8;

    return {
      basic: true,
      full: !mobile && memory >= 8 && adapter.features.has("shader-f16")
    };
  } catch {
    return none;
  }
};

/**
 * The tier to preselect: the saved choice if this device still supports it,
 * otherwise the best supported one.
 */
export const pickTier = (support: Support): TierKey | undefined => {
  const saved = loadTier();
  if (saved && support[saved]) return saved;

  if (support.full) return "full";
  if (support.basic) return "basic";
  return;
};

const isTierKey = (value: unknown): value is TierKey => value === "basic" || value === "full";

const loadTier = (): TierKey | undefined => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTierKey(value) ? value : undefined;
  } catch {
    // storage may be blocked
    return;
  }
};

export const saveTier = (tier: TierKey): void => {
  try {
    localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    // storage may be blocked, the choice just won't persist
  }
};
