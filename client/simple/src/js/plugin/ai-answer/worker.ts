// SPDX-License-Identifier: AGPL-3.0-or-later

/// <reference lib="webworker" />

import { pipeline, TextStreamer } from "@huggingface/transformers";
import type { Tier } from "./models.ts";

export type ChatMessage = { role: "system" | "user"; content: string };

export type WorkerRequest = { type: "generate"; tier: Tier; messages: ChatMessage[] };

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

type Generator = {
  tokenizer: ConstructorParameters<typeof TextStreamer>[0];
  (messages: ChatMessage[], options: Record<string, unknown>): Promise<unknown>;
};

const post = (message: WorkerResponse): void => self.postMessage(message);

const generators = new Map<string, Promise<Generator>>();

const load = (tier: Tier): Promise<Generator> => {
  let generator = generators.get(tier.model);
  if (generator) return generator;

  const files = new Map<string, { loaded: number; total: number }>();

  generator = pipeline("text-generation", tier.model, {
    device: "webgpu",
    dtype: tier.dtype,
    progress_callback: (info: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (info.status !== "progress" || !info.file) return;

      files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });

      let loaded = 0;
      let total = 0;
      for (const file of files.values()) {
        loaded += file.loaded;
        total += file.total;
      }
      post({ type: "progress", loaded: loaded, total: total });
    }
  }) as unknown as Promise<Generator>;

  // allow a retry after a failed download
  generator.catch(() => generators.delete(tier.model));
  generators.set(tier.model, generator);

  return generator;
};

// A failed download can reject promises nobody awaits (parallel file fetches in
// transformers.js, "Failed to fetch"), which would leave the UI waiting forever.
self.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  event.preventDefault();
  const reason: unknown = event.reason;
  post({ type: "error", message: reason instanceof Error ? reason.message : String(reason) });
});

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const { tier, messages } = event.data;

  try {
    const generator = await load(tier);
    post({ type: "ready" });

    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => post({ type: "token", text: text })
    });

    await generator(messages, {
      max_new_tokens: 300,
      do_sample: false,
      // breaks degenerate loops ("Влияние ... [N]. Влияние ... [N+1]...")
      no_repeat_ngram_size: 8,
      streamer: streamer
    });
    post({ type: "done" });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
