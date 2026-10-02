# AI answer: model evaluation set

Run each query in Yase with the `aiAnswer` plugin enabled, once per model
(`basic` = Gemma 3 1B, `full` = Gemma 4 E2B). Fill the table, then decide
the fate of the `basic` tier.

To force a tier, temporarily return it from `detectTier()` in
`client/simple/src/js/plugin/ai-answer/models.ts`.

## Queries

| # | Query | What it checks |
|---|-------|----------------|
| 1 | сколько градусов в прямом угле | short fact, answer is in the snippets |
| 2 | что такое рекурсия в программировании | definition in Russian |
| 3 | как перезагрузить роутер без потери настроек | how-to, steps |
| 4 | чем отличается TCP от UDP | comparison, structure |
| 5 | кто написал роман «Мастер и Маргарита» и когда | two facts, dates |
| 6 | python list vs tuple difference | English query, English answer |
| 7 | погода в Казани завтра | snippets rarely contain the answer: should say so, not invent |
| 8 | почему небо голубое, how does Rayleigh scattering work | mixed languages: answer in the query's language (Russian) |
| 9 | лучший смартфон 2026 | opinionated/unstable: should hedge and cite, not assert |
| 10 | asdfgh qwerty zxcv | garbage query: should not hallucinate |

## Per-run checklist

- **Language**: answer matches the query language (query 8: Russian).
- **Grounded**: every claim is in a cited source; no outside facts.
- **Citations**: `[n]` point to the right result.
- **Honest**: queries 7 and 10 say the sources are insufficient.
- **Not garbage**: no repeated tokens or broken text (known Gemma 3 fp16 failure mode).
- **Speed**: seconds to first token, total time (record the GPU).

## Results

Score each cell 0 (bad) / 1 (ok) / 2 (good). Notes for anything odd.

| # | basic: lang | grounded | cites | honest | speed | full: lang | grounded | cites | honest | speed | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | |
| 2 | | | | | | | | | | | |
| 3 | | | | | | | | | | | |
| 4 | | | | | | | | | | | |
| 5 | | | | | | | | | | | |
| 6 | | | | | | | | | | | |
| 7 | | | | | | | | | | | |
| 8 | | | | | | | | | | | |
| 9 | | | | | | | | | | | |
| 10 | | | | | | | | | | | |

## Decision rule

- `basic` produces garbage or fails to load on WebGPU: replace it (candidate: Qwen3-1.7B ONNX).
- `basic` average below 1 on "grounded" or "honest": replace it, or ship only `full`.
- `full` fails to load via `pipeline()`: switch the worker to `Gemma4ForConditionalGeneration`.
