# 📚 ICSE Resources

A high-performance, open-source study hub built for Class 10 ICSE students. Browse, preview, and practice with **5,000+ free PDFs, revision notes, past year papers (PYQs), Selina solutions, and interactive chapter quizzes**—powered by a zero-database, edge-cached serverless architecture.

🔗 **Live Website:** [icse-resource.pages.dev](https://icse-resource.pages.dev) *(Mirror: [icse-resources1.vercel.app](https://icse-resources1.vercel.app/))*

[](https://icse-resource.pages.dev/preview-image.png)
---

## ✨ Key Features

- **Structured Study Explorer:** Navigate **Study Assets**, **ICSE 2027 Syllabus**, and **Sample Papers & PYQs** through a fast, recursive file tree with breadcrumb navigation.
- **Custom Virtualized PDF Viewer:** Smoothly read massive 100 MB+ question banks and textbooks in-browser with zoom, rotation, and on-demand page streaming.
- **Formatted Notes & Math Rendering:** Renders HTML/Markdown study notes on the fly with GitHub Markdown styling and **KaTeX** mathematical typesetting.
- **Interactive Quiz Engine:** Chapter-wise MCQs with instant scoring, answer validation, and retry support.
- **Recent Additions & Search:** Track newly synced materials via preserved `addedAt` timestamps and search across the entire catalog instantly.

---

## 🏗️ System Architecture

Instead of paying for traditional cloud databases or object storage, this project turns **Google Drive** into a multi-account content backend, **GitHub Actions** into a nightly ETL pipeline, and **Cloudflare Workers + KV** into an edge security and streaming layer:

```text
┌───────────────────────────┐       Nightly Cron (00:00 UTC)       ┌──────────────────────────────┐
│   Google Drive Storage    │ ◄─────────────────────────────────── │   GitHub Actions Workflow    │
│  (Multi-Account Folders)  │       OAuth2 Refresh Tokens          │   (generate_manifests.cjs)   │
└─────────────┬─────────────┘                                      └──────┬───────────────┬───────┘
              │                                                           │               │
              │ Raw Bytes / Streams                        Commits JSON   │               │ Pushes ID Allowlist
              │ (Drive API / usercontent)                  Manifests      ▼               ▼
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
│  • Worker 1 (Media & SEO): Range-streams PDFs (/pdf), bypasses Drive virus interstitials, SEO   │
│  • Worker 2 (Notes & Quizzes): Wraps HTML notes + KaTeX (?format=html), serves raw quiz JSON    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ How the Backend & Edge Proxy Work

### 1. Automated Manifest Pipeline (`generate_manifests.cjs`)
A scheduled Node.js crawler runs via GitHub Actions (`.github/workflows/sync_manifests.yml`) to keep the frontend completely decoupled from live Drive API calls:
- **Multi-Account Crawling:** Authenticates using offline OAuth2 refresh tokens to scan designated Drive folders (`icse-resources-files` and `quizzes`) across linked Google Drive accounts.
- **Metadata & Timestamp Preservation:** Computes folder sizes recursively and compares new scans against the existing `public/files.json` so existing resources retain their original `addedAt` dates while new uploads are stamped with today's date.
- **Manifest & Allowlist Generation:** Commits updated `public/files.json` and `public/quizzes.json` to the repo for instant static tree rendering, and uploads a flat array of valid file IDs (`known_ids.json`) to **Cloudflare KV**.

### 2. Dual Cloudflare Workers (`?id=<fileId>`)
The frontend never embeds raw Google Drive URLs. Instead, every file request passes a `fileId` to one of two Cloudflare Workers:
- **Worker 1 (`icse-file-proxy1` — PDF Streamer & SEO Engine):**
  - Verifies that `id` exists in Cloudflare KV (`env.FILE_IDS.get('known_ids')`).
  - On `/pdf?id=<fileId>`, fetches the raw PDF stream from Google Drive, bypasses Drive's large-file virus-scan HTML warning pages (`confirm=t`), and pipes `driveRes.body` directly to the browser.
  - On `/sitemap.xml`, dynamically generates an XML sitemap for search engine crawlers (`Googlebot`, `Bingbot`, etc.) from `known_ids`.
- **Worker 2 (`icse-file-proxy2` — Notes Renderer & Quiz Proxy):**
  - Fetches lightweight text, HTML notes, and quiz JSON payloads.
  - When `?format=html` is passed, wraps raw HTML fragments into a complete standalone webpage injected with `github-markdown-css` and `KaTeX` auto-rendering.
  - When `?download=true` is passed, attaches a clean resource attribution header and serves the file as a downloadable attachment.

### 3. Why Use a Worker Proxy Instead of Direct Links?
Routing requests through Cloudflare Workers solves three critical problems:
1. **Prevents Bulk Scraping & Unauthorized Bandwidth Abuse:** Exposing direct Google Drive links allows automated scripts to crawl and bulk-download all 1,100+ files outside the platform. By enforcing **strict `Origin` CORS headers** and validating every `fileId` against the **Cloudflare KV `known_ids` allowlist**, the Workers ensure files are only served to legitimate student sessions on authorized domains.
2. **Zero Credential Exposure:** Google API keys and OAuth tokens remain isolated inside Cloudflare Secrets and GitHub Secrets—never exposed in client-side JavaScript bundles.
3. **Bypasses Google Drive Viewer Restrictions:** Google Drive's native `/preview` iframe breaks on files larger than 100 MB and blocks direct automated downloads with virus-scan interstitial pages.

---

## 🚀 Solving the 100 MB+ PDF Bottleneck (Lazy Loading & RAM Eviction)

Several question banks and scanned reference books in the archive exceed **75 MB – 140 MB (250 to 535+ pages)**. Loading these naively crashes mobile browsers and exhausts user data. This project solves it across both the edge and the client:

1. **Zero-Buffer Edge Streaming & HTTP `Range` Forwarding:**
   - Worker 1 streams `driveRes.body` (`ReadableStream`) directly without buffering the file in Worker RAM (staying well within Cloudflare's memory limits).
   - By exposing `Accept-Ranges: bytes`, `Content-Range`, and `Content-Length` headers and forwarding incoming HTTP `Range` requests (`206 Partial Content`), `PDF.js` fetches only the byte slices needed for the PDF's cross-reference table and active pages instead of downloading the entire 75+ MB file upfront.
2. **±5-Page Sliding Window Virtualization (`PdfCanvasViewer.tsx`):**
   - Off-screen pages render as lightweight placeholder boxes sized to exact page dimensions so scrollbars remain accurate.
   - `PDF.js` only requests and paints pages within a **`[currentPage - 5, currentPage + 5]`** window around the student's current viewport.
3. **2-Minute Idle RAM Eviction:**
   - Every rendered page tracks a `lastActiveAt` timestamp. A background sweep runs every 15 seconds and evicts any page that has remained outside the `±5` window for **more than 2 minutes (`120,000 ms`)**—shrinking its `<canvas>` backing store to `0×0` and calling `page.cleanup()` to release GPU and JS heap memory. If the student scrolls back later, the page re-renders seamlessly on demand.

---

## 🔐 Environment Variables & Secrets

### GitHub Repository Secrets (`.github/workflows/sync_manifests.yml`)
Required for the automated Google Drive sync and Cloudflare KV update pipeline:

| Secret Name | Description |
| :--- | :--- |
| `GDRIVE_CREDENTIALS` | Google Cloud OAuth2 client credentials JSON (`credentials.json`) for the primary Drive account. |
| `GDRIVE_TOKEN` | Offline OAuth2 refresh token JSON (`token.json`) allowing headless nightly Drive scans. |
| `GDRIVE_CREDENTIALS_2` | *(Optional)* OAuth2 client credentials JSON for a secondary Google Drive storage account. |
| `GDRIVE_TOKEN_2` | *(Optional)* Offline OAuth2 refresh token JSON for the secondary Google Drive account. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with **Workers KV Storage: Edit** permissions to sync `known_ids`. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID owning the target KV namespace. |

### Cloudflare Worker Bindings & Variables
Configured under **Workers & Pages → Settings → Variables and Secrets** on Cloudflare:

| Binding / Variable | Type | Description |
| :--- | :--- | :--- |
| `FILE_IDS` | KV Namespace Binding | Binds the Cloudflare KV namespace storing the `known_ids` JSON allowlist. |
| `GOOGLE_API_KEY` | Secret / Env Variable | *(Optional)* Google Cloud API key restricted to the Google Drive v3 API (`alt=media` streaming). |

---

## 📂 Project Structure

```text
icse-resources1/
├── .github/workflows/
│   ├── sync_manifests.yml       # Nightly Drive crawler & Cloudflare KV sync
│   └── deploy.yml               # Automated production build & deployment
├── public/
│   ├── files.json               # Auto-generated study material directory tree
│   ├── quizzes.json             # Auto-generated quiz manifest
│   └── socials.txt              # Dynamic links rendered in the floating social bar
├── src/
│   ├── components/
│   │   ├── floating/            # Floating action buttons (Recent Additions, Theme, Socials)
│   │   ├── layout/              # Navbar, Sidebar, and recursive File Tree
│   │   ├── modals/              # Custom PDF Canvas Viewer, HTML Viewer, Quiz & Recent Modals
│   │   └── workspace/           # Breadcrumb File Explorer and file rows
│   ├── context/                 # Global UI and modal state management
│   ├── lib/                     # Cloudflare Worker API clients & helpers
│   └── types/                   # Shared TypeScript interfaces
├── generate_manifests.cjs       # Multi-account Google Drive API crawler & manifest builder
└── index.html                   # Entry HTML with SEO & JSON-LD structured data
```

---

## 🛠️ Running Locally

1. **Clone the repository**
   ```bash
   git clone [https://github.com/Logic-Legend-Ranveer/icse-resources1.git](https://github.com/Logic-Legend-Ranveer/icse-resources1.git)
   cd icse-resources1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```
   *(Local development reads directly from the committed `public/files.json` and `public/quizzes.json` manifests, so no Google Drive credentials or local `.env` files are required to contribute to the frontend.)*

---

## 🤝 Contributing

Contributions—whether UI improvements, performance optimizations, or new study materials—are welcome:
- **Code:** Fork the repo, create a feature branch, verify with `npm run build`, and open a Pull Request against `main`.
- **Study Materials:** Open an **Issue** with the resource name, subject, syllabus year, and a link to the file. *(Please do not submit copyrighted commercial textbooks without permission.)*

---

## ⚠️ Disclaimer

Unofficial notes and student-contributed resources are provided strictly for educational and revision purposes. Always verify exam schedules, syllabus updates, and official regulations with **CISCE**.
