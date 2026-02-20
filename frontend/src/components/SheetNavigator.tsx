interface Props {
  currentSheet: number;
  totalSheets: number;
  onNavigate: (sheet: number) => void;
}

export default function SheetNavigator({ currentSheet, totalSheets, onNavigate }: Props) {
  if (totalSheets <= 1) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <button
        onClick={() => onNavigate(Math.max(1, currentSheet - 1))}
        disabled={currentSheet <= 1}
        className="px-2 py-0.5 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-30"
      >
        &lt;
      </button>
      <span>Sheet {currentSheet} / {totalSheets}</span>
      <button
        onClick={() => onNavigate(Math.min(totalSheets, currentSheet + 1))}
        disabled={currentSheet >= totalSheets}
        className="px-2 py-0.5 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-30"
      >
        &gt;
      </button>
    </div>
  );
}
