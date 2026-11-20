import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AlertTriangle, Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

type PageSizeMap = Map<number, { width: number; height: number }>;
type PageMetaMap = Map<number, PageRenderMeta>;
type RenderTaskMap = Map<number, pdfjsLib.RenderTask>;

export default function PdfCanvasViewer({
  url,
  fileName,
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Per-page unscaled sizes (lazy-populated as pages are visited, falling back to page 1 size)
  const pageSizesRef = useRef<PageSizeMap>(new Map());
  const defaultPageSizeRef = useRef<{ width: number; height: number }>({
    width: 595,
    height: 842,
  });

  // Tracks which pages currently have live pixels in RAM/GPU and when they were last in the ±5 window
  const renderedMetaRef = useRef<PageMetaMap>(new Map());
  const inFlightPagesRef = useRef<Set<number>>(new Set());
  const activeRenderTasksRef = useRef<RenderTaskMap>(new Map());

  const scaleRef = useRef<number>(1);
  const currentPageRef = useRef<number>(1);
  const rotationRef = useRef<number>(0);
  const pendingAnchorRef = useRef<PendingFocalAnchor | null>(null);

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

  // 1. Load PDF document with HTTP Range streaming enabled (does NOT download full 75 MB upfront)
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
    renderedMetaRef.current.clear();
    inFlightPagesRef.current.clear();
    activeRenderTasksRef.current.forEach((task) => task.cancel());
    activeRenderTasksRef.current.clear();
    pendingAnchorRef.current = null;

    const loadingTask = pdfjsLib.getDocument({
      url,
      withCredentials: false,
      disableStream: false,
      disableRange: false,
      disableAutoFetch: true, // Only fetch byte ranges for requested pages (±5 window)
      rangeChunkSize: 524288, // 512 KB chunks = 8x fewer Drive API round trips
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

        // Only inspect Page 1 on startup so Drive is never queried for pages 2..N yet
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

  // 3. Auto fit-to-width on initial load or rotation change (uses cached Page 1 size—zero extra network calls)
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

  // Helper: capture exact focal point relative to contentRef (accounts for padding & mx-auto)
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
        if (now - lastTapTime < 280) {
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

  // 5A. Synchronously resize ALL canvas CSS placeholders & restore exact focal scroll BEFORE paint
  useLayoutEffect(() => {
    if (!pdfDoc || scale === null) return;
    const container = containerRef.current;
    const content = contentRef.current;

    const isQuarterTurn = (((rotation % 360) + 360) % 360) % 180 !== 0;

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const canvas = canvasRefs.current[pageNum - 1];
      if (!canvas) continue;

      const base = getPageBaseSize(pageNum);
      const w = (isQuarterTurn ? base.height : base.width) * scale;
      const h = (isQuarterTurn ? base.width : base.height) * scale;

      canvas.style.width = `${Math.floor(w)}px`;
      canvas.style.height = `${Math.floor(h)}px`;
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

  // 5B. Windowed Rendering: Only fetch & render [currentPage - 5 .. currentPage + 5]
  useEffect(() => {
    if (!pdfDoc || scale === null) return;
    let cancelled = false;

    const minPage = Math.max(1, currentPage - WINDOW_RADIUS);
    const maxPage = Math.min(pdfDoc.numPages, currentPage + WINDOW_RADIUS);
    const now = Date.now();

    // Update last-seen timestamp for any already-rendered pages still inside the ±5 window
    for (let p = minPage; p <= maxPage; p++) {
      const existing = renderedMetaRef.current.get(p);
      if (existing) {
        existing.lastInWindowAt = now;
      }
    }

    // Cancel any in-flight render tasks that are now outside the ±5 window
    activeRenderTasksRef.current.forEach((task, pageNum) => {
      if (pageNum < minPage || pageNum > maxPage) {
        task.cancel();
        activeRenderTasksRef.current.delete(pageNum);
        inFlightPagesRef.current.delete(pageNum);
      }
    });

    // Prioritize currentPage first, then outward (currentPage+1, currentPage-1, +2, -2, ...)
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

      // Cancel stale render task for this page (e.g., if user zoomed while it was mid-render)
      const prevTask = activeRenderTasksRef.current.get(pageNum);
      if (prevTask) {
        prevTask.cancel();
        activeRenderTasksRef.current.delete(pageNum);
      }

      inFlightPagesRef.current.add(pageNum);

      try {
        const canvas = canvasRefs.current[pageNum - 1];
        if (!canvas || cancelled) return;

        // PDF.js only requests byte ranges for this specific page from Cloudflare Worker / Drive
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const normalizedRotate = ((page.rotate % 360) + 360) % 360;
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
        const outputScale = window.devicePixelRatio || 1;

        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

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
        // Refresh timestamp if currently in window
        if (pageNum >= minKeep && pageNum <= maxKeep) {
          meta.lastInWindowAt = now;
          continue;
        }

        // Evict if outside ±5 window for >= 2 minutes
        if (now - meta.lastInWindowAt >= EVICT_AFTER_MS) {
          // 1. Free GPU/Canvas bitmap backing store while preserving CSS placeholder height/width
          const canvas = canvasRefs.current[pageNum - 1];
          if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 0;
            canvas.height = 0;
          }

          // 2. Free PDF.js internal page operator lists, images, and fonts from JS heap
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

  // 6. Push control handlers up to ViewerModal
  useEffect(() => {
    if (!onControlsChange) return;

    if (loading || error || !pdfDoc || scale === null) {
      onControlsChange(null);
      return;
    }

    const scrollToPage = (targetPage: number) => {
      const clamped = Math.max(1, Math.min(targetPage, numPages));
      setCurrentPage(clamped);
      const targetCanvas = canvasRefs.current[clamped - 1];
      targetCanvas?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    <div
      ref={containerRef}
      style={{ touchAction: "pan-x pan-y" }}
      className="h-full w-full min-w-0 max-w-full overflow-auto bg-midnight p-2 md:p-4"
      onScroll={() => {
        if (!containerRef.current) return;
        const containerTop = containerRef.current.getBoundingClientRect().top;
        let closestPage = 1;
        let minDistance = Infinity;

        canvasRefs.current.forEach((canvas, idx) => {
          if (!canvas) return;
          const dist = Math.abs(
            canvas.getBoundingClientRect().top - containerTop - 16
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
        {Array.from({ length: numPages }, (_, index) => (
          <canvas
            key={index}
            ref={(el) => {
              canvasRefs.current[index] = el;
            }}
            className="rounded bg-white shadow-lg"
          />
        ))}
      </div>
    </div>
  );
}