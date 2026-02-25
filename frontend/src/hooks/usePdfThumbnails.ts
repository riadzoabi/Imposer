import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Use the bundled worker via CDN matching our installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/** Max pixel dimension for thumbnail longest side */
const MAX_THUMB_PX = 200;
/** JPEG quality (0–1) */
const JPEG_QUALITY = 0.55;

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

        // Create a reusable canvas for rendering
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const result: ThumbnailMap = {};

        const totalPages = Math.min(pdfDoc.numPages, pageCount);

        for (let i = 0; i < totalPages; i++) {
          if (cancelRef.current !== genId) return; // cancelled

          const page = await pdfDoc.getPage(i + 1); // PDF.js is 1-indexed
          const viewport = page.getViewport({ scale: 1 });

          // Calculate scale so longest side = MAX_THUMB_PX
          const longestSide = Math.max(viewport.width, viewport.height);
          const scale = MAX_THUMB_PX / longestSide;
          const thumbViewport = page.getViewport({ scale });

          canvas.width = Math.ceil(thumbViewport.width);
          canvas.height = Math.ceil(thumbViewport.height);

          // White background (PDFs often have transparent bg)
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport: thumbViewport }).promise;

          result[i] = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          page.cleanup();

          // Emit intermediate results every 4 pages so the UI updates progressively
          if ((i + 1) % 4 === 0 && cancelRef.current === genId) {
            setThumbnails({ ...result });
          }
        }

        if (cancelRef.current === genId) {
          setThumbnails({ ...result });
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
