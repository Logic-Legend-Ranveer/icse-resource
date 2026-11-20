import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { fetchFileEmbed } from "../../lib/api";
import { isImageFile } from "../../lib/fileTree";
import { useUI } from "../../context/UIContext";
import PdfCanvasViewer, { type PdfControlState } from "./PdfCanvasViewer";

const PDF_STREAM_BASE = "https://icse-file-proxy1.bybro.workers.dev/pdf";

type Status = "loading" | "ready" | "error";

export default function ViewerModal() {
  const { viewerFile, closeModal } = useUI();

  const [status, setStatus] = useState<Status>("loading");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [pdfControls, setPdfControls] = useState<PdfControlState | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!viewerFile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerFile, closeModal]);

  useEffect(() => {
    if (!viewerFile) return;

    let cancelled = false;
    const controller = new AbortController();

    const fileName = viewerFile.name.toLowerCase();
    const isHtml =
      fileName.endsWith(".html") || fileName.endsWith(".htm");
    const isPdf = fileName.endsWith(".pdf");

    setStatus("loading");
    setImageUrl(null);
    setHtmlContent(null);
    setErrorMessage("");
    setPdfControls(null);

    if (!viewerFile.driveId) {
      setErrorMessage("This file has no linked Drive document yet.");
      setStatus("error");

      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    if (isHtml) {
      fetch(
        `https://icse-file-proxy2.bybro.workers.dev/file?id=${encodeURIComponent(
          viewerFile.driveId
        )}`,
        { signal: controller.signal }
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(
              `Failed to load HTML (${response.status}).`
            );
          }

          return response.text();
        })
        .then((html) => {
          if (cancelled) return;

          setHtmlContent(html);
          setStatus("ready");
        })
        .catch((error: Error) => {
          if (cancelled || error.name === "AbortError") return;

          setErrorMessage(
            error.message || "Could not load HTML study material."
          );
          setStatus("error");
        });

      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    if (isPdf) {
      setStatus("ready");

      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    fetchFileEmbed(viewerFile.driveId)
      .then((result) => {
        if (cancelled) return;

        setImageUrl(result.url);
        setStatus("ready");
      })
      .catch((error: Error) => {
        if (cancelled) return;

        setErrorMessage(
          error.message || "Failed to load this file."
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [viewerFile]);

  if (!viewerFile) return null;

  const driveId = viewerFile.driveId;
  const fileName = viewerFile.name.toLowerCase();

  const isHtml =
    fileName.endsWith(".html") || fileName.endsWith(".htm");
  const isPdf = fileName.endsWith(".pdf");
  const isImage = isImageFile(viewerFile.name);

  const pdfStreamUrl = driveId
    ? `${PDF_STREAM_BASE}?id=${encodeURIComponent(driveId)}`
    : "#";

  const driveViewUrl = driveId
    ? `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/view`
    : "#";

  const driveDownloadUrl = driveId
    ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`
    : "#";

  const downloadHref =
    isHtml && driveId
      ? `https://icse-file-proxy2.bybro.workers.dev/file?id=${encodeURIComponent(driveId)}&download=true`
      : driveDownloadUrl;

  const htmlSrcDoc = htmlContent
    ? `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Study Notes</title>

  <link rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.8.1/github-markdown-light.min.css">

  <link rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">

  <style>
  :root {
    color-scheme: dark;
  }

  html {
    background: #0b1120 !important;
    color: #f1f5f9;
  }

  body {
    box-sizing: border-box;
    max-width: 980px;
    min-width: 200px;
    margin: 0 auto;
    padding: 24px;
    background: #0b1120 !important;
    color: #f1f5f9 !important;
    font-family: Arial, sans-serif;
  }

  .markdown-body {
    background: #0b1120 !important;
    color: #f1f5f9 !important;
  }

  h1, h2, h3, h4, h5, h6,
  p, li, span, div, strong, em, label {
    color: inherit;
  }

  a {
    color: #93c5fd !important;
  }

  table, th, td, hr {
    border-color: #334155 !important;
  }

  th {
    background: #1e293b !important;
    color: #f1f5f9 !important;
  }

  td {
    background: #0b1120 !important;
    color: #f1f5f9 !important;
  }

  blockquote {
    color: #cbd5e1 !important;
    border-left-color: #64748b !important;
  }

  pre, code {
    background: #1e293b !important;
    color: #f1f5f9 !important;
    border-color: #334155 !important;
  }

  img {
    max-width: 100%;
    height: auto;
  }

  pre {
    overflow-x: auto;
  }

  .katex,
  .katex-display {
    color: #f1f5f9 !important;
  }

  .katex-display {
    overflow-x: auto;
    overflow-y: hidden;
  }

  @media (max-width: 600px) {
    body {
      padding: 12px;
    }
  }
</style>
</head>
<body>
  <main class="markdown-body">${htmlContent}</main>

  <script defer
    src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js"></script>

  <script defer
    src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.querySelector('main'), {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '\\\\[', right: '\\\\]', display: true},
        {left: '\\\\(', right: '\\\\)', display: false}
      ],
      throwOnError: false
    });"></script>
</body>
</html>`
    : undefined;

  const actionsDisabled = status !== "ready" || !driveId;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={viewerFile.name}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-1.5 backdrop-blur-sm sm:p-2"
      onClick={closeModal}
    >
      {/* Viewport-locked modal frame: top bar, right sidebar, and bottom bar can NEVER overflow */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full max-w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        {/* ── TOP HEADER BAR (pinned in front, never stretches rightwards) ──── */}
        <header className="relative z-40 flex h-11 w-full max-w-full shrink-0 items-center justify-between gap-2 border-b border-border bg-slate-950/95 px-3 backdrop-blur-md">
          <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100 sm:text-sm">
            {viewerFile.name}
          </h2>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close viewer"
            title="Close (Esc)"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* ── MAIN BODY ──────────────────────────────────────────────────────── */}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Preview area padded for mobile bottom bar & desktop right sidebar */}
          <div className="h-full w-full min-h-0 min-w-0 overflow-hidden bg-midnight pb-[52px] md:pb-0 md:pr-28">
            {status === "loading" && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin text-accent-indigo-soft" />
                <p className="text-sm">Loading preview…</p>
              </div>
            )}

            {status === "error" && (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
                <AlertTriangle className="h-6 w-6 text-danger" />
                <p className="text-sm">{errorMessage}</p>
              </div>
            )}

            {status === "ready" && (
              <>
                {isHtml && htmlSrcDoc ? (
                  <iframe
                    srcDoc={htmlSrcDoc}
                    title={viewerFile.name}
                    className="h-full w-full border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin"
                  />
                ) : isImage && imageUrl ? (
                  <div className="flex h-full items-center justify-center overflow-auto p-4">
                    <img
                      src={imageUrl}
                      alt={viewerFile.name}
                      className="max-h-full max-w-full rounded-lg object-contain"
                    />
                  </div>
                ) : isPdf && driveId ? (
                  <PdfCanvasViewer
                    url={pdfStreamUrl}
                    fileName={viewerFile.name}
                    onControlsChange={setPdfControls}
                  />
                ) : (
                  <iframe
                    src={`https://drive.google.com/file/d/${encodeURIComponent(driveId!)}/preview`}
                    title={viewerFile.name}
                    className="h-full w-full border-0"
                  />
                )}
              </>
            )}
          </div>

          {/* ── DESKTOP / LAPTOP / TABLET SIDEBAR (pinned right, in front) ──── */}
          <aside className="absolute inset-y-0 right-0 z-30 hidden w-28 flex-col items-stretch gap-2.5 border-l border-border bg-slate-950/95 p-2.5 backdrop-blur-md md:flex">
            <a
              href={downloadHref}
              target="_blank"
              rel="noreferrer noopener"
              aria-disabled={actionsDisabled}
              onClick={(event) => {
                if (actionsDisabled) event.preventDefault();
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-accent-indigo to-accent-violet px-2.5 py-2 text-xs font-medium text-white transition-transform hover:scale-[1.02] ${
                actionsDisabled ? "pointer-events-none opacity-40" : ""
              }`}
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span>Download</span>
            </a>

            <a
              href={driveViewUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-disabled={actionsDisabled}
              onClick={(event) => {
                if (actionsDisabled) event.preventDefault();
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-surface-hover ${
                actionsDisabled ? "pointer-events-none opacity-40" : ""
              }`}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span>Drive</span>
            </a>

            {isPdf && pdfControls && (
              <>
                <div className="my-0.5 h-px w-full bg-border" />

                <button
                  type="button"
                  onClick={pdfControls.rotate}
                  title={`Rotate 90° (Currently ${pdfControls.rotation}°)`}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-slate-900 px-2.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-surface-hover"
                >
                  <RotateCw className="h-3.5 w-3.5 shrink-0 text-accent-indigo-soft" />
                  <span>Rotate</span>
                </button>

                <div className="flex items-center justify-between rounded-lg border border-border bg-slate-900 px-1 py-1 text-slate-200">
                  <button
                    type="button"
                    onClick={pdfControls.zoomOut}
                    disabled={pdfControls.scale <= 0.3}
                    title="Zoom out"
                    className="rounded p-1 hover:bg-surface-hover disabled:opacity-40"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[11px] font-semibold">
                    {Math.round(pdfControls.scale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={pdfControls.zoomIn}
                    disabled={pdfControls.scale >= 4}
                    title="Zoom in"
                    className="rounded p-1 hover:bg-surface-hover disabled:opacity-40"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border bg-slate-900 px-1 py-1 text-slate-200">
                  <button
                    type="button"
                    onClick={pdfControls.prevPage}
                    disabled={pdfControls.currentPage <= 1}
                    title="Previous page"
                    className="rounded p-1 hover:bg-surface-hover disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[11px] font-semibold">
                    {pdfControls.currentPage}/{pdfControls.numPages}
                  </span>
                  <button
                    type="button"
                    onClick={pdfControls.nextPage}
                    disabled={pdfControls.currentPage >= pdfControls.numPages}
                    title="Next page"
                    className="rounded p-1 hover:bg-surface-hover disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </aside>

          {/* ── MOBILE BOTTOM BAR (pinned bottom, in front) ────────────────── */}
          <div className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-border bg-slate-950/95 px-3 py-2 backdrop-blur-md md:hidden">
            {isPdf && pdfControls ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-slate-900 px-1.5 py-1 text-xs text-slate-200">
                  <button
                    type="button"
                    onClick={pdfControls.prevPage}
                    disabled={pdfControls.currentPage <= 1}
                    className="p-1 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-1 font-medium">
                    {pdfControls.currentPage}/{pdfControls.numPages}
                  </span>
                  <button
                    type="button"
                    onClick={pdfControls.nextPage}
                    disabled={pdfControls.currentPage >= pdfControls.numPages}
                    className="p-1 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={pdfControls.rotate}
                  title="Rotate 90°"
                  aria-label="Rotate"
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 active:bg-surface-hover"
                >
                  <RotateCw className="h-3.5 w-3.5 text-accent-indigo-soft" />
                  <span>Rotate</span>
                </button>
              </div>
            ) : (
              <div />
            )}

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <a
                href={driveViewUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Open in Drive"
                aria-disabled={actionsDisabled}
                onClick={(event) => {
                  if (actionsDisabled) event.preventDefault();
                }}
                className={`flex items-center justify-center rounded-lg border border-border p-2 text-slate-300 transition-colors hover:bg-surface-hover ${
                  actionsDisabled ? "pointer-events-none opacity-40" : ""
                }`}
              >
                <ExternalLink className="h-4 w-4" />
              </a>

              <a
                href={downloadHref}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Download"
                aria-disabled={actionsDisabled}
                onClick={(event) => {
                  if (actionsDisabled) event.preventDefault();
                }}
                className={`flex items-center justify-center rounded-lg bg-gradient-to-r from-accent-indigo to-accent-violet p-2 text-white transition-transform hover:scale-[1.02] ${
                  actionsDisabled ? "pointer-events-none opacity-40" : ""
                }`}
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}