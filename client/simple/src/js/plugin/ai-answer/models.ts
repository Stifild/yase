// SPDX-License-Identifier: AGPL-3.0-or-later

export type TierKey = "lite" | "basic" | "full";

export type Tier = {
  /** Hugging Face model id (ONNX build for transformers.js) */
  model: string;
  /** ONNX weights precision */
  dtype: "q4" | "q4f16";
  /** approximate download size, shown to the user before the click */
  size: string;
  /**
   * Approximate download size in bytes. Files are discovered while downloading
   * (small configs first), so the real total is not known upfront; this keeps
   * the percentage from reaching 100% early.
   */
  bytes: number;
  /** small model: answers are noticeably less reliable, warn the user */
  compact?: boolean;
  /**
   * Minimum `maxBufferSize` of the WebGPU adapter, in bytes.
   *
   * @remarks
   * WebGPU does not report the amount of VRAM. The adapter limits are the
   * only signal: the spec default (256 MiB) means a weak or restricted GPU,
   * while capable desktop GPUs usually report 2-4 GiB. These are conservative
   * heuristics, not measured requirements: tune them on real devices.
   */
  minBufferSize: number;
};

const MiB = 1024 * 1024;

/**
 * Model tiers.
 *
 * @remarks
 * Gemma 3 1B must not use `q4f16`: fp16 overflows on WebGPU and yields
 * garbage (onnxruntime#26732), hence `q4`.
 */
export const TIERS: Record<TierKey, Tier> = {
  // iOS kills the tab at ~850 MB (measured on iPhone 17, Safari/Orion), and
  // transformers.js buffers a whole weights file in memory, so the 1 GB basic
  // model cannot finish downloading there
  lite: {
    model: "onnx-community/gemma-3-270m-it-ONNX",
    dtype: "q4",
    size: "~330 MB",
    bytes: 330_000_000,
    compact: true,
    minBufferSize: 256 * MiB
  },
  basic: {
    model: "onnx-community/gemma-3-1b-it-ONNX",
    dtype: "q4",
    size: "~1 GB",
    bytes: 1_000_000_000,
    compact: true,
    minBufferSize: 512 * MiB
  },
  full: {
    model: "onnx-community/gemma-4-E2B-it-ONNX",
    dtype: "q4f16",
    size: "~3.2 GB",
    bytes: 3_200_000_000,
    minBufferSize: 2048 * MiB
  }
};

const MOBILE_UA = /Mobi|Android/i;
const IOS_UA = /iPhone|iPad|iPod/;
const MAC_UA = /Macintosh/;
const STORAGE_KEY = "aiAnswer.tier";

type NavigatorGPU = Navigator & {
  gpu?: {
    requestAdapter(): Promise<{ features: Set<string>; limits: { maxBufferSize: number } } | null>;
  };
  deviceMemory?: number;
};

export type Support = Record<TierKey, boolean>;

/**
 * Which tiers can run on this device. All `false` means the feature should
 * stay hidden (no WebGPU, or a GPU too limited even for the basic tier).
 */
export const detectSupport = async (): Promise<Support> => {
  const none: Support = { lite: false, basic: false, full: false };

  const nav = navigator as NavigatorGPU;
  if (!nav.gpu) return none;

  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return none;

    const mobile = navigator.maxTouchPoints > 0 && MOBILE_UA.test(navigator.userAgent);
    // deviceMemory is capped at 8 and only exists in Chromium
    const memory = nav.deviceMemory ?? 8;

    const { maxBufferSize } = adapter.limits;
    console.debug(`[PLUGIN] aiAnswer: WebGPU maxBufferSize = ${Math.round(maxBufferSize / MiB)} MiB`);

    // iPadOS reports itself as a Mac, but has a touch screen
    const ios = IOS_UA.test(navigator.userAgent) || (MAC_UA.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (ios) return { lite: maxBufferSize >= TIERS.lite.minBufferSize, basic: false, full: false };

    return {
      lite: false,
      basic: maxBufferSize >= TIERS.basic.minBufferSize,
      full: !mobile && memory >= 8 && adapter.features.has("shader-f16") && maxBufferSize >= TIERS.full.minBufferSize
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
  if (support.lite) return "lite";
  return;
};

const isTierKey = (value: unknown): value is TierKey => value === "lite" || value === "basic" || value === "full";

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
