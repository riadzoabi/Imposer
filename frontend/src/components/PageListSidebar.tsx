import { useState, useRef, useCallback } from 'react';
import type { ThumbnailMap } from '../hooks/usePdfThumbnails';

interface Props {
  pageSequence: number[];
  sourcePageCount: number;
  thumbnails?: ThumbnailMap;
  onSequenceChange: (seq: number[]) => void;
}

export default function PageListSidebar({
  pageSequence,
  sourcePageCount,
  thumbnails,
  onSequenceChange,
}: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const dragCounterRef = useRef(0);

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIdx(idx);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setDropIdx(null);
      dragCounterRef.current = 0;
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    const fromIdx = dragIdx;
    setDragIdx(null);
    setDropIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;

    const seq = [...pageSequence];
    const [moved] = seq.splice(fromIdx, 1);
    seq.splice(toIdx, 0, moved);
    onSequenceChange(seq);
  }, [dragIdx, pageSequence, onSequenceChange]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDropIdx(null);
    dragCounterRef.current = 0;
  }, []);

  const handleDuplicate = useCallback((idx: number) => {
    const seq = [...pageSequence];
    seq.splice(idx + 1, 0, pageSequence[idx]);
    onSequenceChange(seq);
  }, [pageSequence, onSequenceChange]);

  const handleRemove = useCallback((idx: number) => {
    if (pageSequence.length <= 1) return;
    const seq = [...pageSequence];
    seq.splice(idx, 1);
    onSequenceChange(seq);
  }, [pageSequence, onSequenceChange]);

  const handleReset = useCallback(() => {
    onSequenceChange(Array.from({ length: sourcePageCount }, (_, i) => i));
  }, [sourcePageCount, onSequenceChange]);

  const isDefault = pageSequence.length === sourcePageCount &&
    pageSequence.every((v, i) => v === i);

  return (
    <div className="w-[180px] bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Pages</h3>
          <span className="text-[10px] text-gray-300">{pageSequence.length} page{pageSequence.length !== 1 ? 's' : ''}</span>
        </div>
        {!isDefault && (
          <button
            onClick={handleReset}
            className="text-[10px] text-brand-cyan hover:text-brand-cyan/80 font-medium transition-colors"
            title="Reset to original order"
          >
            Reset
          </button>
        )}
      </div>

      {/* Page list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {pageSequence.map((pageIdx, seqIdx) => {
          const thumb = thumbnails?.[pageIdx];
          const isDragging = dragIdx === seqIdx;
          const isDropTarget = dropIdx === seqIdx && dragIdx !== seqIdx;

          return (
            <div
              key={`${seqIdx}-${pageIdx}`}
              draggable
              onDragStart={e => handleDragStart(e, seqIdx)}
              onDragOver={e => handleDragOver(e, seqIdx)}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, seqIdx)}
              onDragEnd={handleDragEnd}
              className={`group relative rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
                isDragging
                  ? 'opacity-30 border-gray-300'
                  : isDropTarget
                    ? 'border-brand-cyan border-dashed bg-brand-cyan/5'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              {/* Drop indicator line */}
              {isDropTarget && (
                <div className="absolute -top-1 left-2 right-2 h-0.5 bg-brand-cyan rounded-full" />
              )}

              <div className="p-1.5">
                {/* Thumbnail */}
                <div className="relative aspect-[3/4] bg-gray-50 rounded overflow-hidden mb-1">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={`Page ${pageIdx + 1}`}
                      className="w-full h-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-medium">
                      P{pageIdx + 1}
                    </div>
                  )}

                  {/* Action buttons overlay */}
                  <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); handleDuplicate(seqIdx); }}
                      className="w-5 h-5 flex items-center justify-center bg-white/90 hover:bg-brand-cyan hover:text-white rounded text-gray-500 transition-colors shadow-sm"
                      title="Duplicate page"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    {pageSequence.length > 1 && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRemove(seqIdx); }}
                        className="w-5 h-5 flex items-center justify-center bg-white/90 hover:bg-red-500 hover:text-white rounded text-gray-400 transition-colors shadow-sm"
                        title="Remove page"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Page label */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-medium">
                    P{pageIdx + 1}
                  </span>
                  {/* Drag handle indicator */}
                  <svg className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.5" />
                    <circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" />
                    <circle cx="15" cy="18" r="1.5" />
                  </svg>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
