# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fork of [SearXNG](https://github.com/searxng/searxng) (metasearch engine, Python/Flask + a Vite/TypeScript/LESS frontend) rebranded as **YASE**. Upstream conventions apply; the fork-specific work is the UI rebrand (see the "YASE Design System" artifact, https://claude.ai/artifact/VQyLxEZrLea4tyc7DvWvBH — palette, "black" theme removal, merged header/results, transparent favicons; source of truth is `client/simple/src/less/definitions.less`). The Python module is still `searx`.

Note: a parent-directory `~/AGENTS.md` describes an unrelated Go app ("Infsch"); ignore it for this repo.

## Commands

Everything goes through `./manage` (bash dispatcher, sourcing `utils/lib_sxng_*.sh`) or the `Makefile` wrapping it. Python venv lives in `local/py3` (created by `make install` / `./manage pyenv.install`). Requires Python ≥3.11, Node (see `.nvmrc`/`mise.toml`), Go (only for `shfmt`).

- Dev instance: `make run` (= `./manage webapp.run`)
- Full test suite: `make test`  (yamllint, black, pyright on modified files, pylint, unit, robot, rst, shell)
- Unit tests only: `./manage test.unit` (runs `nose2 -s tests/unit`). Single test, from inside the venv: `local/py3/bin/python -m nose2 -s tests/unit tests.unit.test_query.TestQuery.test_name` (or a module: `tests.unit.test_query`)
- Lint/format Python: `./manage test.pylint`, `./manage test.black`, `./manage format.python` (black); typing: `./manage test.pyright_modified`
- Robot (browser) tests: `./manage test.robot`
- Frontend (client/simple): `./manage themes.all` builds via Vite into `searx/static/themes/simple`; `./manage themes.lint` runs biome; `./manage themes.fix` autofixes. Edit `client/simple/src/**`, not the generated static output.
- Docs: `./manage docs.html` / `docs.live`

## Architecture

- `searx/webapp.py` — Flask app; routes, request pipeline, template rendering (`searx/templates/simple`).
- `searx/search/` — `Search` orchestrates a query: parses it (`searx/query.py`, which handles `!bang`, `:lang`, `!!external-bang`), then fans out to engines through `search/processors/` (one processor per engine type: online, offline, online_dictionary, online_currency, online_url_search). Results are merged/ranked/deduplicated in `searx/results.py` using typed results from `searx/result_types/`.
- `searx/engines/` — ~250 engine modules, each a plain module exposing `request(query, params)` and `response(resp)` plus module-level config attributes. `xpath.py` / `json_engine.py` are generic configurable engines; `demo_online.py` / `demo_offline.py` are templates. Engines are loaded dynamically by `searx/engines/__init__.py` from the `engines:` list in settings. `searx/enginelib/` has shared engine base classes/traits.
- `searx/plugins/` — hook-based plugins (`_core.py` defines the plugin base/registry); `searx/answerers/` handle instant answers.
- `searx/network/` — outbound HTTP layer (httpx, proxies, per-engine networks, retries); `searx/botdetection/` + `limiter.py` implement the bot limiter (needs Valkey/Redis, `valkeydb.py`).
- Configuration: `searx/settings.yml` (defaults shipped), validated/merged through `settings_defaults.py` / `settings_loader.py`. Override with `SEARXNG_SETTINGS_PATH`. Local engine/theme lists (and the removed "black" theme) are referenced in several backend files — grep before removing/renaming a theme.
- `searx/data/` holds generated data files (engine descriptions, currencies, locales, useragents); regenerate with `./manage data.all`, don't hand-edit.
- Frontend: `client/simple/` (Vite + TS + LESS) is the only theme; templates are Jinja in `searx/templates/simple`. Translations are managed via Weblate (`searx/translations`, `babel.cfg`) — don't edit `.po` files by hand for new strings.

## Conventions

- Black formatting (config in `pyproject`-equivalent via `manage`'s `BLACK_OPTIONS`), pylint config in `.pylintrc`; files start with `# SPDX-License-Identifier: AGPL-3.0-or-later`.
- `AI_POLICY.rst`: AI use must be disclosed, a human must fully understand and be the main author of any PR, and PR/issue descriptions must be human-written. Keep this in mind when preparing commits/PRs.
- Commit messages and PR template: see `CONTRIBUTING.rst` and `PULL_REQUEST_TEMPLATE.md`.
