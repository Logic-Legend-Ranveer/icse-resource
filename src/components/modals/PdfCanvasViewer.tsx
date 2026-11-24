import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AlertTriangle, Check, Copy, Loader2, Trash2 } from "lucide-react";
import {
  getFileHighlights,
  saveFileHighlights,
  type HighlightColor,
  type NormalizedRect,
  type PdfHighlight,
} from "../../lib/recentHistory";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDFJS_CDN_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}`;
const MAX_CANVAS_AREA = 16_000_000; // ~16 MP safe limit across desktop & mobile browsers
const WINDOW_RADIUS = 5; // Render 5 pages backward and 5 pages forward
const EVICT_AFTER_MS = 2 * 60 * 1000; // 2 minutes outside the ±5 window
const EVICT_CHECK_INTERVAL_MS = 15 * 1000; // Check every 15 seconds

export interface PdfControlState {
  ready: boolean;
  currentPage: number;
  numPages: number;
  scale: number;
  rotation: number;
  prevPage: () => void;
  nextPage: () => void;
  rotate: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface PdfCanvasViewerProps {
  url: string;
  fileName: string;
  fileId?: string;
  onControlsChange?: (controls: PdfControlState | null) => void;
}

interface PendingFocalAnchor {
  contentX: number;
  contentY: number;
  viewportX: number;
  viewportY: number;
  prevScale: number;
}

interface PageRenderMeta {
  scale: number;
  rotation: number;
  lastInWindowAt: number;
}

interface SelectionPopoverState {
  page: number;
  text: string;
  rects: NormalizedRect[];
  x: number;
  y: number;
}

interface ActiveHighlightPopover {
  id: string;
  x: number;
  y: number;
}

type PageSizeMap = Map<number, { width: number; height: number }>;
type PageMetaMap = Map<number, PageRenderMeta>;
type RenderTaskMap = Map<number, pdfjsLib.RenderTask>;
type TextLayerMap = Map<number, pdfjsLib.TextLayer>;

const HIGHLIGHT_SWATCHES: {
  color: HighlightColor;
  label: string;
  dotClass: string;
  overlayClass: string;
}[] = [
  {
    color: "yellow",
    label: "Yellow",
    dotClass: "bg-yellow-300 ring-yellow-400",
    overlayClass: "bg-yellow-300/55 hover:bg-yellow-300/75",
  },
  {
    color: "green",
    label: "Green",
    dotClass: "bg-emerald-300 ring-emerald-400",
    overlayClass: "bg-emerald-300/50 hover:bg-emerald-300/70",
  },
  {
    color: "pink",
    label: "Pink",
    dotClass: "bg-rose-300 ring-rose-400",
    overlayClass: "bg-rose-300/50 hover:bg-rose-300/70",
  },
];

function getOverlayClass(color: HighlightColor): string {
  return (
    HIGHLIGHT_SWATCHES.find((s) => s.color === color)?.overlayClass ??
    "bg-yellow-300/55 hover:bg-yellow-300/75"
  );
}

/** Convert a rect from current totalRotation (0/90/180/270) into canonical 0° normalized coordinates */
function toCanonicalRect(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  totalRotation: number
): NormalizedRect {
  const rot = ((totalRotation % 360) + 360) % 360;
  if (rot === 90) {
    return { x: ry, y: 1 - rx - rw, w: rh, h: rw };
  }
  if (rot === 180) {
    return { x: 1 - rx - rw, y: 1 - ry - rh, w: rw, h: rh };
  }
  if (rot === 270) {
    return { x: 1 - ry - rh, y: rx, w: rh, h: rw };
  }
  return { x: rx, y: ry, w: rw, h: rh };
}

/** Convert canonical 0° normalized coordinates into current totalRotation (0/90/180/270) */
function fromCanonicalRect(
  rect: NormalizedRect,
  totalRotation: number
): NormalizedRect {
  const rot = ((totalRotation % 360) + 360) % 360;
  if (rot === 90) {
    return {
      x: 1 - rect.y - rect.h,
      y: rect.x,
      w: rect.h,
      h: rect.w,
    };
  }
  if (rot === 180) {
    return {
      x: 1 - rect.x - rect.w,
      y: 1 - rect.y - rect.h,
      w: rect.w,
      h: rect.h,
    };
  }
  if (rot === 270) {
    return {
      x: rect.y,
      y: 1 - rect.x - rect.w,
      w: rect.h,
      h: rect.w,
    };
  }
  return rect;
}

/** Merge overlapping/adjacent highlight rectangles on the same line to avoid dark seams */
function mergeLineRects(rects: NormalizedRect[]): NormalizedRect[] {
  if (rects.length <= 1) return rects;
  const sorted = [...rects].sort((a, b) =>
    Math.abs(a.y - b.y) < 0.008 ? a.x - b.x : a.y - b.y
  );

  const merged: NormalizedRect[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    const sameLine =
      Math.abs(prev.y - curr.y) < Math.max(prev.h, curr.h) * 0.45 &&
      Math.abs(prev.h - curr.h) < Math.max(prev.h, curr.h) * 0.5;
    const overlapsOrTouches = curr.x <= prev.x + prev.w + 0.006;

    if (sameLine && overlapsOrTouches) {
      const right = Math.max(prev.x + prev.w, curr.x + curr.w);
      const top = Math.min(prev.y, curr.y);
      const bottom = Math.max(prev.y + prev.h, curr.y + curr.h);
      prev.x = Math.min(prev.x, curr.x);
      prev.y = top;
      prev.w = right - prev.x;
      prev.h = bottom - top;
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

export default function PdfCanvasViewer({
  url,
  fileName,
  fileId,
  onControlsChange,
}: PdfCanvasViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [userZoomed, setUserZoomed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState("");
  const [error, setError] = useState("");

  // Highlights state synced with icse_continue_history_v1 (last 4 files only)
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [selectionPopover, setSelectionPopover] =
    useState<SelectionPopoverState | null>(null);
  const [activeHighlightPopover, setActiveHighlightPopover] =
    useState<ActiveHighlightPopover | null>(null);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const textLayerRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Per-page unscaled sizes & intrinsic PDF page rotations
  const pageSizesRef = useRef<PageSizeMap>(new Map());
  const pageIntrinsicRotateRef = useRef(new Map());
  const defaultPageSizeRef = useRef<{ width: number; height: number }>({
    width: 595,
    height: 842,
  });

  // Tracks which pages currently have live pixels in RAM/GPU and when they were last in the ±5 window
  const renderedMetaRef = useRef<PageMetaMap>(new Map());
  const inFlightPagesRef = useRef<Set<number>>(new Set());
  const activeRenderTasksRef = useRef<RenderTaskMap>(new Map());
  const activeTextLayersRef = useRef<TextLayerMap>(new Map());

  const scaleRef = useRef<number>(1);
  const currentPageRef = useRef<number>(1);
  const rotationRef = useRef<number>(0);
  const pendingAnchorRef = useRef<PendingFocalAnchor | null>(null);

  // Resolve canonical file ID (matches item.driveId / item.id in icse_continue_history_v1)
  const resolvedFileId = useMemo(() => {
    if (fileId) return fileId;
    try {
      const parsed = new URL(url, window.location.origin);
      const idParam = parsed.searchParams.get("id");
      if (idParam) return idParam;
    } catch {
      // Fallback to fileName
    }
    return fileName;
  }, [fileId, url, fileName]);

  useEffect(() => {
    if (scale !== null) scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  const getPageBaseSize = (pageNum: number) =>
    pageSizesRef.current.get(pageNum) ?? defaultPageSizeRef.current;

  // Load saved highlights for this file (if it is among the last 4 files in browser cache)
  useEffect(() => {
    setHighlights(getFileHighlights(resolvedFileId));
    setSelectionPopover(null);
    setActiveHighlightPopover(null);
  }, [resolvedFileId]);

  const updateAndPersistHighlights = (
    updater: (prev: PdfHighlight[]) => PdfHighlight[]
  ) => {
    setHighlights((prev) => {
      const next = updater(prev);
      saveFileHighlights(resolvedFileId, fileName, next);
      return next;
    });
  };

  // 1. Load PDF document with HTTP Range streaming & JBIG2/CCITT WASM decoder assets enabled
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadProgress("");
    setError("");
    setPdfDoc(null);
    setScale(null);
    setCurrentPage(1);
    setRotation(0);
    setUserZoomed(false);

    pageSizesRef.current.clear();
    pageIntrinsicRotateRef.current.clear();
    renderedMetaRef.current.clear();
    inFlightPagesRef.current.clear();
    activeRenderTasksRef.current.forEach((task) => task.cancel());
    activeRenderTasksRef.current.clear();
    activeTextLayersRef.current.forEach((tl) => tl.cancel());
    activeTextLayersRef.current.clear();
    pendingAnchorRef.current = null;

    const loadingTask = pdfjsLib.getDocument({
      url,
      withCredentials: false,
      disableStream: false,
      disableRange: false,
      disableAutoFetch: true,
      rangeChunkSize: 524288,
      wasmUrl: `${PDFJS_CDN_BASE}/wasm/`,
      cMapUrl: `${PDFJS_CDN_BASE}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_CDN_BASE}/standard_fonts/`,
      maxImageSize: -1,
    });

    loadingTask.onProgress = ({
      loaded,
      total,
    }: {
      loaded: number;
      total: number;
    }) => {
      if (cancelled) return;
      const loadedMb = (loaded / (1024 * 1024)).toFixed(1);
      if (total > 0) {
        const totalMb = (total / (1024 * 1024)).toFixed(1);
        setLoadProgress(`${loadedMb} MB / ${totalMb} MB`);
      } else {
        setLoadProgress(`${loadedMb} MB loaded`);
      }
    };

    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) return;

        const firstPage = await doc.getPage(1);
        if (cancelled) {
          firstPage.cleanup();
          return;
        }
        const normalizedRotate = ((firstPage.rotate % 360) + 360) % 360;
        const vp = firstPage.getViewport({
          scale: 1,
          rotation: normalizedRotate,
        });
        const firstSize = { width: vp.width, height: vp.height };
        defaultPageSizeRef.current = firstSize;
        pageSizesRef.current.set(1, firstSize);
        pageIntrinsicRotateRef.current.set(1, normalizedRotate);
        firstPage.cleanup();

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load PDF document.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      activeRenderTasksRef.current.forEach((task) => task.cancel());
      activeRenderTasksRef.current.clear();
      activeTextLayersRef.current.forEach((tl) => tl.cancel());
      activeTextLayersRef.current.clear();
      loadingTask.destroy();
    };
  }, [url]);

  // 2. Measure exact container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);

    return () => observer.disconnect();
  }, [loading]);

  // 3. Auto fit-to-width on initial load or rotation change
  useEffect(() => {
    if (!pdfDoc || containerWidth <= 0 || userZoomed) return;

    const base = getPageBaseSize(1);
    const isQuarterTurn = (((rotation % 360) + 360) % 360) % 180 !== 0;
    const unscaledWidth = isQuarterTurn ? base.height : base.width;

    const horizontalPadding = window.innerWidth < 768 ? 16 : 32;
    const availableWidth = Math.max(200, containerWidth - horizontalPadding);
    const fitScale = availableWidth / unscaledWidth;

    const initialScale =
      window.innerWidth < 768
        ? Math.max(0.25, Math.min(fitScale, 1.5))
        : Math.max(0.4, Math.min(fitScale, 1.15));

    setScale(Number(initialScale.toFixed(3)));
  }, [pdfDoc, rotation, containerWidth, userZoomed]);

  // Helper: capture exact focal point relative to contentRef
  const captureFocalAnchor = (
    viewportX: number,
    viewportY: number,
    prevScale: number,
    overrideScrollLeft?: number,
    overrideScrollTop?: number
  ): PendingFocalAnchor | null => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return null;

    const containerRect = container.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();

    const currentScrollLeft = overrideScrollLeft ?? container.scrollLeft;
    const currentScrollTop = overrideScrollTop ?? container.scrollTop;

    const contentOffsetLeft =
      contentRect.left - containerRect.left + container.scrollLeft;
    const contentOffsetTop =
      contentRect.top - containerRect.top + container.scrollTop;

    return {
      contentX: currentScrollLeft + viewportX - contentOffsetLeft,
      contentY: currentScrollTop + viewportY - contentOffsetTop,
      viewportX,
      viewportY,
      prevScale,
    };
  };

  // 4. Focal-point pinch zoom (touch & trackpad), Ctrl+Wheel cursor zoom, & double-tap zoom
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    let isPinching = false;
    let startDist = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let startMidX = 0;
    let startMidY = 0;
    let lastMidX = 0;
    let lastMidY = 0;
    let liveRatio = 1;

    let wheelTimer: number | undefined;
    let wheelAccumRatio = 1;
    let wheelOriginX = 0;
    let wheelOriginY = 0;
    let wheelStartScrollLeft = 0;
    let wheelStartScrollTop = 0;
    let wheelStartContentOffsetLeft = 0;
    let wheelStartContentOffsetTop = 0;

    let lastTapTime = 0;

    const getDistance = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const applyLiveTransform = (
      ratio: number,
      anchorContentX: number,
      anchorContentY: number,
      targetViewportX: number,
      targetViewportY: number,
      baseScrollLeft: number,
      baseScrollTop: number,
      baseContentOffsetLeft: number,
      baseContentOffsetTop: number
    ) => {
      const contentViewportLeft = baseContentOffsetLeft - baseScrollLeft;
      const contentViewportTop = baseContentOffsetTop - baseScrollTop;

      const translateX =
        targetViewportX - contentViewportLeft - anchorContentX * ratio;
      const translateY =
        targetViewportY - contentViewportTop - anchorContentY * ratio;

      content.style.transformOrigin = "0 0";
      content.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${ratio})`;
    };

    const commitZoom = (
      ratio: number,
      anchorContentX: number,
      anchorContentY: number,
      targetViewportX: number,
      targetViewportY: number
    ) => {
      const currentScale = scaleRef.current;
      const nextScale = Math.max(
        0.3,
        Math.min(Number((currentScale * ratio).toFixed(3)), 4)
      );

      pendingAnchorRef.current = {
        contentX: anchorContentX,
        contentY: anchorContentY,
        viewportX: targetViewportX,
        viewportY: targetViewportY,
        prevScale: currentScale,
      };

      content.style.transform = "";
      content.style.transformOrigin = "";
      setUserZoomed(true);
      setScale(nextScale);
    };

    let pinchContentOffsetLeft = 0;
    let pinchContentOffsetTop = 0;
    let pinchAnchorContentX = 0;
    let pinchAnchorContentY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isPinching = true;
        liveRatio = 1;
        startDist = getDistance(e.touches[0], e.touches[1]);

        const rect = container.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();

        startMidX =
          (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        startMidY =
          (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        lastMidX = startMidX;
        lastMidY = startMidY;

        startScrollLeft = container.scrollLeft;
        startScrollTop = container.scrollTop;

        pinchContentOffsetLeft =
          contentRect.left - rect.left + startScrollLeft;
        pinchContentOffsetTop =
          contentRect.top - rect.top + startScrollTop;

        pinchAnchorContentX =
          startScrollLeft + startMidX - pinchContentOffsetLeft;
        pinchAnchorContentY =
          startScrollTop + startMidY - pinchContentOffsetTop;
      } else if (e.touches.length === 1) {
        const now = Date.now();
        // Only trigger double-tap zoom if user did not select text
        const sel = window.getSelection();
        const hasSelection = Boolean(sel && sel.toString().trim().length > 0);
        if (!hasSelection && now - lastTapTime < 280) {
          const rect = container.getBoundingClientRect();
          const tapX = e.touches[0].clientX - rect.left;
          const tapY = e.touches[0].clientY - rect.top;
          const anchor = captureFocalAnchor(tapX, tapY, scaleRef.current);
          if (anchor) {
            const targetRatio = scaleRef.current > 1.2 ? 0.65 : 1.75;
            commitZoom(
              targetRatio,
              anchor.contentX,
              anchor.contentY,
              tapX,
              tapY
            );
          }
          lastTapTime = 0;
        } else {
          lastTapTime = now;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPinching || e.touches.length !== 2 || startDist <= 0) return;
      e.preventDefault();

      const currentDist = getDistance(e.touches[0], e.touches[1]);
      const rect = container.getBoundingClientRect();
      lastMidX =
        (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      lastMidY =
        (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

      const minRatio = 0.3 / scaleRef.current;
      const maxRatio = 4 / scaleRef.current;
      liveRatio = Math.max(minRatio, Math.min(currentDist / startDist, maxRatio));

      applyLiveTransform(
        liveRatio,
        pinchAnchorContentX,
        pinchAnchorContentY,
        lastMidX,
        lastMidY,
        startScrollLeft,
        startScrollTop,
        pinchContentOffsetLeft,
        pinchContentOffsetTop
      );
    };

    const onTouchEnd = () => {
      if (!isPinching) return;
      isPinching = false;

      if (Math.abs(liveRatio - 1) > 0.01) {
        commitZoom(
          liveRatio,
          pinchAnchorContentX,
          pinchAnchorContentY,
          lastMidX,
          lastMidY
        );
      } else {
        content.style.transform = "";
        content.style.transformOrigin = "";
      }
      liveRatio = 1;
    };

    let wheelAnchorContentX = 0;
    let wheelAnchorContentY = 0;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      if (wheelTimer === undefined) {
        const contentRect = content.getBoundingClientRect();
        wheelAccumRatio = 1;
        wheelOriginX = cursorX;
        wheelOriginY = cursorY;
        wheelStartScrollLeft = container.scrollLeft;
        wheelStartScrollTop = container.scrollTop;
        wheelStartContentOffsetLeft =
          contentRect.left - rect.left + wheelStartScrollLeft;
        wheelStartContentOffsetTop =
          contentRect.top - rect.top + wheelStartScrollTop;
        wheelAnchorContentX =
          wheelStartScrollLeft + wheelOriginX - wheelStartContentOffsetLeft;
        wheelAnchorContentY =
          wheelStartScrollTop + wheelOriginY - wheelStartContentOffsetTop;
      } else {
        wheelOriginX = cursorX;
        wheelOriginY = cursorY;
      }

      const step = Math.exp(-e.deltaY * 0.008);
      const minRatio = 0.3 / scaleRef.current;
      const maxRatio = 4 / scaleRef.current;
      wheelAccumRatio = Math.max(
        minRatio,
        Math.min(wheelAccumRatio * step, maxRatio)
      );

      applyLiveTransform(
        wheelAccumRatio,
        wheelAnchorContentX,
        wheelAnchorContentY,
        wheelOriginX,
        wheelOriginY,
        wheelStartScrollLeft,
        wheelStartScrollTop,
        wheelStartContentOffsetLeft,
        wheelStartContentOffsetTop
      );

      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheelTimer = undefined;
        commitZoom(
          wheelAccumRatio,
          wheelAnchorContentX,
          wheelAnchorContentY,
          wheelOriginX,
          wheelOriginY
        );
        wheelAccumRatio = 1;
      }, 120);
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);
    container.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.clearTimeout(wheelTimer);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      container.removeEventListener("wheel", onWheel);
    };
  }, [loading]);

  // 5A. Synchronously resize ALL page wrappers, canvases, & text layers BEFORE paint
  useLayoutEffect(() => {
    if (!pdfDoc || scale === null) return;
    const container = containerRef.current;
    const content = contentRef.current;

    const isQuarterTurn = (((rotation % 360) + 360) % 360) % 180 !== 0;

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const wrapper = pageWrapperRefs.current[pageNum - 1];
      const canvas = canvasRefs.current[pageNum - 1];
      const textLayerDiv = textLayerRefs.current[pageNum - 1];

      const base = getPageBaseSize(pageNum);
      const w = Math.floor((isQuarterTurn ? base.height : base.width) * scale);
      const h = Math.floor((isQuarterTurn ? base.width : base.height) * scale);

      if (wrapper) {
        wrapper.style.width = `${w}px`;
        wrapper.style.height = `${h}px`;
      }
      if (canvas) {
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      if (textLayerDiv) {
        textLayerDiv.style.width = `${w}px`;
        textLayerDiv.style.height = `${h}px`;
        textLayerDiv.style.setProperty("--total-scale-factor", String(scale));
      }
    }

    const anchor = pendingAnchorRef.current;
    if (anchor && container && content) {
      const ratio = scale / anchor.prevScale;
      const containerRect = container.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();

      const newContentOffsetLeft =
        contentRect.left - containerRect.left + container.scrollLeft;
      const newContentOffsetTop =
        contentRect.top - containerRect.top + container.scrollTop;

      const targetScrollLeft =
        newContentOffsetLeft + anchor.contentX * ratio - anchor.viewportX;
      const targetScrollTop =
        newContentOffsetTop + anchor.contentY * ratio - anchor.viewportY;

      container.scrollLeft = Math.max(0, targetScrollLeft);
      container.scrollTop = Math.max(0, targetScrollTop);
      pendingAnchorRef.current = null;
    }
  }, [pdfDoc, scale, rotation]);

  // 5B. Windowed Rendering: Render Canvas + Selectable TextLayer for [currentPage - 5 .. currentPage + 5]
  useEffect(() => {
    if (!pdfDoc || scale === null) return;
    let cancelled = false;

    const minPage = Math.max(1, currentPage - WINDOW_RADIUS);
    const maxPage = Math.min(pdfDoc.numPages, currentPage + WINDOW_RADIUS);
    const now = Date.now();

    for (let p = minPage; p <= maxPage; p++) {
      const existing = renderedMetaRef.current.get(p);
      if (existing) {
        existing.lastInWindowAt = now;
      }
    }

    // Cancel any in-flight render tasks outside the ±5 window
    activeRenderTasksRef.current.forEach((task, pageNum) => {
      if (pageNum < minPage || pageNum > maxPage) {
        task.cancel();
        activeRenderTasksRef.current.delete(pageNum);
        activeTextLayersRef.current.get(pageNum)?.cancel();
        activeTextLayersRef.current.delete(pageNum);
        inFlightPagesRef.current.delete(pageNum);
      }
    });

    const orderedPages: number[] = [currentPage];
    for (let offset = 1; offset <= WINDOW_RADIUS; offset++) {
      if (currentPage + offset <= maxPage) orderedPages.push(currentPage + offset);
      if (currentPage - offset >= minPage) orderedPages.push(currentPage - offset);
    }

    const renderPage = async (pageNum: number) => {
      const existing = renderedMetaRef.current.get(pageNum);
      if (
        existing &&
        existing.scale === scale &&
        existing.rotation === rotation
      ) {
        existing.lastInWindowAt = Date.now();
        return;
      }

      const prevTask = activeRenderTasksRef.current.get(pageNum);
      if (prevTask) {
        prevTask.cancel();
        activeRenderTasksRef.current.delete(pageNum);
      }
      const prevTextLayer = activeTextLayersRef.current.get(pageNum);
      if (prevTextLayer) {
        prevTextLayer.cancel();
        activeTextLayersRef.current.delete(pageNum);
      }

      inFlightPagesRef.current.add(pageNum);

      try {
        const wrapper = pageWrapperRefs.current[pageNum - 1];
        const canvas = canvasRefs.current[pageNum - 1];
        const textLayerDiv = textLayerRefs.current[pageNum - 1];
        if (!canvas || cancelled) return;

        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const normalizedRotate = ((page.rotate % 360) + 360) % 360;
        pageIntrinsicRotateRef.current.set(pageNum, normalizedRotate);

        const unscaledVp = page.getViewport({
          scale: 1,
          rotation: normalizedRotate,
        });
        pageSizesRef.current.set(pageNum, {
          width: unscaledVp.width,
          height: unscaledVp.height,
        });

        const totalRotation = (((page.rotate + rotation) % 360) + 360) % 360;
        const viewport = page.getViewport({ scale, rotation: totalRotation });

        const rawDpr = window.devicePixelRatio || 1;
        const unscaledPixels = viewport.width * viewport.height;
        const outputScale = Math.min(
          rawDpr,
          Math.sqrt(MAX_CANVAS_AREA / Math.max(1, unscaledPixels))
        );

        const context = canvas.getContext("2d");
        if (!context) return;

        const cssWidth = Math.floor(viewport.width);
        const cssHeight = Math.floor(viewport.height);

        if (wrapper) {
          wrapper.style.width = `${cssWidth}px`;
          wrapper.style.height = `${cssHeight}px`;
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const transform =
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : undefined;

        const task = page.render({
          canvas,
          canvasContext: context,
          transform,
          viewport,
        });
        activeRenderTasksRef.current.set(pageNum, task);

        await task.promise;
        if (cancelled) return;

        // Render selectable/copyable DOM TextLayer over the canvas
        if (textLayerDiv) {
          textLayerDiv.innerHTML = "";
          textLayerDiv.style.width = `${cssWidth}px`;
          textLayerDiv.style.height = `${cssHeight}px`;
          textLayerDiv.style.setProperty("--total-scale-factor", String(scale));

          const textContent = await page.getTextContent();
          if (cancelled) return;

          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
          });
          activeTextLayersRef.current.set(pageNum, textLayer);
          await textLayer.render();
          activeTextLayersRef.current.delete(pageNum);
        }

        if (!cancelled) {
          renderedMetaRef.current.set(pageNum, {
            scale,
            rotation,
            lastInWindowAt: Date.now(),
          });
        }
      } catch (err: unknown) {
        if (
          (err as { name?: string })?.name !== "RenderingCancelledException"
        ) {
          console.error(`Error rendering page ${pageNum}:`, err);
        }
      } finally {
        activeRenderTasksRef.current.delete(pageNum);
        activeTextLayersRef.current.delete(pageNum);
        inFlightPagesRef.current.delete(pageNum);
      }
    };

    (async () => {
      for (const pageNum of orderedPages) {
        if (cancelled) return;
        await renderPage(pageNum);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, scale, rotation]);

  // 5C. 2-Minute RAM & GPU Eviction Sweep for pages outside [currentPage - 5 .. currentPage + 5]
  useEffect(() => {
    if (!pdfDoc) return;

    const evictStalePages = async () => {
      const now = Date.now();
      const activePage = currentPageRef.current;
      const minKeep = Math.max(1, activePage - WINDOW_RADIUS);
      const maxKeep = Math.min(pdfDoc.numPages, activePage + WINDOW_RADIUS);

      for (const [pageNum, meta] of renderedMetaRef.current.entries()) {
        if (pageNum >= minKeep && pageNum <= maxKeep) {
          meta.lastInWindowAt = now;
          continue;
        }

        if (now - meta.lastInWindowAt >= EVICT_AFTER_MS) {
          const canvas = canvasRefs.current[pageNum - 1];
          if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 0;
            canvas.height = 0;
          }

          const textLayerDiv = textLayerRefs.current[pageNum - 1];
          if (textLayerDiv) {
            textLayerDiv.innerHTML = "";
          }

          try {
            const page = await pdfDoc.getPage(pageNum);
            page.cleanup();
          } catch {
            // Ignore if document is already destroyed
          }

          renderedMetaRef.current.delete(pageNum);
        }
      }
    };

    const intervalId = window.setInterval(
      evictStalePages,
      EVICT_CHECK_INTERVAL_MS
    );
    return () => window.clearInterval(intervalId);
  }, [pdfDoc]);

  // 6. Track text selections inside PDF pages to show Highlight + Copy popover
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let selectionTimer: number | undefined;

    const evaluateSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSelectionPopover(null);
        return;
      }

      const rawText = selection.toString().trim();
      if (!rawText) {
        setSelectionPopover(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      const ancestorEl =
        ancestor.nodeType === Node.ELEMENT_NODE
          ? (ancestor as Element)
          : ancestor.parentElement;

      if (!ancestorEl || !container.contains(ancestorEl)) {
        setSelectionPopover(null);
        return;
      }

      // Find which page wrapper owns this selection
      let matchedPage = -1;
      let pageEl: HTMLDivElement | null = null;
      for (let i = 0; i < pageWrapperRefs.current.length; i++) {
        const candidate = pageWrapperRefs.current[i];
        if (candidate && candidate.contains(ancestorEl)) {
          matchedPage = i + 1;
          pageEl = candidate;
          break;
        }
      }

      if (matchedPage === -1 || !pageEl) {
        setSelectionPopover(null);
        return;
      }

      const pageRect = pageEl.getBoundingClientRect();
      if (pageRect.width <= 0 || pageRect.height <= 0) return;

      const intrinsicRotate =
        pageIntrinsicRotateRef.current.get(matchedPage) ?? 0;
      const totalRotation =
        (((intrinsicRotate + rotationRef.current) % 360) + 360) % 360;

      const clientRects = Array.from(range.getClientRects()).filter(
        (r) => r.width >= 2 && r.height >= 2
      );
      if (clientRects.length === 0) {
        setSelectionPopover(null);
        return;
      }

      const canonicalRects = mergeLineRects(
        clientRects.map((r) => {
          const rx = Math.max(0, (r.left - pageRect.left) / pageRect.width);
          const ry = Math.max(0, (r.top - pageRect.top) / pageRect.height);
          const rw = Math.min(1 - rx, r.width / pageRect.width);
          const rh = Math.min(1 - ry, r.height / pageRect.height);
          return toCanonicalRect(rx, ry, rw, rh, totalRotation);
        })
      );

      const rangeRect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Position floating popover safely inside container bounds
      const popoverHalfWidth = 108;
      const rawCenterX =
        rangeRect.left - containerRect.left + rangeRect.width / 2;
      const clampedX = Math.max(
        popoverHalfWidth + 8,
        Math.min(rawCenterX, containerRect.width - popoverHalfWidth - 8)
      );

      const spaceAbove = rangeRect.top - containerRect.top;
      const posY =
        spaceAbove > 52
          ? rangeRect.top - containerRect.top - 44
          : rangeRect.bottom - containerRect.top + 8;

      setActiveHighlightPopover(null);
      setCopiedFeedback(false);
      setSelectionPopover({
        page: matchedPage,
        text: rawText,
        rects: canonicalRects,
        x: clampedX,
        y: Math.max(8, Math.min(posY, containerRect.height - 48)),
      });
    };

    const scheduleEvaluation = () => {
      window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(evaluateSelection, 80);
    };

    document.addEventListener("selectionchange", scheduleEvaluation);
    container.addEventListener("mouseup", scheduleEvaluation);
    container.addEventListener("touchend", scheduleEvaluation);

    return () => {
      window.clearTimeout(selectionTimer);
      document.removeEventListener("selectionchange", scheduleEvaluation);
      container.removeEventListener("mouseup", scheduleEvaluation);
      container.removeEventListener("touchend", scheduleEvaluation);
    };
  }, [loading]);

  // 7. Push control handlers up to ViewerModal
  useEffect(() => {
    if (!onControlsChange) return;

    if (loading || error || !pdfDoc || scale === null) {
      onControlsChange(null);
      return;
    }

    const scrollToPage = (targetPage: number) => {
      const clamped = Math.max(1, Math.min(targetPage, numPages));
      setCurrentPage(clamped);
      const targetWrapper = pageWrapperRefs.current[clamped - 1];
      targetWrapper?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const stepZoom = (factor: number) => {
      const container = containerRef.current;
      const currentScale = scaleRef.current;
      const nextScale = Math.max(
        0.3,
        Math.min(Number((currentScale * factor).toFixed(3)), 4)
      );
      if (container) {
        const midX = container.clientWidth / 2;
        const midY = container.clientHeight / 2;
        pendingAnchorRef.current = captureFocalAnchor(
          midX,
          midY,
          currentScale
        );
      }
      setUserZoomed(true);
      setScale(nextScale);
    };

    onControlsChange({
      ready: true,
      currentPage,
      numPages,
      scale,
      rotation,
      prevPage: () => scrollToPage(currentPage - 1),
      nextPage: () => scrollToPage(currentPage + 1),
      rotate: () => {
        pendingAnchorRef.current = null;
        setSelectionPopover(null);
        setActiveHighlightPopover(null);
        setUserZoomed(false);
        setRotation((prev) => (prev + 90) % 360);
      },
      zoomIn: () => stepZoom(1.2),
      zoomOut: () => stepZoom(0.83),
    });
  }, [
    loading,
    error,
    pdfDoc,
    scale,
    rotation,
    currentPage,
    numPages,
    onControlsChange,
  ]);

  useEffect(() => {
    return () => onControlsChange?.(null);
  }, [onControlsChange]);

  const handleApplyHighlight = (color: HighlightColor) => {
    if (!selectionPopover) return;
    const newHighlight: PdfHighlight = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      page: selectionPopover.page,
      text: selectionPopover.text,
      color,
      rects: selectionPopover.rects,
      createdAt: Date.now(),
    };

    updateAndPersistHighlights((prev) => [...prev, newHighlight]);
    window.getSelection()?.removeAllRanges();
    setSelectionPopover(null);
  };

  const handleCopySelection = async () => {
    if (!selectionPopover) return;
    try {
      await navigator.clipboard.writeText(selectionPopover.text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = selectionPopover.text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedFeedback(true);
    window.setTimeout(() => {
      setCopiedFeedback(false);
      window.getSelection()?.removeAllRanges();
      setSelectionPopover(null);
    }, 650);
  };

  const handleDeleteHighlight = (highlightId: string) => {
    updateAndPersistHighlights((prev) =>
      prev.filter((item) => item.id !== highlightId)
    );
    setActiveHighlightPopover(null);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-accent-indigo-soft" />
        <p className="text-sm">Rendering {fileName}…</p>
        {loadProgress && (
          <p className="text-xs text-slate-400">{loadProgress}</p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
        <AlertTriangle className="h-6 w-6 text-danger" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full min-w-0 max-w-full">
      {/* Scoped PDF.js TextLayer styling so transparent selectable text aligns cleanly over canvas */}
      <style>{`
        .pdf-text-layer {
          position: absolute;
          inset: 0;
          overflow: hidden;
          line-height: 1;
          text-size-adjust: none;
          forced-color-adjust: none;
          transform-origin: 0 0;
          user-select: text;
          -webkit-user-select: text;
        }
        .pdf-text-layer span,
        .pdf-text-layer br {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
        }
        .pdf-text-layer ::selection {
          background: rgba(99, 102, 241, 0.32);
        }
      `}</style>

      {/* Floating Selection Toolbar: Highlight Swatches + Copy */}
      {selectionPopover && (
        <div
          style={{
            left: `${selectionPopover.x}px`,
            top: `${selectionPopover.y}px`,
            transform: "translateX(-50%)",
          }}
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-30 flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 text-xs text-slate-100 shadow-xl backdrop-blur"
        >
          {HIGHLIGHT_SWATCHES.map((swatch) => (
            <button
              key={swatch.color}
              type="button"
              onClick={() => handleApplyHighlight(swatch.color)}
              title={`Highlight ${swatch.label}`}
              className={`h-4 w-4 rounded-full ring-1 transition-transform hover:scale-115 ${swatch.dotClass}`}
            />
          ))}
          <span className="mx-0.5 h-3.5 w-px bg-slate-700" />
          <button
            type="button"
            onClick={handleCopySelection}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-slate-100 transition-colors hover:bg-slate-800"
          >
            {copiedFeedback ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-accent-indigo-soft" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Floating Delete Popover when clicking an existing highlight */}
      {activeHighlightPopover && (
        <div
          style={{
            left: `${activeHighlightPopover.x}px`,
            top: `${activeHighlightPopover.y}px`,
            transform: "translateX(-50%)",
          }}
          className="absolute z-30 flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-xs text-slate-100 shadow-xl backdrop-blur"
        >
          <button
            type="button"
            onClick={() => handleDeleteHighlight(activeHighlightPopover.id)}
            className="flex items-center gap-1 font-medium text-rose-300 hover:text-rose-200"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Remove highlight</span>
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        style={{ touchAction: "pan-x pan-y" }}
        className="h-full w-full min-w-0 max-w-full overflow-auto bg-midnight p-2 md:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget || e.target === contentRef.current) {
            setActiveHighlightPopover(null);
          }
        }}
        onScroll={() => {
          setSelectionPopover(null);
          setActiveHighlightPopover(null);

          if (!containerRef.current) return;
          const containerTop = containerRef.current.getBoundingClientRect().top;
          let closestPage = 1;
          let minDistance = Infinity;

          pageWrapperRefs.current.forEach((wrapper, idx) => {
            if (!wrapper) return;
            const dist = Math.abs(
              wrapper.getBoundingClientRect().top - containerTop - 16
            );
            if (dist < minDistance) {
              minDistance = dist;
              closestPage = idx + 1;
            }
          });
          setCurrentPage(closestPage);
        }}
      >
        <div
          ref={contentRef}
          className="mx-auto flex w-max flex-col items-center gap-3 will-change-transform md:gap-4"
        >
          {Array.from({ length: numPages }, (_, index) => {
            const pageNum = index + 1;
            const pageHighlights = highlights.filter((h) => h.page === pageNum);
            const intrinsicRotate =
              pageIntrinsicRotateRef.current.get(pageNum) ?? 0;
            const totalRotation =
              (((intrinsicRotate + rotation) % 360) + 360) % 360;

            return (
              <div
                key={index}
                ref={(el) => {
                  pageWrapperRefs.current[index] = el;
                }}
                className="relative select-text overflow-hidden rounded bg-white shadow-lg"
              >
                {/* 1. Rendered PDF Page Bitmap */}
                <canvas
                  ref={(el) => {
                    canvasRefs.current[index] = el;
                  }}
                  className="block"
                />

                {/* 2. Saved Highlights Overlay (mix-blend-multiply keeps underlying text crisp) */}
                {pageHighlights.length > 0 && (
                  <div className="pointer-events-none absolute inset-0 z-10 mix-blend-multiply">
                    {pageHighlights.map((hl) =>
                      hl.rects.map((canonicalRect, rIdx) => {
                        const rect = fromCanonicalRect(
                          canonicalRect,
                          totalRotation
                        );
                        return (
                          <div
                            key={`${hl.id}-${rIdx}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const container = containerRef.current;
                              if (!container) return;
                              const containerRect =
                                container.getBoundingClientRect();
                              const targetRect =
                                e.currentTarget.getBoundingClientRect();
                              const rawX =
                                targetRect.left -
                                containerRect.left +
                                targetRect.width / 2;
                              const rawY =
                                targetRect.top - containerRect.top - 36;
                              setSelectionPopover(null);
                              setActiveHighlightPopover({
                                id: hl.id,
                                x: Math.max(
                                  80,
                                  Math.min(rawX, containerRect.width - 80)
                                ),
                                y: Math.max(8, rawY),
                              });
                            }}
                            style={{
                              left: `${rect.x * 100}%`,
                              top: `${rect.y * 100}%`,
                              width: `${rect.w * 100}%`,
                              height: `${rect.h * 100}%`,
                            }}
                            className={`pointer-events-auto absolute cursor-pointer rounded-[2px] transition-colors ${getOverlayClass(
                              hl.color
                            )}`}
                          />
                        );
                      })
                    )}
                  </div>
                )}

                {/* 3. Transparent Selectable & Copyable PDF.js TextLayer */}
                <div
                  ref={(el) => {
                    textLayerRefs.current[index] = el;
                  }}
                  className="pdf-text-layer z-20"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}