import { useState } from 'react';
import { imposePDF } from '../utils/api';
import { ImpositionConfig } from '../App';

interface Props {
  sessionId: string;
  config: ImpositionConfig;
  filename: string;
}

export default function ExportPanel({ sessionId, config, filename }: Props) {
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const blob = await imposePDF(sessionId, config);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `imposed_${filename}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    setError('');
    try {
      const blob = await imposePDF(sessionId, config);
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url);
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      }
      // Revoke after a delay to allow print dialog to use the blob
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-red-500 text-xs font-medium">{error}</span>}
      <button
        onClick={handlePrint}
        disabled={printing || exporting}
        className="w-8 h-8 flex items-center justify-center bg-brand-cyan hover:bg-brand-cyan/80 disabled:opacity-50 text-white rounded-lg transition-all shadow-sm hover:shadow-md"
        title="Print"
      >
        {printing ? (
          <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
        )}
      </button>
      <button
        onClick={handleExport}
        disabled={exporting || printing}
        className="bg-brand-pink hover:bg-brand-pink-hover disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
      >
        {exporting ? (
          <>
            <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
            Imposing...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export PDF
          </>
        )}
      </button>
    </div>
  );
}
