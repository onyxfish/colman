This project is an Astro site (Astro + Tailwind) that publishes a catalogue of
Samuel Colman's etchings from markdown content stored under `src/content/prints`.

Quick contract for an AI editing this repo
- Inputs: repo files, markdown entries in `src/content/prints`, images in `src/assets/prints`.
- Outputs: edits to content, components, styles, or build scripts; site builds to `./dist`.
- Success: local `npm run dev` serves changes on localhost:4321 and `npm run validate` passes.

High-level architecture (what to read first)
- `package.json` — scripts you can run: `dev`, `build`, `preview`, `validate`.
- `astro.config.mjs` — site base URL and integrations (Tailwind, sitemap).
- `src/content/config.ts` — canonical Zod schema for the `prints` collection. Use it to validate frontmatter shape.
- `src/content/prints/*` — markdown files for each print (frontmatter -> structured data rendered by components).
- `src/components/Print.astro` — component that renders a single print entry (uses `getEntryBySlug`, `render()` and `astro:assets` images).
- `src/pages/index.astro` — lists prints using `getCollection('prints')` and `<Print />` components.
- `src/layouts/Layout.astro` — global layout, analytics and Tailwind globals.

Developer workflows and exact commands
- Install deps: `npm install` (run from repo root).
- Local dev: `npm run dev` (serves on localhost:4321).
- Validate content consistency: `npm run validate` — runs `scripts/validate.js` and checks for duplicate/missing print ids.
- Build: `npm run build` (runs `astro check && astro build`). Output -> `./dist`.
- Preview a production build: `npm run preview`.

Project-specific conventions and patterns
- Content-driven: add or edit prints by creating a file under `src/content/prints/` (markdown with frontmatter that matches `src/content/config.ts`).
  - Required keys include `id` (number), `title`, `image.filename` (nullable), `year`, etc.
  - Image files referenced by `image.filename` must live in `src/assets/prints/` and are consumed via `import.meta.glob` in `Print.astro`.
- Images: code uses `astro:assets` Image + `import.meta.glob(...)` to load images. Keep filenames stable; the component builds an import path like `/src/assets/prints/${print.data.image.filename}`.
- Slugs and URLs: content entries are referenced via slug (filename without extension). Use `getEntryBySlug('prints', slug)` when rendering a specific entry.
- Data attributes & client sorting: `index.astro` sets up DOM elements with `data-id`/`data-slug`, and `src/lib/sorter.js` sorts `.print` elements by dataset attributes. If you change attribute names, update `sorter.js`.
- Markup rendering: `Print.astro` uses `await print.render()` and `marked` for inline HTML in frontmatter fields like publications.
- Type/schema safety: `src/content/config.ts` registers Zod schemas; modify it if you add or change frontmatter fields.

Integration points and deployment notes
- Analytics: `src/layouts/Layout.astro` includes a Google gtag loader and `src/lib/analytics.js` (simple wrapper). Check these before updating analytics.
- Sitemap & Tailwind: integrations are configured in `astro.config.mjs` (`@astrojs/tailwind`, `@astrojs/sitemap`).
- Deploy: README indicates deployment to S3 + CloudFront (site built to `./dist`).

Common tasks with examples
- Add a new print (minimal steps):
  1. Add `src/assets/prints/2025-myprint.jpg`.
  2. Create `src/content/prints/2025-myprint.md` with frontmatter matching `src/content/config.ts`:
     ```yaml
     ---
     id: 54
     title: "My Print"
     image:
       filename: "2025-myprint.jpg"
       caption: "Photo credit..."
     year: "1878"
     publications: []
     drawings: []
     museums: []
     ---
     ```
  3. Run `npm run validate` and `npm run dev` to preview.

- Rename or move images: update `image.filename` in the print frontmatter. The page relies on the import path pattern used in `Print.astro`.

Things NOT to change without care
- Do not change the `prints` Zod schema in `src/content/config.ts` without updating all print frontmatter; validation and builds will fail.
- Avoid changing the import paths used by `import.meta.glob` in `Print.astro` or `src/pages/*`; if you do, update every consumer.
- Don't remove `scripts/validate.js` or its usage in `package.json` without reimplementing equivalent checks.

Where to look for more context or examples
- `src/components/Print.astro` — canonical renderer for prints.
- `src/pages/index.astro` — shows how the collection is listed and how the client-side sorter is wired.
- `scripts/validate.js` — content validation logic (useful when changing content schema).
- `README.md` — project-level commands and deployment overview.

If something appears underspecified
- Prefer following the Zod schema in `src/content/config.ts` and existing print files under `src/content/prints/` as the source of truth. When in doubt, run `npm run validate` and `npm run dev` locally to observe breakage and iteratively fix it.

If this is helpful, tell me what sections you want expanded (deploy steps, content schema examples, or editing guidance for images/components) and I'll iterate.
