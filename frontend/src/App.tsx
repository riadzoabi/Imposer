import { useState, useCallback, useEffect } from 'react';
import UploadZone from './components/UploadZone';
import PageGeometryPanel from './components/PageGeometryPanel';
import ImpositionSettings from './components/ImpositionSettings';
import SheetPreview from './components/SheetPreview';
import MarkSettings from './components/MarkSettings';
import ExportPanel from './components/ExportPanel';

import { UnitSystem } from './utils/unitConversion';
import { getPreview } from './utils/api';

export interface BleedConfig {
  top: number; bottom: number; left: number; right: number; uniform: boolean;
}
export interface MarkConfig {
  crop_marks_enabled: boolean;
  crop_mark_length: number;
  crop_mark_offset: number;
  crop_mark_stroke_weight: number;
  crop_mark_color: 'registration' | 'black_only';
  registration_marks_enabled: boolean;
  color_bars_enabled: boolean;
  fold_marks_enabled: boolean;
  slug_info_enabled: boolean;
  slug_text_content: string[];
}
export interface SheetConfig {
  sheet_width: number; sheet_height: number;
  orientation: 'portrait' | 'landscape';
  grip_edge: number; mark_margin: number;
}
export interface ImpositionConfig {
  mode: string;
  trim_width: number; trim_height: number;
  bleed: BleedConfig;
  marks: MarkConfig;
  sheet: SheetConfig;
  gap_between_items: number;
  duplex: boolean;
  flip_edge: 'long' | 'short';
  auto_rotate: boolean;
  creep_adjustment: number;
}

const defaultConfig: ImpositionConfig = {
  mode: 'step_and_repeat',
  trim_width: 90, trim_height: 55,
  bleed: { top: 3, bottom: 3, left: 3, right: 3, uniform: true },
  marks: {
    crop_marks_enabled: true, crop_mark_length: 5, crop_mark_offset: 3,
    crop_mark_stroke_weight: 0.25, crop_mark_color: 'registration',
    registration_marks_enabled: true, color_bars_enabled: true,
    fold_marks_enabled: true, slug_info_enabled: true,
    slug_text_content: ['filename', 'date', 'sheet_number'],
  },
  sheet: {
    sheet_width: 488, sheet_height: 330,
    orientation: 'landscape', grip_edge: 10, mark_margin: 8,
  },
  gap_between_items: 0,
  duplex: false, flip_edge: 'long', auto_rotate: true, creep_adjustment: 0,
};

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [config, setConfig] = useState<ImpositionConfig>(defaultConfig);
  const [preview, setPreview] = useState<any>(null);
  const [unit, setUnit] = useState<UnitSystem>('mm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBleed, setShowBleed] = useState(true);
  const [showMarks, setShowMarks] = useState(true);

  const handleUpload = useCallback((data: any) => {
    setSessionId(data.session_id);
    setFilename(data.filename);
    setAnalysis(data);
    setError('');

    if (data.pages?.length > 0) {
      const pg = data.pages[0];
      const trim = pg.trim_box || pg.media_box;
      if (trim) {
        setConfig(prev => ({
          ...prev,
          trim_width: Math.round(trim.width * 10) / 10,
          trim_height: Math.round(trim.height * 10) / 10,
        }));
      }
    }
  }, []);

  const fetchPreview = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getPreview(sessionId, config);
      setPreview(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, config]);

  useEffect(() => {
    if (sessionId) {
      const timer = setTimeout(fetchPreview, 300);
      return () => clearTimeout(timer);
    }
  }, [sessionId, config, fetchPreview]);

  const updateConfig = useCallback((patch: Partial<ImpositionConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const updateBleed = useCallback((patch: Partial<BleedConfig>) => {
    setConfig(prev => {
      const newBleed = { ...prev.bleed, ...patch };
      if (newBleed.uniform && patch.top !== undefined) {
        newBleed.bottom = newBleed.left = newBleed.right = newBleed.top;
      }
      return { ...prev, bleed: newBleed };
    });
  }, []);

  const updateMarks = useCallback((patch: Partial<MarkConfig>) => {
    setConfig(prev => ({ ...prev, marks: { ...prev.marks, ...patch } }));
  }, []);

  const updateSheet = useCallback((patch: Partial<SheetConfig>) => {
    setConfig(prev => ({ ...prev, sheet: { ...prev.sheet, ...patch } }));
  }, []);

  const LogoMark = () => (
    <svg width="28" height="28" viewBox="255 182 330 250" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M490.18,189.8h-223.2v57.36h304.07c-11.7-33.4-43.48-57.36-80.87-57.36Z" fill="#12abf0"/>
      <path d="M575.87,275.48v.59c0,9.97-1.72,19.54-4.85,28.44h-247.57v-57.36h247.62c3.1,8.88,4.81,18.4,4.81,28.33Z" fill="#ed3e97"/>
      <path d="M571.01,304.52c-11.73,33.34-43.47,57.25-80.83,57.25h-109.64v-57.25h190.47Z" fill="#fcf627"/>
      <rect x="380.54" y="361.77" width="55.81" height="61.45" fill="#060221"/>
    </svg>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-brand-navy px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-tight">Print Imposition</h1>
            {filename && (
              <span className="text-[11px] text-gray-400 leading-tight">
                {filename}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-400 mr-1">Units:</span>
          {(['mm', 'inches', 'points'] as UnitSystem[]).map(u => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all ${
                unit === u
                  ? 'bg-brand-cyan text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-red-600 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <div className="w-[300px] bg-white border-r border-gray-200 overflow-y-auto flex flex-col">
          <div className="p-3 space-y-2.5 flex-1">
            <UploadZone onUpload={handleUpload} />

            {analysis && (
              <PageGeometryPanel
                analysis={analysis}
                unit={unit}
                config={config}
                updateConfig={updateConfig}
              />
            )}

            {sessionId && (
              <>
                <ImpositionSettings
                  config={config}
                  updateConfig={updateConfig}
                  updateBleed={updateBleed}
                  updateSheet={updateSheet}
                  unit={unit}
                />

                <MarkSettings
                  marks={config.marks}
                  updateMarks={updateMarks}
                  unit={unit}
                />

                {/* Duplex */}
                <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                  <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Duplex</h3>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.duplex}
                      onChange={e => updateConfig({ duplex: e.target.checked })}
                      className="rounded"
                    />
                    Enable duplex (front/back)
                  </label>
                  {config.duplex && (
                    <select
                      value={config.flip_edge}
                      onChange={e => updateConfig({ flip_edge: e.target.value as 'long' | 'short' })}
                      className="w-full bg-white text-gray-700 text-sm rounded-lg px-3 py-1.5 border border-gray-300 focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors"
                    >
                      <option value="long">Long edge flip</option>
                      <option value="short">Short edge flip</option>
                    </select>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center - Preview */}
        <div className="flex-1 flex flex-col bg-gray-100/70">
          <div className="flex-1 p-4">
            {!sessionId ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-14 h-14 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-base font-medium text-gray-400">Upload a PDF to get started</p>
                  <p className="text-sm mt-1 text-gray-300">Drag and drop or click the upload zone</p>
                </div>
              </div>
            ) : (
              <SheetPreview
                preview={preview}
                config={config}
                showBleed={showBleed}
                showMarks={showMarks}
                loading={loading}
              />
            )}
          </div>

          {/* Preview controls */}
          {sessionId && (
            <div className="border-t border-gray-200 bg-white px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox" checked={showBleed}
                    onChange={e => setShowBleed(e.target.checked)}
                    className="rounded"
                  />
                  Bleed zones
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox" checked={showMarks}
                    onChange={e => setShowMarks(e.target.checked)}
                    className="rounded"
                  />
                  Marks
                </label>
                {preview && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="bg-brand-cyan/10 text-brand-cyan font-bold px-2 py-0.5 rounded-full">
                      {preview.layout?.n_up}-up
                    </span>
                    <span className="text-gray-400">
                      {preview.layout?.rows}&times;{preview.layout?.cols}
                    </span>
                    <span className="text-gray-400">
                      {preview.layout?.total_sheets} sheet{preview.layout?.total_sheets !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ExportPanel sessionId={sessionId} config={config} filename={filename} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
