# Brand assets

Drop the logo files here. The app picks them up by exact filename, so the
names below matter.

## What to add

| Filename | What it is | Notes |
|---|---|---|
| `logo.png` | Full lockup: mark + "REST Finance" wordmark | Transparent background. The original is on white, so export it again without the background or the white square shows on dark. |
| `logo-mark.png` | The mark alone: toque, cutlery, bar chart | Square, transparent. Used wherever the wordmark would be too small to read. |

Optional but better if you have them:

| Filename | What it is |
|---|---|
| `logo.svg` | Vector lockup. Preferred over PNG: sharp at every size, far smaller. |
| `logo-mark.svg` | Vector mark. |

## Sizes

- `logo.png`: around 800px wide is plenty. It renders at roughly 150px.
- `logo-mark.png`: at least 512x512 square, since the PWA icons derive from it.

## Transparency

The version shared so far sits on a white background. On the site the header
and footer are not white, and there is a dark theme, so a white box would be
visible around it. Export with transparency, or say so and the background can
be removed here.

## After adding the files

Nothing else to do. `app/components/Logo.tsx` already references these paths
and falls back to the inline SVG until the files exist.
