# ICSE Resources (`icse-resource`)

An open-source, zero-database study portal for Class 10 ICSE students. Browse, search, preview, and practice with **5,300+ study files** (notes, 2027 syllabus, official CISCE resources, book solutions, and pre-board/PYQ papers) and **89 interactive chapter quizzes**—served as a static React app backed by Google Drive, GitHub Actions, and Cloudflare Workers.

**Live Site:** [icse-resource.pages.dev](https://icse-resource.pages.dev)

&lt;p align=&quot;center&quot;&gt;
  &lt;a href=&quot;https://icse-resource.pages.dev&quot;&gt;
    &lt;img src=&quot;https://icse-resource.pages.dev/preview-image.png&quot; alt=&quot;ICSE Resources Preview&quot; width=&quot;850&quot; /&gt;
  &lt;/a&gt;
&lt;/p&gt;

## Key Features

- **Multi-Tab Resource Explorer:** Browse six dedicated sections—**ICSE 2027 Syllabus**, **Study Assets**, **Interactive Quizzes**, **Previous Year Pre-Board Papers** (`PYQ Prelims`), **Official CISCE Resources**, and **Book Solutions**—with a responsive sidebar and breadcrumb navigation.
- **Instant Synonym & Exclusion Search (`Ctrl/Cmd + K` or `/`):** Searches across the full folder-and-file path using `public/synonyms.txt` for query expansion (OR-groups) and `public/exceptions.txt` for negative filtering.
- **Virtualized 100 MB+ PDF Viewer (`PdfCanvasViewer.tsx`):** Streams large PDFs on demand via HTTP `Range` requests (`512 KB` chunks, `disableAutoFetch: true`), renders only a `±5` page sliding window, supports focal-point pinch/`Ctrl+Wheel`/double-tap zoom, and evicts off-window canvases from RAM/GPU after 2 minutes.
- **Client-Side HTML Notes & KaTeX Math Rendering:** Fetches HTML notes via the edge proxy and renders them in a sandboxed `iframe` styled with `github-markdown-css` and `KaTeX` auto-rendering.
- **Multi-Chapter Interactive Quiz Engine:** Parses `.txt` quiz banks (`Q:`, `IMAGE:`, `A)–D)`, `CORRECT:`, `EXPLANATION:`), lets students combine multiple chapters with balanced per-chapter question distribution, supports `A–D` / `Enter` / arrow-key navigation, and displays an animated score ring plus a per-chapter accuracy pie chart.
- **Continue Studying & Recent Additions:** Saves the last 4 opened files or quiz bundles in `localStorage` (`icse_continue_history_v1`) and surfaces the 5 newest Drive uploads sorted by `addedAt`.

## System Architecture

```text
┌────────────────────────────┐      Nightly Cron (00:00 UTC)      ┌──────────────────────────────┐
│   Google Drive Storage     │ ◄───────────────────────────────── │   GitHub Actions Workflow    │
│ • Account 1: Core Folders  │      OAuth2 Refresh Tokens         │   (generate_manifests.cjs)   │
│   & quizzes/               │                                    └──────┬───────────────┬───────┘
│ • Account 2: PYQ Prelims   │                                           │               │
└─────────────┬──────────────┘                              Commits JSON │               │ Pushes ID Allowlist
              │                                             Manifests    ▼               ▼
              │                                              ┌──────────────────┐   ┌──────────────────┐
              │                                              │  Static Frontend │   │  Cloudflare KV   │
              │                                              │  (files.json &   │   │   (known_ids)    │
              │                                              │   quizzes.json)  │   └────────┬─────────┘
              │                                              └────────┬─────────┘            │
              │                                                       │                      │ Validates
              │                                                       │ ?id=<fileId>         │ fileId
              ▼                                                       ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Cloudflare Workers Edge Layer                                   │
│ • icse-file-proxy1 (/pdf, /file): Range-streams PDFs & verifies image/file reachability         │
│ • icse-file-proxy2 (/file):       Fetches raw HTML notes & .txt quiz files (+ ?download=true)   │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. Nightly Manifest Pipeline (`generate_manifests.cjs`)

A scheduled GitHub Actions workflow (`.github/workflows/sync_manifests.yml`) runs daily at `00:00 UTC` (or manually via `workflow_dispatch`) to keep the frontend decoupled from live Google Drive API calls:

1. **Multi-Account Drive Scanning:**
   - **Account 1** (`GDRIVE_CREDENTIALS`, `GDRIVE_TOKEN`) scans `icse-resources-webpage/icse-resources-files/` for `Study Assets`, `ICSE 2027 Syllabus`, `Official CISCE Resources`, and `ICSE Book Solutions`, plus `icse-resources-webpage/quizzes/` for subject-grouped `.txt` quizzes.
   - **Account 2** (`GDRIVE_CREDENTIALS_2`, `GDRIVE_TOKEN_2`, optional) scans its root directory and packages everything into a top-level `PYQ Prelims` folder.
2. **Tree & Metadata Generation:** Recursively computes folder byte sizes and stamps each file's `addedAt` directly from Google Drive's `createdTime` (`YYYY-MM-DD`).
3. **Manifest & Allowlist Output:** Writes `public/files.json`, `public/quizzes.json`, and `known_ids.json` (a flat list of every valid Drive file ID).
4. **KV Sync & Git Commit:** Uploads `known_ids.json` to Cloudflare KV (`known_ids`) via `wrangler` and commits updated `public/files.json` and `public/quizzes.json` to `main`.

### 2. Dual Cloudflare Worker Proxies

Client code never embeds Drive credentials. Requests route by `fileId` to two Workers:

| Worker | Endpoints Used | Purpose |
| :--- | :--- | :--- |
| `icse-file-proxy1.bybro.workers.dev` | `/pdf?id=<fileId>`, `/file?id=<fileId>` | Streams PDFs with HTTP `Range` support (`206 Partial Content`) and verifies/serves image embeds. |
| `icse-file-proxy2.bybro.workers.dev` | `/file?id=<fileId>`, `/file?id=<fileId>&download=true` | Serves raw HTML study notes (wrapped client-side with `github-markdown-css` + `KaTeX`) and raw `.txt` quiz files. |

### 3. Client-Side Search & Quiz Parsing

- **Search (`src/lib/search.ts`):** Builds a flat `SearchEntry[]` index across all tree tabs. Each whitespace-separated query term expands into an OR-group via `public/synonyms.txt`, excludes matches containing terms from `public/exceptions.txt` using word-boundary regexes, and caps results at 100 items.
- **Quiz Parser (`src/lib/quizParser.ts`):** Parses blank-line-separated `.txt` blocks supporting `Q:`, `IMAGE:` (Google Drive share links, bare Drive IDs, or direct URLs), `A)`–`D)`, `CORRECT:`, and `EXPLANATION:`.

## Deployment & Secrets

### GitHub Actions Workflows

- **`.github/workflows/sync_manifests.yml`:** Runs `generate_manifests.cjs`, updates Cloudflare KV (`known_ids`), and commits `public/files.json` and `public/quizzes.json`.
- **`.github/workflows/deploy.yml`:** Runs `npm run build` (`tsc -b && vite build` with `base: './'`) on every push to `main` and deploys `./dist` to GitHub Pages.

### Required Repository Secrets

| Secret Name | Purpose |
| :--- | :--- |
| `GDRIVE_CREDENTIALS` | Google Cloud OAuth2 client credentials JSON (`credentials.json`) for Account 1. |
| `GDRIVE_TOKEN` | Offline OAuth2 refresh token JSON (`token.json`) for Account 1. |
| `GDRIVE_CREDENTIALS_2` | *(Optional)* OAuth2 client credentials JSON for Account 2 (`PYQ Prelims`). |
| `GDRIVE_TOKEN_2` | *(Optional)* Offline OAuth2 refresh token JSON for Account 2. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with **Workers KV Storage: Edit** permission. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID owning the `known_ids` KV namespace. |

## Project Structure

```text
icse-resource/
├── .github/workflows/
│   ├── deploy.yml                   # Builds ./dist and deploys to GitHub Pages
│   └── sync_manifests.yml           # Nightly Drive crawl, KV sync, and manifest commit
├── public/
│   ├── files.json                   # Generated Drive directory tree (5,307 files)
│   ├── quizzes.json                 # Generated quiz manifest (89 quizzes)
│   ├── synonyms.txt                 # Search synonym expansion rules (key = syn1, syn2)
│   ├── exceptions.txt               # Search exclusion rules (query = exclude1, exclude2)
│   └── socials.txt                  # Links for the About/social section
├── src/
│   ├── components/
│   │   ├── floating/                # RecentAdditionsButton, QuizSelectionBar
│   │   ├── layout/                  # Navbar, MobileTabDrawer, ContentsBar, ConstellationBackground
│   │   ├── modals/                  # ViewerModal, PdfCanvasViewer, QuizModal, RecentAdditionsModal
│   │   └── workspace/               # Hero, ContinueSection, FileExplorer, SearchResultsView, AboutPanel
│   ├── context/UIContext.tsx        # Modal state (viewer, quiz, recent)
│   ├── data/tabs.ts                 # Tab definitions and Drive folder mappings
│   ├── lib/                         # api.ts, fileTree.ts, search.ts, quizParser.ts, recentHistory.ts
│   └── types/                       # TypeScript interfaces
├── generate_manifests.cjs           # Multi-account Google Drive API crawler
├── package.json                     # React 19, Vite 8, Tailwind CSS v4, pdfjs-dist, googleapis
└── vite.config.ts                   # Vite configuration (base: './')
```

## Running Locally

Local development reads directly from the committed `public/files.json` and `public/quizzes.json` manifests—no Google Drive credentials or `.env` files are required for frontend work.

```bash
git clone https://github.com/Logic-Legend-Ranveer/icse-resource.git
cd icse-resource
npm install
npm run dev
```

Available scripts:
- `npm run dev` — Start the Vite development server
- `npm run build` — Type-check (`tsc -b`) and build production assets to `dist/`
- `npm run lint` — Run ESLint
- `npm run preview` — Preview the production build locally

## Contributing

- **Code & UI:** Fork the repository, create a feature branch, run `npm run build` and `npm run lint`, and open a Pull Request against `main`.
- **Study Materials:** Open an issue with the resource title, subject, syllabus year, and source link. Do not submit copyrighted commercial textbooks without permission.

## Disclaimer

Unofficial notes and student-contributed resources are provided strictly for educational and revision purposes. Always verify exam schedules, syllabus updates, and official regulations with **CISCE**.
