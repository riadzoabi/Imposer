import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Use the bundled worker via CDN matching our installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/** Max pixel dimension for thumbnail longest side */
const MAX_THUMB_PX = 150;
/** JPEG quality (0–1) */
const JPEG_QUALITY = 0.6;
/** Number of pages to render in parallel */
const BATCH_SIZE = 4;

export type ThumbnailMap = Record<number, string>; // pageIndex (0-based) -> dataURL

/**
 * Loads a PDF from the given URL and renders low-resolution JPEG thumbnails
 * for each page. Returns a map of pageIndex -> dataURL.
 *
 * Optimisations:
 *  - Renders at most MAX_THUMB_PX on the longest side
 *  - Uses JPEG at reduced quality for small payload
 *  - Renders only unique pages (deduped by the caller if needed)
 *  - Uses a single OffscreenCanvas / regular canvas reused across pages
 *  - Aborts on unmount or URL change via AbortController-like flag
 */
export function usePdfThumbnails(
  pdfUrl: string | null,
  pageCount: number,
): { thumbnails: ThumbnailMap; loading: boolean } {
  const [thumbnails, setThumbnails] = useState<ThumbnailMap>({});
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef(0); // generation id – bumped on each new URL

  useEffect(() => {
    if (!pdfUrl || pageCount <= 0) {
      setThumbnails({});
      return;
    }

    const genId = ++cancelRef.current;
    let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;

    async function generate() {
      setLoading(true);
      setThumbnails({});

      try {
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl!, cMapPacked: true });
        pdfDoc = await loadingTask.promise;

        if (cancelRef.current !== genId) return;

        const result: ThumbnailMap = {};
        const totalPages = Math.min(pdfDoc.numPages, pageCount);

        // Render a single page on its own canvas
        async function renderPage(i: number) {
          const page = await pdfDoc!.getPage(i + 1);
          const viewport = page.getViewport({ scale: 1 });
          const longestSide = Math.max(viewport.width, viewport.height);
          const scale = MAX_THUMB_PX / longestSide;
          const thumbViewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(thumbViewport.width);
          canvas.height = Math.ceil(thumbViewport.height);
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport: thumbViewport }).promise;
          result[i] = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          page.cleanup();
        }

        // Process in parallel batches
        for (let batch = 0; batch < totalPages; batch += BATCH_SIZE) {
          if (cancelRef.current !== genId) return;

          const batchEnd = Math.min(batch + BATCH_SIZE, totalPages);
          const promises: Promise<void>[] = [];
          for (let i = batch; i < batchEnd; i++) {
            promises.push(renderPage(i));
          }
          await Promise.all(promises);

          if (cancelRef.current === genId) {
            setThumbnails({ ...result });
          }
        }
      } catch (err) {
        console.warn('[usePdfThumbnails] Failed to generate thumbnails:', err);
      } finally {
        if (cancelRef.current === genId) {
          setLoading(false);
        }
        pdfDoc?.destroy();
      }
    }

    generate();

    return () => {
      cancelRef.current++; // invalidate in-flight generation
    };
  }, [pdfUrl, pageCount]);

  return { thumbnails, loading };
}
