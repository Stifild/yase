// SPDX-License-Identifier: AGPL-3.0-or-later

import { Plugin } from "../Plugin.ts";
import { settings } from "../toolkit.ts";
import { appendAnswerElement } from "../util/appendAnswerElement.ts";
import { getElement } from "../util/getElement.ts";
import { detectSupport, pickTier, type Support, saveTier, TIERS, type Tier, type TierKey } from "./ai-answer/models.ts";
import type { ChatMessage, WorkerRequest, WorkerResponse } from "./ai-answer/worker.ts";

type Source = {
  title: string;
  url: string;
  content: string;
};

type Prepared = {
  support: Support;
  sources: Source[];
};

// small models sometimes append a refusal after a perfectly good answer
const TRAILING_REFUSAL = /\s*The sources do not contain a clear[^.]*\.?\s*$/i;
const MIN_ANSWER = 80;

// "[1]" and also groups such as "[1, 2]" or "[1; 3]"
const CITATION_SPLIT = /(\[\d+(?:\s*[,;]\s*\d+)*\])/;
const CITATION = /^\[(\d+(?:\s*[,;]\s*\d+)*)\]$/;
const NOT_DIGITS = /\D+/;

const CYRILLIC = /\p{Script=Cyrillic}/u;

const MAX_SOURCES = 6;
const MAX_SNIPPET = 400;

const SYSTEM_PROMPT =
  "You answer search queries using ONLY the numbered sources provided by the user. " +
  "Write a short, factual answer (2-4 sentences) in the language requested at the end of the user message. " +
  "Cite a source right after the claim it supports, as [1] or [2]; use only numbers that exist. " +
  "Never list, quote or repeat the sources or their titles, and do not add a closing summary. " +
  "Do not use outside knowledge. " +
  "If the sources do not clearly answer the query, reply only with: " +
  '"The sources do not contain a clear answer." (translated into the requested language).';

const t = (key: string, fallback: string): string => settings.translations?.[key] ?? fallback;

/**
 * Summarizes the top results with a language model running in the browser
 * (transformers.js + WebGPU, in a Web Worker).
 *
 * @remarks
 * The model is only downloaded after the user clicks the button. The query
 * and the results never leave the client.
 */
export default class AiAnswer extends Plugin {
  public constructor() {
    super("aiAnswer");
  }

  protected async run(): Promise<Prepared | undefined> {
    const sources = AiAnswer.collectSources();
    if (sources.length === 0) return;

    const support = await detectSupport();
    if (!(support.basic || support.full)) return;

    return { support: support, sources: sources };
  }

  protected async post({ support, sources }: Prepared): Promise<void> {
    const card = document.createElement("div");
    card.className = "ai-answer";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-answer-button";
    button.textContent = t("ai_answer_button", "Generate AI answer");

    const select = document.createElement("select");
    select.className = "ai-answer-model";
    select.setAttribute("aria-label", t("ai_answer_model", "Model"));

    const labels: Record<TierKey, string> = {
      basic: t("ai_answer_model_basic", "Basic model"),
      full: t("ai_answer_model_full", "Full model")
    };

    for (const key of ["basic", "full"] as const) {
      const option = document.createElement("option");
      option.value = key;
      option.disabled = !support[key];
      option.textContent = `${labels[key]} (${TIERS[key].size})`;
      if (!support[key]) {
        option.textContent += ` — ${t("ai_answer_unsupported", "not supported on this device")}`;
      }
      select.append(option);
    }

    // at least one tier is supported, otherwise run() returned nothing
    select.value = pickTier(support) ?? "basic";

    const hint = document.createElement("span");
    hint.className = "ai-answer-hint";
    const updateHint = (): void => {
      hint.textContent = t(
        "ai_answer_download",
        "The model (%(size)s) is downloaded once and cached in your browser"
      ).replace("%(size)s", TIERS[select.value as TierKey].size);
    };
    updateHint();

    select.addEventListener("change", () => {
      saveTier(select.value as TierKey);
      updateHint();
    });

    const controls = document.createElement("div");
    controls.className = "ai-answer-controls";
    controls.append(button, select);

    card.append(controls, hint);
    appendAnswerElement(card);

    button.addEventListener(
      "click",
      () => {
        const tier: Tier = TIERS[select.value as TierKey];
        controls.remove();
        hint.remove();
        AiAnswer.generate(card, tier, sources);
      },
      { once: true }
    );
  }

  private static collectSources(): Source[] {
    const articles = document.querySelectorAll<HTMLElement>("#urls article.result");
    const sources: Source[] = [];

    for (const article of articles) {
      const link = article.querySelector<HTMLAnchorElement>("h3 a");
      const content = article.querySelector<HTMLElement>("p.content:not(.empty_element)");
      if (!(link?.href && content?.textContent)) continue;

      sources.push({
        title: link.textContent?.trim() ?? "",
        url: link.href,
        content: content.textContent.trim().slice(0, MAX_SNIPPET)
      });

      if (sources.length === MAX_SOURCES) break;
    }

    return sources;
  }

  private static buildMessages(sources: Source[]): ChatMessage[] {
    const query = getElement<HTMLInputElement>("q").value;
    // titles are left out on purpose: small models copy them into the answer
    const list = sources.map((s, i) => `[${i + 1}] ${s.content}`).join("\n\n");

    // Decided here, not by the model: sources are often English even for a
    // Russian (or mixed-language) query, and small models follow the sources.
    // The instruction goes last because that is where small models obey it best.
    const language = CYRILLIC.test(query) ? "Russian" : "the same language as the query";

    return [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Query: ${query}\n\nSources:\n${list}\n\nAnswer in ${language}.` }
    ];
  }

  private static generate(card: HTMLElement, tier: Tier, sources: Source[]): void {
    const status = document.createElement("progress");
    status.className = "ai-answer-progress";
    status.max = 1;

    const statusText = document.createElement("span");
    statusText.className = "ai-answer-hint";
    statusText.textContent = t("ai_answer_loading", "Loading the model");

    const output = document.createElement("p");
    output.className = "ai-answer-text";

    const disclaimer = document.createElement("small");
    disclaimer.className = "ai-answer-hint";
    disclaimer.textContent = t("ai_answer_disclaimer", "Generated by an AI model in your browser. May contain errors.");
    if (tier.compact) {
      disclaimer.textContent += ` ${t(
        "ai_answer_disclaimer_compact",
        "This is a compact model: check the sources, the answer may be inaccurate."
      )}`;
    }

    card.append(status, statusText, output, disclaimer);

    const worker = new Worker(new URL("./ai-answer/worker.ts", import.meta.url), { type: "module" });
    let text = "";

    const fail = (): void => {
      status.remove();
      statusText.textContent = t("ai_answer_error", "Could not generate an answer");
      worker.terminate();
    };

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      // biome-ignore lint/style/useDefaultSwitchClause: message type is exhaustively typed
      switch (message.type) {
        case "progress": {
          if (message.total > 0) status.value = message.loaded / message.total;
          break;
        }
        case "ready": {
          status.remove();
          statusText.remove();
          break;
        }
        case "token": {
          text += message.text;
          AiAnswer.render(output, text, sources);
          break;
        }
        case "done": {
          worker.terminate();
          break;
        }
        case "error": {
          console.error("[PLUGIN] aiAnswer:", message.message);
          fail();
          break;
        }
      }
    });
    worker.addEventListener("error", fail);

    const request: WorkerRequest = { type: "generate", tier: tier, messages: AiAnswer.buildMessages(sources) };
    worker.postMessage(request);
  }

  /**
   * Renders model output as text nodes (never as HTML), turning `[n]`
   * markers into links to the matching source.
   */
  private static render(target: HTMLElement, text: string, sources: Source[]): void {
    const nodes: (Node | string)[] = [];

    const trimmed = text.replace(TRAILING_REFUSAL, "");
    // a refusal on its own is the answer; only strip it after real content
    const shown = trimmed.length >= MIN_ANSWER ? trimmed : text;

    for (const part of shown.split(CITATION_SPLIT)) {
      const match = CITATION.exec(part);
      if (!match?.[1]) {
        nodes.push(part);
        continue;
      }

      // one link per number; numbers of nonexistent sources are made up by
      // the model and dropped, and so is a citation left without any
      const links: HTMLAnchorElement[] = [];
      for (const number of match[1].split(NOT_DIGITS)) {
        const source = sources[Number(number) - 1];
        if (!source) continue;

        const a = document.createElement("a");
        a.href = source.url;
        a.title = source.title;
        a.rel = "noopener noreferrer";
        a.className = "ai-answer-cite";
        a.textContent = `[${number}]`;
        links.push(a);
      }

      links.forEach((link, i) => {
        if (i > 0) nodes.push(", ");
        nodes.push(link);
      });
    }

    target.replaceChildren(...nodes);
  }
}
