import { useMemo, useState } from 'react';
import { ImpositionConfig } from '../App';
import type { ThumbnailMap } from '../hooks/usePdfThumbnails';

interface Props {
  preview: any;
  config: ImpositionConfig;
  showBleed: boolean;
  showMarks: boolean;
  loading: boolean;
  thumbnails?: ThumbnailMap;
}

export default function SheetPreview({ preview, config, showBleed, showMarks, loading, thumbnails }: Props) {
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  const svgContent = useMemo(() => {
    if (!preview) return null;

    const sheetW = preview.sheet_width_mm || config.sheet.sheet_width;
    const sheetH = preview.sheet_height_mm || config.sheet.sheet_height;
    const trimW = preview.effective_trim_w || config.trim_width;
    const trimH = preview.effective_trim_h || config.trim_height;
    const grid = preview.grid || [];
    const marks = preview.marks || [];

    return (
      <svg
        viewBox={`-2 -2 ${sheetW + 4} ${sheetH + 4}`}
        className="w-full h-full"
        style={{ maxHeight: '100%' }}
      >
        {/* Drop shadow for sheet */}
        <defs>
          <filter id="sheetShadow" x="-2%" y="-2%" width="104%" height="104%">
            <feDropShadow dx="0.5" dy="0.5" stdDeviation="1" floodOpacity="0.15"/>
          </filter>
          {/* Clip paths for each cell to clip thumbnails to trim area */}
          {grid.map((cell: any, i: number) => {
            if (cell.page_index === null || cell.page_index === undefined) return null;
            const tx = cell.trim_origin_x;
            const ty = sheetH - cell.trim_origin_y - trimH;
            return (
              <clipPath key={`clip-${i}`} id={`cell-clip-${i}`}>
                <rect x={tx} y={ty} width={trimW} height={trimH} />
              </clipPath>
            );
          })}
        </defs>

        {/* Sheet background */}
        <rect x={0} y={0} width={sheetW} height={sheetH}
          fill="#ffffff" stroke="#d1d5db" strokeWidth={0.3} filter="url(#sheetShadow)" rx={0.5} />

        {/* Mark margin area */}
        <rect
          x={config.sheet.mark_margin}
          y={config.sheet.mark_margin}
          width={sheetW - 2 * config.sheet.mark_margin}
          height={sheetH - 2 * config.sheet.mark_margin - config.sheet.grip_edge}
          fill="none" stroke="#e5e7eb" strokeWidth={0.15} strokeDasharray="2 2"
        />

        {/* Grid cells */}
        {grid.map((cell: any, i: number) => {
          if (cell.page_index === null || cell.page_index === undefined) return null;

          const tx = cell.trim_origin_x;
          const ty = sheetH - cell.trim_origin_y - trimH;
          const pageIdx = cell.page_index || 0;
          const thumb = thumbnails?.[pageIdx];

          const isHovered = hoveredCell === i;

          return (
            <g key={i}
              onMouseEnter={() => setHoveredCell(i)}
              onMouseLeave={() => setHoveredCell(null)}
            >
              {/* Bleed zone */}
              {showBleed && cell.clip_rect && (
                <rect
                  x={cell.clip_rect.x}
                  y={sheetH - cell.clip_rect.y - cell.clip_rect.height}
                  width={cell.clip_rect.width}
                  height={cell.clip_rect.height}
                  fill="rgba(237, 62, 151, 0.08)"
                  stroke="rgba(237, 62, 151, 0.35)"
                  strokeWidth={0.2}
                />
              )}

              {/* Trim area background */}
              <rect
                x={tx} y={ty}
                width={trimW} height={trimH}
                fill={thumb ? '#ffffff' : (isHovered ? 'rgba(18, 171, 240, 0.1)' : 'rgba(18, 171, 240, 0.03)')}
                stroke={isHovered ? 'rgba(18, 171, 240, 0.8)' : 'rgba(18, 171, 240, 0.4)'}
                strokeWidth={isHovered ? 0.4 : 0.2}
                strokeDasharray={isHovered ? 'none' : '1.5 1'}
              />

              {/* Page thumbnail image */}
              {thumb && (
                <image
                  href={thumb}
                  x={tx}
                  y={ty}
                  width={trimW}
                  height={trimH}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#cell-clip-${i})`}
                  opacity={isHovered ? 0.85 : 1}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Hover overlay */}
              {isHovered && thumb && (
                <rect
                  x={tx} y={ty}
                  width={trimW} height={trimH}
                  fill="rgba(18, 171, 240, 0.08)"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Trim border on top of image */}
              {thumb && (
                <rect
                  x={tx} y={ty}
                  width={trimW} height={trimH}
                  fill="none"
                  stroke={isHovered ? 'rgba(18, 171, 240, 0.8)' : 'rgba(18, 171, 240, 0.4)'}
                  strokeWidth={isHovered ? 0.4 : 0.2}
                  strokeDasharray={isHovered ? 'none' : '1.5 1'}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Page label – shown as small badge when thumbnail exists, large text otherwise */}
              {thumb ? (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={tx + 1}
                    y={ty + 1}
                    width={Math.min(trimW * 0.25, 14)}
                    height={Math.min(trimH * 0.15, 5)}
                    rx={0.8}
                    fill="rgba(0,0,0,0.5)"
                  />
                  <text
                    x={tx + 1 + Math.min(trimW * 0.25, 14) / 2}
                    y={ty + 1 + Math.min(trimH * 0.15, 5) / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.min(trimW, trimH) * 0.055}
                    fill="#ffffff"
                    fontFamily="Inter, sans-serif"
                    fontWeight={600}
                  >
                    P{pageIdx + 1}
                  </text>
                </g>
              ) : (
                <text
                  x={tx + trimW / 2}
                  y={ty + trimH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.min(trimW, trimH) * 0.15}
                  fill={isHovered ? '#12abf0' : '#9ca3af'}
                  fontFamily="Inter, sans-serif"
                  fontWeight={isHovered ? 600 : 400}
                >
                  P{pageIdx + 1}
                </text>
              )}

              {/* Interior edge indicators */}
              {cell.is_interior_edge?.right && (
                <line x1={tx + trimW} y1={ty + 2} x2={tx + trimW} y2={ty + trimH - 2}
                  stroke="rgba(252, 246, 39, 0.5)" strokeWidth={0.3} />
              )}
              {cell.is_interior_edge?.bottom && (
                <line x1={tx + 2} y1={ty + trimH} x2={tx + trimW - 2} y2={ty + trimH}
                  stroke="rgba(252, 246, 39, 0.5)" strokeWidth={0.3} />
              )}
            </g>
          );
        })}

        {/* Marks */}
        {showMarks && marks.map((mark: any, i: number) => {
          if (mark.type === 'crop') {
            return (
              <line key={`m${i}`}
                x1={mark.x1} y1={sheetH - mark.y1}
                x2={mark.x2} y2={sheetH - mark.y2}
                stroke="#374151" strokeWidth={0.2}
              />
            );
          }
          if (mark.type === 'registration') {
            const cx = mark.x1;
            const cy = sheetH - mark.y1;
            const r = mark.properties?.radius || 4;
            return (
              <g key={`m${i}`}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#374151" strokeWidth={0.15} />
                <circle cx={cx} cy={cy} r={r * 0.3} fill="none" stroke="#374151" strokeWidth={0.15} />
                <line x1={cx - r * 0.8} y1={cy} x2={cx + r * 0.8} y2={cy} stroke="#374151" strokeWidth={0.15} />
                <line x1={cx} y1={cy - r * 0.8} x2={cx} y2={cy + r * 0.8} stroke="#374151" strokeWidth={0.15} />
              </g>
            );
          }
          if (mark.type === 'color_bar') {
            const w = mark.properties?.width || 4;
            const h = mark.properties?.height || 4;
            const cmyk = mark.properties?.cmyk || [0, 0, 0, 1];
            const r = Math.round(255 * (1 - cmyk[0]) * (1 - cmyk[3]));
            const g = Math.round(255 * (1 - cmyk[1]) * (1 - cmyk[3]));
            const b = Math.round(255 * (1 - cmyk[2]) * (1 - cmyk[3]));
            return (
              <rect key={`m${i}`}
                x={mark.x1} y={sheetH - mark.y1 - h}
                width={w} height={h}
                fill={`rgb(${r},${g},${b})`}
                stroke="#e5e7eb" strokeWidth={0.1}
              />
            );
          }
          if (mark.type === 'fold') {
            return (
              <line key={`m${i}`}
                x1={mark.x1} y1={sheetH - mark.y1}
                x2={mark.x2} y2={sheetH - mark.y2}
                stroke="#ed3e97" strokeWidth={0.2}
                strokeDasharray="1.5 1"
              />
            );
          }
          if (mark.type === 'slug_text') {
            return (
              <text key={`m${i}`}
                x={mark.x1} y={sheetH - mark.y1}
                fontSize={1.8} fill="#9ca3af" fontFamily="Inter, sans-serif"
              >
                {mark.properties?.text || ''}
              </text>
            );
          }
          return null;
        })}
      </svg>
    );
  }, [preview, config, showBleed, showMarks, hoveredCell, thumbnails]);

  // Tooltip
  const tooltipContent = useMemo(() => {
    if (hoveredCell === null || !preview?.grid) return null;
    const cell = preview.grid[hoveredCell];
    if (!cell || cell.page_index === null) return null;

    const bleed = cell.bleed_per_edge || {};
    const interior = cell.is_interior_edge || {};
    const interiorEdges = ['top', 'bottom', 'left', 'right']
      .filter(e => interior[e])
      .join(', ') || 'none';

    return (
      <div className="absolute top-2 right-2 bg-white border border-gray-200 rounded-xl p-2.5 text-xs text-gray-500 space-y-0.5 z-10 shadow-lg">
        <p className="font-semibold text-brand-navy">Page {(cell.page_index || 0) + 1}</p>
        <p>Bleed: T:{(bleed.top || 0).toFixed(1)} R:{(bleed.right || 0).toFixed(1)} B:{(bleed.bottom || 0).toFixed(1)} L:{(bleed.left || 0).toFixed(1)} mm</p>
        <p>Interior edges: {interiorEdges}</p>
        <p>Rotation: {cell.rotation || 0}&deg;</p>
      </div>
    );
  }, [hoveredCell, preview]);

  return (
    <div className="relative h-full flex items-center justify-center">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-20">
          <div className="animate-spin w-8 h-8 border-2 border-gray-200 border-t-brand-cyan rounded-full" />
        </div>
      )}

      {!preview && !loading && (
        <p className="text-gray-400 text-sm">Calculating layout...</p>
      )}

      {preview && (
        <div className="relative w-full h-full p-4" style={{ transform: `scale(${zoom})` }}>
          {svgContent}
          {tooltipContent}
        </div>
      )}

      {/* Zoom controls */}
      {preview && (
        <div className="absolute bottom-2 left-2 flex gap-1">
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
            className="bg-white border border-gray-200 text-gray-500 w-7 h-7 rounded-lg text-sm hover:bg-gray-50 hover:text-gray-700 transition-colors shadow-sm"
          >-</button>
          <span className="bg-white border border-gray-200 text-gray-500 px-2 h-7 rounded-lg text-[11px] flex items-center shadow-sm font-medium">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(z => Math.min(3, z + 0.1))}
            className="bg-white border border-gray-200 text-gray-500 w-7 h-7 rounded-lg text-sm hover:bg-gray-50 hover:text-gray-700 transition-colors shadow-sm"
          >+</button>
          <button
            onClick={() => setZoom(1)}
            className="bg-white border border-gray-200 text-gray-500 px-2 h-7 rounded-lg text-[11px] hover:bg-gray-50 hover:text-gray-700 transition-colors shadow-sm font-medium"
          >Fit</button>
        </div>
      )}
    </div>
  );
}
