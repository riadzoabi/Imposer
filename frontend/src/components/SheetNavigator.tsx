interface Props {
  currentSheet: number;
  totalSheets: number;
  onNavigate: (sheet: number) => void;
}

export default function SheetNavigator({ currentSheet, totalSheets, onNavigate }: Props) {
  if (totalSheets <= 1) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-gray-500">
      <button
        onClick={() => onNavigate(Math.max(1, currentSheet - 1))}
        disabled={currentSheet <= 1}
        className="w-6 h-6 flex items-center justify-center bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 2L3.5 5L6.5 8" />
        </svg>
      </button>
      <span className="min-w-[60px] text-center font-medium tabular-nums">
        {currentSheet} / {totalSheets}
      </span>
      <button
        onClick={() => onNavigate(Math.min(totalSheets, currentSheet + 1))}
        disabled={currentSheet >= totalSheets}
        className="w-6 h-6 flex items-center justify-center bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 2L6.5 5L3.5 8" />
        </svg>
      </button>
    </div>
  );
}
