# Resolve: competition supporting evidence

| File | What it is |
| --- | --- |
| `Resolve_Supporting_Evidence.pdf` | The finished document: A4, 24 pages, with landscape pages for the three main diagrams. |
| `Resolve_Supporting_Evidence_Source.md` | Editable source. Markdown, with HTML blocks for the cover, figures and status labels. |
| `evidence-assets/figures/` | The app screenshots used in the document (synthetic demo data). |
| `evidence-assets/diagram-*.png` | Architecture, database, AI workflow and proposed-pillar diagrams. |
| `tools/` | Scripts that reproduce everything: capture, diagrams, cropping and PDF build. |

## Rebuild

Run from the repository root.

1. Screenshots. This uses the production build, PostgreSQL and the local demo environment (see `video/README.md`):

   ```bash
   NEXT_DIST_DIR=.next-e2e npx next build
   ```

   ```bash
   node docs/competition/tools/capture-screens.mjs
   ```

   ```bash
   python3 docs/competition/tools/crop_figures.py
   ```

2. Diagrams. The HTML sources are in `tools/diagrams/`:

   ```bash
   node docs/competition/tools/render-diagrams.mjs
   ```

3. PDF. Install the Markdown parser once, then build:

   ```bash
   npm install --prefix docs/competition/tools --no-save marked@15.0.12
   ```

   ```bash
   node docs/competition/tools/build-pdf.mjs
   ```

## Where the evidence comes from

- **Screenshots** show the real app running on synthetic data: a fictional customer and bank.
- **AI text** in the screenshots is genuine Google Gemini output, captured on the live site for the same scenario with a temporary account that was then deleted.
- **Test results** come from the runs of 11 November 2026.
