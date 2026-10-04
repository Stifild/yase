// SPDX-License-Identifier: AGPL-3.0-or-later

import { Plugin } from "../Plugin.ts";
import { settings } from "../toolkit.ts";
import { appendAnswerElement } from "../util/appendAnswerElement.ts";
import { getElement } from "../util/getElement.ts";
import { type CachedAnswer, cacheKey, loadAnswer, saveAnswer } from "./ai-answer/cache.ts";
import {
  detectSupport,
  isMobile,
  isTrusted,
  pickTier,
  recordSuccess,
  type Support,
  saveTier,
  TIERS,
  type Tier,
  type TierKey
} from "./ai-answer/models.ts";
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

// A small model sometimes loses the chat format and starts echoing the prompt
// ("Answer in Russian: ...", "Query:", "Sources:") followed by a garbled second
// copy of the answer. Everything from the first such marker on is dropped.
const PROMPT_ECHO = /\s*(?:Answer in\b|Query:|Sources:)/i;

// "[1]" and also groups such as "[1, 2]" or "[1; 3]"
const CITATION_SPLIT = /(\[\d+(?:\s*[,;]\s*\d+)*\])/;
const CITATION = /^\[(\d+(?:\s*[,;]\s*\d+)*)\]$/;
const NOT_DIGITS = /\D+/;
const CITATION_GLOBAL = /\[(\d+(?:\s*[,;]\s*\d+)*)\]/g;
const WWW_PREFIX = /^www\./;

// a citation still being streamed, e.g. "[1" or "[1, "
const OPEN_CITATION = /\[[\d\s,;]*$/;

let greeted = false;

// click the spark this many times within this many ms for a surprise
const SPARK_CLICKS = 5;
const SPARK_WINDOW = 2000;
const SPARK_COUNT = 14;

/** The spark changes with the date or the hour. */
const sparkGlyph = (): string => {
  const now = new Date();
  const day = `${now.getMonth() + 1}-${now.getDate()}`;
  if (day === "10-31") return "🎃";
  if (day === "12-31" || day === "1-1") return "🎆";
  if (day === "4-1") return "🙃";
  if (now.getHours() < 5) return "☾";
  return "✦";
};

const RETRY_JOKES = ["", "Try again (third time lucky?)", "Have you tried turning it off and on again?"];

// pause after the last file completes before the download counts as finished
const SETTLE_MS = 1500;
const PATIENCE_AFTER = 15;
const PATIENCE_EVERY = 7;

const ANSWER_42 = /\b42\b|смысл жизни|meaning of life/i;

const CYRILLIC = /\p{Script=Cyrillic}/u;

// seconds the phone confirm button stays locked
const CONFIRM_DELAY = 4;

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

const NETWORK_ERROR = /failed to fetch|networkerror|load failed|network request|err_/i;
const GPU_ERROR = /webgpu|gpu|adapter|device/i;
const MEMORY_ERROR = /memory|alloc|buffer|out of/i;

type Failure = { reason: string; fixes: string[] };

/** Maps a raw worker error to a human reason and a few quick fixes. */
const explainFailure = (raw: string): Failure => {
  if (NETWORK_ERROR.test(raw)) {
    return {
      reason: t("ai_answer_err_network", "The model could not be downloaded."),
      fixes: [
        t("ai_answer_fix_connection", "Check your internet connection and try again."),
        t(
          "ai_answer_fix_blockers",
          "Turn off ad blockers, VPN or a proxy for this site: they may block huggingface.co."
        ),
        t("ai_answer_fix_storage", "Free some disk space or leave a private window: the browser must cache the model.")
      ]
    };
  }
  if (GPU_ERROR.test(raw)) {
    return {
      reason: t("ai_answer_err_gpu", "WebGPU is unavailable or crashed."),
      fixes: [
        t("ai_answer_fix_browser", "Update the browser (Chrome or Edge 113+, Safari 18+)."),
        t("ai_answer_fix_hardware", "Enable hardware acceleration in the browser settings.")
      ]
    };
  }
  if (MEMORY_ERROR.test(raw)) {
    return {
      reason: t("ai_answer_err_memory", "Not enough memory for this model."),
      fixes: [t("ai_answer_fix_tabs", "Close other heavy tabs and apps, then try again.")]
    };
  }
  return {
    reason: t("ai_answer_err_unknown", "Something went wrong while running the model."),
    fixes: [t("ai_answer_fix_reload", "Reload the page and try again.")]
  };
};

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
    const card = document.createElement("section");
    card.className = "ai-answer";
    card.setAttribute("aria-label", t("ai_answer_title", "AI answer"));

    const header = document.createElement("header");
    header.className = "ai-answer-header";
    const title = document.createElement("span");
    title.className = "ai-answer-title";
    const spark = document.createElement("span");
    spark.className = "ai-answer-spark";
    spark.setAttribute("aria-hidden", "true");
    spark.textContent = sparkGlyph();
    const heading = ANSWER_42.test(getElement<HTMLInputElement>("q").value)
      ? "Don't panic"
      : t("ai_answer_title", "AI answer");
    title.append(spark, heading);
    header.append(title);
    AiAnswer.armSpark(spark, header);

    if (!greeted) {
      greeted = true;
      console.info(
        "%c✦ YASE%c The model runs in your browser: your query and results never leave this tab.",
        "color:#5200f6;font-weight:bold",
        ""
      );
    }

    const labels: Record<TierKey, string> = {
      basic: t("ai_answer_model_basic", "Basic model"),
      full: t("ai_answer_model_full", "Full model")
    };

    const body = document.createElement("div");
    body.className = "ai-answer-body";

    const badge = document.createElement("span");
    badge.className = "ai-answer-badge";
    badge.title = "Runs on your GPU. Your fans may disagree.";

    const start = (key: TierKey): void => {
      badge.textContent = labels[key];
      if (!badge.isConnected) header.append(badge);

      AiAnswer.generate(body, TIERS[key], sources);
    };

    // the same query with the same results was answered recently: show that, no model needed
    const cached = loadAnswer(AiAnswer.currentKey(sources));
    if (cached) {
      badge.textContent = labels[cached.tier];
      header.append(badge);

      const again = support[cached.tier] ? cached.tier : (pickTier(support) ?? cached.tier);
      AiAnswer.showCached(body, cached, sources, () => start(again));
      card.append(header, body);
      appendAnswerElement(card);
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-answer-button";
    button.textContent = t("ai_answer_button", "Generate AI answer");

    const setup = document.createElement("div");
    setup.className = "ai-answer-setup";

    if (isMobile() && !isTrusted()) {
      // phones (until 3 answers have worked): a small button, the basic model only, and a warning to confirm
      card.classList.add("ai-answer-mobile");
      button.classList.add("ai-answer-small");

      const warning = document.createElement("p");
      warning.className = "ai-answer-warning";
      warning.hidden = true;
      warning.textContent = t(
        "ai_answer_mobile_warning",
        "AI runs on your phone and may not work at all, or may make it freeze badly. Continue?"
      );

      // the user must tick this before "Continue" works, so the warning is not skipped
      const understand = document.createElement("input");
      understand.type = "checkbox";
      const understandLabel = document.createElement("label");
      understandLabel.className = "ai-answer-understand";
      understandLabel.append(
        understand,
        t("ai_answer_mobile_understand", "I understand it may fail or freeze my phone")
      );

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "ai-answer-button";
      confirm.disabled = true;
      const confirmText = t("ai_answer_mobile_confirm", "Continue anyway");

      // the button also stays locked for a few seconds so the text is read
      let timer: number | undefined;
      let left = 0;
      const refresh = (): void => {
        confirm.disabled = !understand.checked || left > 0;
        confirm.textContent = left > 0 ? `${confirmText} (${left})` : confirmText;
      };
      understand.addEventListener("change", refresh);
      confirm.textContent = confirmText;

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ai-answer-button ai-answer-cancel";
      cancel.textContent = t("ai_answer_mobile_cancel", "Cancel");

      const confirmRow = document.createElement("div");
      confirmRow.className = "ai-answer-controls";
      confirmRow.hidden = true;
      understandLabel.hidden = true;
      confirmRow.append(confirm, cancel);

      const toggle = (asking: boolean): void => {
        clearInterval(timer);
        if (asking) {
          left = CONFIRM_DELAY;
          timer = window.setInterval(() => {
            left -= 1;
            if (left <= 0) clearInterval(timer);
            refresh();
          }, 1000);
        } else {
          left = 0;
        }

        button.hidden = asking;
        warning.hidden = !asking;
        understandLabel.hidden = !asking;
        confirmRow.hidden = !asking;
        if (!asking) understand.checked = false;
        refresh();
      };
      button.addEventListener("click", () => toggle(true));
      cancel.addEventListener("click", () => toggle(false));
      confirm.addEventListener(
        "click",
        () => {
          clearInterval(timer);
          setup.remove();
          start("basic");
        },
        { once: true }
      );

      setup.append(button, warning, understandLabel, confirmRow);
    } else {
      const select = document.createElement("select");
      select.className = "ai-answer-model";
      select.setAttribute("aria-label", t("ai_answer_model", "Model"));

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

      const hint = document.createElement("p");
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
      setup.append(controls, hint);

      button.addEventListener(
        "click",
        () => {
          setup.remove();
          start(select.value as TierKey);
        },
        { once: true }
      );
    }

    card.append(header, setup, body);
    appendAnswerElement(card);
  }

  /** Easter egg: a quick burst of sparks when the title spark is clicked repeatedly. */
  private static armSpark(spark: HTMLElement, header: HTMLElement): void {
    let clicks: number[] = [];

    spark.addEventListener("click", () => {
      const now = Date.now();
      clicks = [...clicks.filter((time) => now - time < SPARK_WINDOW), now];
      if (clicks.length < SPARK_CLICKS) return;
      clicks = [];

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      spark.classList.remove("ai-answer-spark-spin");
      void spark.offsetWidth; // restart the animation
      spark.classList.add("ai-answer-spark-spin");

      for (let i = 0; i < SPARK_COUNT; i += 1) {
        const angle = (i / SPARK_COUNT) * 2 * Math.PI;
        const distance = 40 + Math.random() * 50;
        const particle = document.createElement("span");
        particle.className = "ai-answer-particle";
        particle.setAttribute("aria-hidden", "true");
        particle.textContent = sparkGlyph();
        particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
        particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
        particle.style.setProperty("--hue", String(Math.round(Math.random() * 360)));
        particle.addEventListener("animationend", () => particle.remove(), { once: true });
        header.append(particle);
      }
    });
  }

  /** Cache key of the current query with the current list of sources. */
  private static currentKey(sources: Source[]): string {
    return cacheKey(
      getElement<HTMLInputElement>("q").value,
      sources.map((s) => s.url)
    );
  }

  private static disclaimer(tier: Tier): HTMLElement {
    const disclaimer = document.createElement("small");
    disclaimer.className = "ai-answer-hint";
    disclaimer.textContent = t("ai_answer_disclaimer", "Generated by an AI model in your browser. May contain errors.");
    if (tier.compact) {
      disclaimer.textContent += ` ${t(
        "ai_answer_disclaimer_compact",
        "This is a compact model: check the sources, the answer may be inaccurate."
      )}`;
    }
    return disclaimer;
  }

  private static regenerateButton(onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-answer-button ai-answer-regenerate";
    button.textContent = t("ai_answer_regenerate", "Regenerate");
    button.addEventListener("click", onClick, { once: true });
    return button;
  }

  /** Shows a saved answer instead of running the model. */
  private static showCached(body: HTMLElement, entry: CachedAnswer, sources: Source[], regenerate: () => void): void {
    body.replaceChildren();
    body.dataset.state = "done";

    const output = document.createElement("p");
    output.className = "ai-answer-text";
    AiAnswer.render(output, entry.text, sources);

    const footer = document.createElement("div");
    footer.className = "ai-answer-footer";
    AiAnswer.renderSources(footer, output.textContent ?? "", sources);

    const minutes = Math.max(0, Math.round((Date.now() - entry.at) / 60_000));
    const format = new Intl.RelativeTimeFormat(document.documentElement.lang || undefined, { numeric: "auto" });
    const age = minutes < 60 ? format.format(-minutes, "minute") : format.format(-Math.round(minutes / 60), "hour");

    const saved = document.createElement("small");
    saved.className = "ai-answer-hint";
    saved.textContent = `${t("ai_answer_cached", "Saved in this browser")} · ${age}`;

    footer.append(AiAnswer.disclaimer(TIERS[entry.tier]), saved, AiAnswer.regenerateButton(regenerate));
    body.append(output, footer);
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

  private static buildMessages(allSources: Source[], tier: Tier): ChatMessage[] {
    const sources = allSources
      .slice(0, tier.maxSources ?? allSources.length)
      .map((s) => ({ ...s, content: s.content.slice(0, tier.maxSnippet ?? s.content.length) }));
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

  private static generate(body: HTMLElement, tier: Tier, sources: Source[], attempt = 0): void {
    body.replaceChildren();
    body.removeAttribute("data-state");
    body.dataset.state = "loading";

    const status = document.createElement("div");
    status.className = "ai-answer-status";
    status.setAttribute("role", "status");

    // no data yet (or only post-download setup left): "indeterminate" so it never looks frozen
    const progress = document.createElement("div");
    progress.className = "ai-answer-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.dataset.indeterminate = "";
    const fill = document.createElement("span");
    progress.append(fill);

    const stepLabels = [
      t("ai_answer_loading", "Loading the model"),
      t("ai_answer_step_prepare", "Preparing the model"),
      t("ai_answer_step_generate", "Generating the answer")
    ];
    const steps = document.createElement("ol");
    steps.className = "ai-answer-steps";
    const labels: HTMLElement[] = [];
    for (const label of stepLabels) {
      const li = document.createElement("li");
      const icon = document.createElement("span");
      icon.className = "ai-answer-step-icon";
      icon.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = label;
      labels.push(text);
      li.append(icon, text);
      steps.append(li);
    }

    // everything before `current` is done, `current` is active, the rest pending
    const setStep = (current: number): void => {
      steps.querySelectorAll("li").forEach((li, i) => {
        let state = "pending";
        if (i < current) state = "done";
        else if (i === current) state = "active";
        li.dataset.state = state;
      });
      progress.hidden = current > 1;
    };
    setStep(0);

    status.append(steps, progress);

    const output = document.createElement("p");
    output.className = "ai-answer-text";
    output.setAttribute("aria-live", "polite");

    const footer = document.createElement("div");
    footer.className = "ai-answer-footer";

    const disclaimer = AiAnswer.disclaimer(tier);

    body.append(status, output);

    // reassurance for slow downloads, so a long wait never looks like a hang
    const patience = document.createElement("small");
    patience.className = "ai-answer-hint ai-answer-patience";
    let waited = 0;
    let shownMessage = "";

    // download tracking: see the "progress" handler
    let percent = 0;
    let downloaded = false;
    let settleTimer = 0;

    // the old phrase floats away while the new one slides in
    const swapPatience = (message: string): void => {
      if (message === shownMessage) return;
      shownMessage = message;

      for (const old of patience.children) {
        old.classList.add("leaving");
        old.addEventListener("animationend", () => old.remove(), { once: true });
      }

      const next = document.createElement("span");
      next.className = "ai-answer-patience-text";
      next.textContent = message;
      patience.append(next);
    };
    const timer = window.setInterval(() => {
      waited += 1;
      if (waited < PATIENCE_AFTER) return;
      if (!patience.isConnected) status.append(patience);
      const messages = [
        t("ai_answer_patience_1", "Still here. The model is big, not stuck."),
        t("ai_answer_patience_2", "Large downloads happen once, then it is cached."),
        t("ai_answer_patience_3", "Your GPU is warming up."),
        t("ai_answer_patience_4", "Good answers take a moment."),
        t("ai_answer_patience_5", "Almost there. Probably.")
      ];
      swapPatience(messages[Math.floor((waited - PATIENCE_AFTER) / PATIENCE_EVERY) % messages.length] ?? "");
    }, 1000);
    const stopWaiting = (): void => {
      window.clearInterval(timer);
      patience.remove();
    };

    const worker = new Worker(new URL("./ai-answer/worker.ts", import.meta.url), { type: "module" });
    let text = "";

    // Tokens arrive in uneven bursts; reveal them frame by frame instead, the
    // further behind the display is, the more characters per frame.
    let shown = 0;
    let frame = 0;
    let finished = false;

    const finish = (): void => {
      body.dataset.state = "done";
      delete output.dataset.typing;
      AiAnswer.renderSources(footer, output.textContent ?? "", sources);
      footer.append(
        disclaimer,
        AiAnswer.regenerateButton(() => AiAnswer.generate(body, tier, sources))
      );
      body.append(footer);
      if (text.trim()) {
        const tierKey = (Object.keys(TIERS) as TierKey[]).find((k) => TIERS[k] === tier);
        if (tierKey) saveAnswer(AiAnswer.currentKey(sources), text, tierKey);
      }
    };

    const pump = (): void => {
      frame = 0;
      const backlog = text.length - shown;
      if (backlog > 0) {
        shown += Math.max(1, Math.ceil(backlog / 12));
        const visible = text.slice(0, shown);
        AiAnswer.render(output, finished ? visible : visible.replace(OPEN_CITATION, ""), sources);
        output.dataset.typing = "";
        frame = requestAnimationFrame(pump);
      } else {
        // caught up: the caret blinks while waiting for the model
        delete output.dataset.typing;
        if (finished) finish();
      }
    };

    const fail = (raw = ""): void => {
      window.clearTimeout(settleTimer);
      stopWaiting();
      cancelAnimationFrame(frame);
      worker.terminate();
      status.replaceChildren();
      if (!status.isConnected) body.append(status);
      body.dataset.state = "error";

      const message = document.createElement("span");
      message.textContent = t("ai_answer_error", "Could not generate an answer");

      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "ai-answer-button ai-answer-retry";
      retry.textContent = RETRY_JOKES[Math.min(attempt, RETRY_JOKES.length - 1)] || t("ai_answer_retry", "Try again");
      retry.addEventListener("click", () => AiAnswer.generate(body, tier, sources, attempt + 1), { once: true });

      status.append(message, retry);

      // the reason and quick fixes go to the footer
      const failure = explainFailure(raw);
      const details = document.createElement("div");
      details.className = "ai-answer-footer ai-answer-failure";

      const reason = document.createElement("strong");
      reason.textContent = failure.reason;

      const fixes = document.createElement("ul");
      for (const fix of failure.fixes) {
        const item = document.createElement("li");
        item.textContent = fix;
        fixes.append(item);
      }

      details.append(reason, fixes);
      if (raw) {
        const technical = document.createElement("small");
        technical.className = "ai-answer-hint";
        technical.textContent = raw;
        details.append(technical);
      }
      body.append(details);
    };

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      // biome-ignore lint/style/useDefaultSwitchClause: message type is exhaustively typed
      switch (message.type) {
        case "progress": {
          if (downloaded || message.total <= 0) break;

          if (message.loaded < message.total) {
            // more bytes are coming: not finished, whatever a pause suggested
            window.clearTimeout(settleTimer);
            const ratio = message.loaded / Math.max(message.total, tier.bytes);
            percent = Math.max(percent, Math.min(Math.floor(ratio * 100), 99));
            delete progress.dataset.indeterminate;
            fill.style.width = `${percent}%`;
            progress.setAttribute("aria-valuenow", String(percent));
            if (labels[0]) labels[0].textContent = `${stepLabels[0]} · ${percent}%`;
          } else {
            // every file seen so far is complete; wait a moment in case the
            // next (large) file has not started yet
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(() => {
              downloaded = true;
              progress.dataset.indeterminate = "";
              if (labels[0]) labels[0].textContent = stepLabels[0] ?? "";
              setStep(1);
            }, SETTLE_MS);
          }
          break;
        }
        case "ready": {
          window.clearTimeout(settleTimer);
          downloaded = true;
          if (labels[0]) labels[0].textContent = stepLabels[0] ?? "";
          setStep(2);
          body.dataset.state = "generating";
          break;
        }
        case "token": {
          stopWaiting();
          status.remove();
          text += message.text;
          if (text.search(PROMPT_ECHO) > 0) {
            // the answer is over, the rest is garbage: stop generating it
            text = text.slice(0, text.search(PROMPT_ECHO));
            worker.terminate();
            finished = true;
            recordSuccess();
          }
          if (!frame) frame = requestAnimationFrame(pump);
          break;
        }
        case "done": {
          worker.terminate();
          finished = true;
          if (text.trim()) recordSuccess();
          // let the reveal catch up before the footer appears
          if (!frame) pump();
          break;
        }
        case "error": {
          console.error("[PLUGIN] aiAnswer:", message.message);
          fail(message.message);
          break;
        }
      }
    });
    worker.addEventListener("error", (event: ErrorEvent) => fail(event.message));

    const request: WorkerRequest = { type: "generate", tier: tier, messages: AiAnswer.buildMessages(sources, tier) };
    worker.postMessage(request);
  }

  /** Lists the sources the answer actually cites, in order of first mention. */
  private static renderSources(target: HTMLElement, text: string, sources: Source[]): void {
    const cited = new Set<number>();
    for (const match of text.matchAll(CITATION_GLOBAL)) {
      for (const number of (match[1] ?? "").split(NOT_DIGITS)) {
        if (sources[Number(number) - 1]) cited.add(Number(number));
      }
    }
    if (cited.size === 0) return;

    const list = document.createElement("ul");
    list.className = "ai-answer-sources";
    list.setAttribute("aria-label", t("ai_answer_sources", "Sources"));

    for (const number of cited) {
      const source = sources[number - 1];
      if (!source) continue;

      let host = source.url;
      try {
        host = new URL(source.url).hostname.replace(WWW_PREFIX, "");
      } catch {
        // keep the raw URL
      }

      const a = document.createElement("a");
      a.href = source.url;
      a.title = source.title;
      a.rel = "noopener noreferrer";
      a.textContent = `[${number}] ${host}`;

      const li = document.createElement("li");
      li.append(a);
      list.append(li);
    }

    target.append(list);
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
