# Token contrast spot checks

Ratios are calculated from the shipped light and dark token values using the WCAG relative luminance formula. They cover the listed solid-color pairs. Rendered composite, focus, forced-color and assistive-technology variants remain part of visual QA.

| Foreground / background | Light | Dark | Target |
|---|---:|---:|---:|
| `text` / `background` | 10.73:1 | 14.41:1 | 4.5:1 |
| `text-muted` / `surface` | 6.33:1 | 6.58:1 | 4.5:1 |
| `on-primary` / `primary` | 6.25:1 | 9.72:1 | 4.5:1 |
| `disabled-text` / `disabled-bg` | 5.21:1 | 5.49:1 | 4.5:1 |
| `danger-text` / `background` | 6.48:1 | 9.18:1 | 4.5:1 |
| `warning-text` / `surface` | 6.54:1 | 8.05:1 | 4.5:1 |
| `focus-outer` / `background` | 10.03:1 | 11.97:1 | 3:1 |
| `piece-a` / `board-cell` | 6.00:1 | 9.15:1 | 3:1 |
| `piece-b` / `board-cell` | 5.68:1 | 8.99:1 | 3:1 |
| `winning-line` / `board` | 6.09:1 | 6.50:1 | 3:1 |

[Token stylesheet](../../packages/design-tokens/src/theme.css) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
