interface Props {
  currentSheet: number;
  totalSheets: number;
  onNavigate: (sheet: number) => void;
  duplex?: boolean;
  side?: 'front' | 'back';
  onSideChange?: (side: 'front' | 'back') => void;
}

export default function SheetNavigator({
  currentSheet,
  totalSheets,
  onNavigate,
  duplex,
  side = 'front',
  onSideChange,
}: Props) {
  if (totalSheets <= 1 && !duplex) return null;

  return (
    <div className="flex items-center gap-3">
      {/* Sheet navigation */}
      {totalSheets > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onNavigate(Math.max(1, currentSheet - 1))}
            disabled={currentSheet <= 1}
            className="w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 rounded-md text-xs hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs text-gray-500 font-medium tabular-nums min-w-[80px] text-center">
            Sheet {currentSheet} / {totalSheets}
          </span>
          <button
            onClick={() => onNavigate(Math.min(totalSheets, currentSheet + 1))}
            disabled={currentSheet >= totalSheets}
            className="w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 rounded-md text-xs hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Duplex side toggle */}
      {duplex && onSideChange && (
        <div className="flex items-center bg-gray-100 rounded-md p-0.5">
          <button
            onClick={() => onSideChange('front')}
            className={`px-2 py-0.5 text-[11px] rounded font-medium transition-all ${
              side === 'front'
                ? 'bg-white text-brand-cyan shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Front
          </button>
          <button
            onClick={() => onSideChange('back')}
            className={`px-2 py-0.5 text-[11px] rounded font-medium transition-all ${
              side === 'back'
                ? 'bg-white text-brand-cyan shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
