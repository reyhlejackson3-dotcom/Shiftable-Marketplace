# The Program Builder — three website designs

Three complete designs for Coach Alan DiGiosio's consulting site. All three run
**identical copy** — only the visual design differs — so the client can pick a
look and edit the words separately.

| | Design | What it is |
|---|---|---|
| **1** | Traced field | Dark green, chalk field diagram fixed behind the page, red line traces the basepath as you scroll |
| **2** | Red white blue | Navy / red / white, split hero, numbered timeline, full-width package rows |
| **3** | Chalk &amp; grass | Grass texture, hand-drawn chalk line drawn down the page as you scroll |

## Switching between them

- Press **1**, **2** or **3**, or click the buttons in the top bar
- Direct links: `/#1`, `/#2`, `/#3`
- Each design is also reachable on its own at `/v1/`, `/v2/`, `/v3/`

## Structure

```
index.html      switcher shell (iframe + keyboard shortcuts)
v1/index.html   design 1
v2/index.html   design 2
v3/index.html   design 3
assets/         the five photos, shared by all three designs
copy/           the editable copy document sent to the client
```

Each design is a single self-contained HTML file — no build step, no dependencies,
no framework. Fonts come from Google Fonts; everything else is local.

## Deploying

```bash
git init
git add .
git commit -m "Three designs for The Program Builder"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then on Vercel: **Add New → Project → import the repo → Deploy.**
Framework preset **Other**, no build command, output directory `.` — it is
plain static files.

## Before this goes live

Two things are wired for the demo and need swapping:

1. **Contact form** — every design posts to the same Formspree endpoint, set at
   the top of the `<script>` block in each `v*/index.html`:
   ```js
   const FORMSPREE = "https://formspree.io/f/xgawqezn";
   ```
   Replace with the client's own Formspree endpoint at handoff.

2. **Booking calendar** — currently a placeholder. Create a free
   [Cal.com](https://cal.com) account, add the three event types, then set:
   ```js
   const CAL_USER = "";   // e.g. "alan-digiosio/consult"
   ```
   in each `v*/index.html`. With it empty the section shows a demo panel; with it
   set, a real inline booking calendar mounts.

## Photo rights — unresolved

- The team lineup photo and the softball celebration photo (the one used as
  "what it looks like when it works") both carry a photographer's watermark in
  the original. Both are cropped for the demo. **Permission is needed before
  launch.**
- All three team photos show identifiable minors. Releases are needed for
  commercial use.
- The coach headshot is 200×200 in the original, which is why it is only used
  small. A larger file would let it be used at full width.

## Changing the copy

All three designs use exactly the same 141 text strings. `copy/` holds the
editable document — whatever comes back from the client gets applied to all
three at once. If you edit copy directly in one design, apply the same change to
the other two or the comparison stops being fair.
