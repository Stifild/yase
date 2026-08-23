# YASE Rebrand — Theme Palette

Source of truth: `client/simple/src/less/definitions.less` plus a few backend
theme-list files (for Black theme removal).

## Requested Palette

| Role                 | Light theme  | Dark theme   |
|----------------------|--------------|--------------|
| Page backgrounds     | `#FFFFFF`    | `#0E0E0E`    |
| Result cards         | `#F0F0F0`    | `#232323`    |
| Unvisited links      | `#256400`    | `#D9FFC3`    |
| Visited links        | `#300090`    | `#D7C3FF`    |
| Accent (shared)      | `#5200F6`    | `#5200F6`    |

## Layout decisions (per user)
- Result cards keep a distinct surface in each theme: `#F0F0F0` on light,
  `#232323` on dark.
- Header and results are merged: header/footer backgrounds match the page
  background and their borders are removed (no band/plate separation).
- The "black" theme is removed entirely (LESS + backend).
- Favicon "подложка" (grey background + border + rounded corners) is removed;
  favicons render transparently.

## Light (`:root`) — value mapping

### Page backgrounds → `#FFFFFF`
- `--color-base-background`: `#fff`
- `--color-base-background-mobile`: `#fff`
- `--color-header-background`: `#fff` (merged header)
- `--color-footer-background`: `#fff`
- `--color-sidebar-background`: `#fff`
- `--color-backtotop-background`: `#fff`
- `--color-search-background`: `#fff`
- `--color-autocomplete-background`: `#fff`
- `--color-toolkit-dialog-background`: `#fff`

### Result cards → `#F0F0F0`
- `--color-answer-background`
- `--color-result-keyvalue-col-table`
- `--color-result-keyvalue-odd`
- `--color-result-keyvalue-even`
- `--color-result-background`
- `--color-result-image-background`

### Removed separators (light)
- `--color-header-border`: transparent
- `--color-footer-border`: transparent

### Unvisited links → `#256400`
- `--color-url-font`
- `--color-result-link-font`
- `--color-result-link-font-highlight`
- `--color-result-vim-arrow`

### Visited links → `#300090`
- `--color-url-visited-font`
- `--color-result-link-visited-font`

### Accent → `#5200F6`
- `--color-btn-background`
- `--color-search-background-hover`
- `--color-categories-item-selected-font`
- `--color-categories-item-border-selected`
- `--color-toolkit-checkbox-onoff-on-mark-background`
- `--color-toolkit-checkbox-input-border`

## Dark (`.dark-themes()`) — value mapping

### Page backgrounds → `#0E0E0E`
- `--color-base-background`: `#222428`
- `--color-base-background-mobile`: `#222428`
- `--color-header-background`: `#1e1e22` → match page bg (merged header)
- `--color-footer-background`: `#1e1e22` → match page bg
- `--color-sidebar-background`: `#292c34`
- `--color-backtotop-background`: `#2b2e36`
- `--color-search-background`: `#2b2e36`
- `--color-autocomplete-background`: `#2b2e36`
- `--color-toolkit-dialog-background`: `#1e1e22`

### Result cards → `#232323`
- `--color-answer-background`: `#26292f`
- `--color-result-keyvalue-col-table`: `#1e1e22`
- `--color-result-keyvalue-odd`: `#1e1e22`
- `--color-result-keyvalue-even`: `#26292f`
- `--color-result-background`: `#26292f`
- `--color-result-image-background`: `#222`

### Removed separators (dark)
- `--color-header-border`: transparent
- `--color-footer-border`: transparent

### Unvisited links → `#D9FFC3`
- `--color-url-font`: `#8af`
- `--color-result-link-font`: `#8af`
- `--color-result-link-font-highlight`: `#8af`
- `--color-result-vim-arrow`: `#8af`
- `--color-result-detail-link`: `#8af` (modal always dark)

### Visited links → `#D7C3FF`
- `--color-url-visited-font`: `#c09cd9`
- `--color-result-link-visited-font`: `#c09cd9`

### Accent → `#5200F6`
- `--color-btn-background`: `#58f`
- `--color-search-background-hover`: `#58f`
- `--color-categories-item-selected-font`: `#58f`
- `--color-categories-item-border-selected`: `#58f`
- `--color-toolkit-checkbox-onoff-on-mark-background`: `#58f`
- `--color-toolkit-checkbox-input-border`: `#58f`

### Contrast fix (dark, accent is now dark purple)
- `--color-btn-font`: `#222` → `#fff`
- `--color-toolkit-checkbox-onoff-on-mark-color`: `#222` → `#fff`

## Black theme removal
- `client/simple/src/less/definitions.less`: delete `.black-themes()` mixin and
  the `:root.theme-black` block.
- `searx/settings_defaults.py:25`: drop `'black'` from `SIMPLE_STYLE`.
- `searx/webapp.py:1208`: drop `"black"` from the allowed tuple.
- `searx/preferences.py:468`: drop `"black"` from choices.
- `searx/templates/simple/preferences/theme.html:22`: drop `'black'` from list.
- `searx/brand.py`: remove `theme_color_black` / `background_color_black`.
- `searx/settings.yml` (+ `container/settings.template.yml` if present):
  drop black PWA color lines.

## Favicon backing removal
- `client/simple/src/less/search.less`: `.favicon img` — removed
  `background-color`, `border`, and `border-radius`; keeps size + `display: flex`.
- `client/simple/src/less/definitions.less`: removed now-unused
  `--color-favicon-background-color` / `--color-favicon-border-color`.

## PWA manifest colors (align with new palette)
- Light: `theme_color_light` `#3050ff` → `#5200F6`, `background_color_light`
  `#fff` → `#FFFFFF`.
- Dark: `theme_color_dark` `#58f` → `#5200F6`, `background_color_dark`
  `#222428` → `#0E0E0E`.

## Verification
- Rebuild frontend assets and visually confirm light + dark (auto) themes.
- Check preferences page still lists only auto / light / dark.