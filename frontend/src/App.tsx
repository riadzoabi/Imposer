import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import UploadZone from './components/UploadZone';
import PageGeometryPanel from './components/PageGeometryPanel';
import ImpositionSettings from './components/ImpositionSettings';
import SheetPreview from './components/SheetPreview';
import SheetNavigator from './components/SheetNavigator';
import MarkSettings from './components/MarkSettings';
import ExportPanel from './components/ExportPanel';

import { UnitSystem } from './utils/unitConversion';
import { getPreview } from './utils/api';
import { usePdfThumbnails } from './hooks/usePdfThumbnails';

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
  const [currentSheet, setCurrentSheet] = useState(1);
  const [currentSide, setCurrentSide] = useState<'front' | 'back'>('front');

  const pdfUrl = useMemo(
    () => (sessionId ? `/api/pdf/${sessionId}` : null),
    [sessionId],
  );
  const pageCount = analysis?.page_count ?? 0;
  const { thumbnails } = usePdfThumbnails(pdfUrl, pageCount);

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

  // Reset sheet to 1 when config changes (but not when sheet/side nav changes)
  const prevConfigRef = useRef(config);
  useEffect(() => {
    if (prevConfigRef.current !== config) {
      prevConfigRef.current = config;
      setCurrentSheet(1);
      setCurrentSide('front');
    }
  }, [config]);

  const fetchPreview = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getPreview(sessionId, config, currentSheet, currentSide);
      setPreview(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, config, currentSheet, currentSide]);

  useEffect(() => {
    if (sessionId) {
      const timer = setTimeout(fetchPreview, 300);
      return () => clearTimeout(timer);
    }
  }, [sessionId, config, currentSheet, currentSide, fetchPreview]);

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
      <header className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <div>
            <h1 className="text-base font-bold text-brand-navy tracking-tight leading-tight">Print Imposition</h1>
            {filename && (
              <span className="text-[11px] text-gray-400 leading-tight">
                {filename}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-500 mr-1">Units:</span>
          {(['mm', 'inches', 'points'] as UnitSystem[]).map(u => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all ${
                unit === u
                  ? 'bg-brand-cyan text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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
          {/* Rabtt Logo */}
          <div className="px-3 py-3 border-t border-gray-100 flex items-center justify-center">
            <svg width="80" height="auto" viewBox="0 0 329.1 202.9" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="#c8cdd3" d="M210.3,78.9h0c-14.6-8.1-34.3-5.6-45.2,7.4l-4.2,6.1v-45.7h-13.3v106.6h13v-16.9c1.4,1.9,2.4,3.9,3.9,5.8,14,18,43.4,17,56.5-1.5,13-18.4,9.9-50.1-10.7-61.8ZM189.2,143c-36.4,1.7-39.4-54.1-3.2-56.5,37.2-2.4,39.6,54.8,3.2,56.5Z"/>
              <path fill="#c8cdd3" d="M133.4,153.5c-.2-17.3.4-34.7-.3-51.9v-.2c-2.4-20.9-20.7-28.7-39.9-26.5-10.6,1.2-19.3,6.5-26.2,14.4l8.4,8.2c.8,0,1-1.1,1.5-1.5,7.7-7,14.3-10.3,25.2-9.5,8.9.7,18.2,7.3,18.2,17v4.9h-35.7c-12.4.8-23,7.6-23.8,20.9-1.3,21.9,18.9,28,37.1,25,9.5-1.6,17.1-6.4,22.5-14.4v13.6h13ZM107.5,141.2h0c-9.4,4.1-32.7,5.3-33.7-9-.5-7,3.2-11.1,9.8-12.8l36.7-4c.7,11.2-1.8,21.1-12.8,25.8Z"/>
              <path fill="#c8cdd3" d="M56.3,89.1v-13c-12.3-.7-23.7,2.3-29.7,13.7l-2,4.3v-18.1h-13v77.3h13.3v-39.5c.6-6,1.8-12.3,5.8-17,6.2-7.3,16.6-7.8,25.6-7.7Z"/>
              <path fill="#c8cdd3" d="M312,47.4c-4.2-1.9-9.5-2-15.3.6h0c-5.7,2.5-11.6,8.1-15,13.3-2.7,4.1-4.5,8.6-5.9,13.3h.1c0,0,0,0,0,0l.4.2c3.4-.2,6.8-.2,10.2-.8,2.4-6.6,7.5-13.7,13.9-16.8,4-2,7.5-1.5,9.4.4,1.8,2,2,5.3-.6,9-6.1,8.7-23.4,10.5-33.1,10.8-11.8.4-35.5.6-45.3-8.5-.6-.6-1.2-1.2-1.7-1.9-5.1-6.7-.6-13.5,7.5-10.4,2.5,1,4.9,2.7,7.1,4.8,3.6,3.6,6.4,8.3,7.8,12.5,0,0,0,0,0,0,0,0,0,0,0,0,3.5.4,7.1.6,10.6.6-1.9-7.3-5.6-14.3-10.9-19.6h0c-2.6-2.6-6.3-5.4-10-7.1-1.2-.6-2.5-1.1-3.7-1.4-15.8-4-26.3,11.4-17.6,25,2,3,4.6,5.5,7.6,7.5,8.9,6,21.4,7.7,31.3,8.1,17.5.8,44.8,1.5,57.3-13.2,8.7-10.3,4.8-22.6-4.4-26.6Z"/>
              <path fill="#c8cdd3" d="M309.4,143.6c-1.3.2-1.6.2-3.9.2s-4.6-.3-6.8-.6c-3.5-.5-7-2.2-9-5.1-1.6-2.3-2.1-5.3-2.4-8.2-.5-5.6-.8-11.5-.9-17.4h12.4v-8.8h-12.4v-14.4l-10.8.6c0,4.6-.1,9.2-.2,13.8h-13.4c.2-4.6.2-9.3.2-13.8l-10.6-.6v14.4h-11.4v8.8h11.4v19.7c0,4.4,1.4,8.8,3.7,12.5,6.4,10.3,20.1,9.5,30.7,9.3h1.2c-4.1-1.5-7.6-4.1-10.2-8.3-.5-.8-.9-1.6-1.3-2.4-.9,0-.5,0-1.3-.2-3.5-.5-7-2.2-9-5.1-1.6-2.3-2.1-5.3-2.4-8.2-.6-5.7-.8-11.5-.8-17.4h13.3c-.1,6.5,0,13.1.8,19.7.4,3.8,1.1,7.8,2.9,11.2.2.5.4.9.7,1.3,4.1,6.6,10.8,8.7,17.8,9.3,2,.2,4.2.2,6.2.2h5.9c0,0-.2-10.2-.2-10.6h-.2Z"/>
              <path fill="#c8cdd3" d="M92.5,27.4c.5,0,.9-.2,1.4-.5s.9-.5,1.3-.8c.4-.3.8-.7,1.1-1.2.3-.5.6-1,.8-1.6.2-.6.3-1.3.3-2.1s0-1.5-.3-2.1-.5-1.2-.8-1.6c-.3-.5-.7-.9-1.1-1.2-.4-.3-.9-.6-1.3-.8s-.9-.4-1.4-.5c-.5,0-.9-.1-1.3-.1h-4.9v12.8h4.9c.4,0,.9,0,1.3-.1ZM87.8,26.2v-10h2.9c.7,0,1.4,0,2,.3.6.2,1.2.5,1.6.9.5.4.8.9,1.1,1.5.3.6.4,1.4.4,2.3s-.1,1.6-.4,2.3c-.3.6-.6,1.1-1.1,1.5-.5.4-1,.7-1.6.9-.6.2-1.3.3-2,.3h-2.9Z"/>
              <path fill="#c8cdd3" d="M103.4,26.5c.4.4.8.7,1.3.9.5.2,1.1.4,1.8.4s1.5-.1,2.1-.4,1.2-.7,1.7-1.4l-1.1-.8c-.3.4-.7.7-1.1,1s-.9.3-1.6.3-.7,0-1.1-.2c-.3-.1-.6-.3-.8-.6-.2-.2-.4-.5-.6-.9s-.2-.7-.3-1h6.8v-.5c0-.7,0-1.3-.3-1.9-.2-.5-.5-1-.8-1.4-.4-.4-.8-.7-1.3-.9-.5-.2-1-.3-1.6-.3s-1.2.1-1.7.3c-.5.2-1,.5-1.4.9s-.7.9-.9,1.4c-.2.5-.3,1.1-.3,1.8s0,1.2.3,1.7c.2.5.5,1,.8,1.4ZM104.6,20.8c.5-.4,1.1-.7,1.9-.7s1.4.2,1.8.7c.4.4.7,1,.7,1.7h-5.3c0-.7.4-1.3.9-1.7Z"/>
              <polygon fill="#c8cdd3" points="119.7 27.6 123.1 19.1 121.5 19.1 119 25.7 119 25.7 116.4 19.1 114.7 19.1 118.2 27.6 119.7 27.6"/>
              <path fill="#c8cdd3" d="M128.3,26.5c.4.4.8.7,1.3.9.5.2,1.1.4,1.8.4s1.5-.1,2.1-.4,1.2-.7,1.7-1.4l-1.1-.8c-.3.4-.7.7-1.1,1s-.9.3-1.6.3-.7,0-1.1-.2c-.3-.1-.6-.3-.8-.6-.2-.2-.4-.5-.6-.9s-.2-.7-.3-1h6.8v-.5c0-.7,0-1.3-.3-1.9-.2-.5-.5-1-.8-1.4-.4-.4-.8-.7-1.3-.9-.5-.2-1-.3-1.6-.3s-1.2.1-1.7.3c-.5.2-1,.5-1.4.9s-.7.9-.9,1.4c-.2.5-.3,1.1-.3,1.8s0,1.2.3,1.7c.2.5.5,1,.8,1.4ZM129.5,20.8c.5-.4,1.1-.7,1.9-.7s1.4.2,1.8.7c.4.4.7,1,.7,1.7h-5.3c0-.7.4-1.3.9-1.7Z"/>
              <rect fill="#c8cdd3" x="140.9" y="13.9" width="1.4" height="13.7"/>
              <path fill="#c8cdd3" d="M149,26.5c.4.4.9.7,1.4.9.6.2,1.2.3,1.8.3s1.3-.1,1.8-.3c.6-.2,1-.5,1.4-.9s.7-.9.9-1.4c.2-.5.3-1.1.3-1.8s-.1-1.3-.3-1.8c-.2-.5-.5-1-.9-1.4s-.9-.7-1.4-.9c-.6-.2-1.2-.3-1.8-.3s-1.3.1-1.8.3c-.6.2-1,.5-1.4.9s-.7.9-.9,1.4c-.2.5-.3,1.1-.3,1.8s.1,1.3.3,1.8c.2.5.5,1,.9,1.4ZM149.4,22.1c.1-.4.3-.7.6-1s.6-.5.9-.7c.4-.2.8-.2,1.2-.2s.9,0,1.2.2c.4.2.7.4.9.7.3.3.5.6.6,1,.1.4.2.8.2,1.2s0,.9-.2,1.2c-.1.4-.3.7-.6,1-.3.3-.6.5-.9.7-.4.2-.8.2-1.2.2s-.9,0-1.2-.2c-.4-.2-.7-.4-.9-.7-.3-.3-.5-.6-.6-1s-.2-.8-.2-1.2,0-.9.2-1.2Z"/>
              <path fill="#c8cdd3" d="M163.3,26.1h0c.3.5.7.9,1.3,1.2.6.3,1.2.5,2,.5s1.1-.1,1.7-.3c.5-.2,1-.5,1.3-.9.4-.4.7-.9.9-1.4.2-.5.3-1.1.3-1.8s-.1-1.2-.3-1.8c-.2-.5-.5-1-.9-1.4s-.9-.7-1.4-.9c-.5-.2-1.2-.3-1.8-.3s-1.2.1-1.7.4-1,.6-1.3,1.1h0v-1.2h-1.4v12.6h1.4v-5.6ZM163.5,22.1c.1-.4.3-.7.6-1s.6-.5.9-.7c.4-.2.8-.2,1.2-.2s.9,0,1.2.2c.4.2.7.4.9.7.3.3.5.6.6,1s.2.8.2,1.2,0,.9-.2,1.2-.3.7-.6,1c-.3.3-.6.5-.9.7-.4.2-.8.2-1.2.2s-.9,0-1.2-.2c-.4-.2-.7-.4-.9-.7-.3-.3-.5-.6-.6-1-.1-.4-.2-.8-.2-1.2s0-.9.2-1.2Z"/>
              <path fill="#c8cdd3" d="M176.8,26.5c.4.4.8.7,1.3.9s1.1.4,1.8.4,1.5-.1,2.1-.4,1.2-.7,1.7-1.4l-1.1-.8c-.3.4-.7.7-1.1,1s-.9.3-1.6.3-.7,0-1.1-.2c-.3-.1-.6-.3-.8-.6-.2-.2-.4-.5-.6-.9-.2-.3-.2-.7-.3-1h6.8v-.5c0-.7,0-1.3-.3-1.9-.2-.5-.5-1-.8-1.4-.4-.4-.8-.7-1.3-.9-.5-.2-1-.3-1.6-.3s-1.2.1-1.7.3-1,.5-1.4.9-.7.9-.9,1.4c-.2.5-.3,1.1-.3,1.8s0,1.2.3,1.7c.2.5.5,1,.8,1.4ZM178,20.8c.5-.4,1.1-.7,1.9-.7s1.4.2,1.8.7c.4.4.7,1,.7,1.7h-5.3c0-.7.4-1.3.9-1.7Z"/>
              <path fill="#c8cdd3" d="M190,26.5c.4.4.8.7,1.3.9.5.2,1.1.3,1.7.3s1.4-.2,2-.5,1-.7,1.3-1.2h0v1.5h1.4v-13.7h-1.4v6.4h0c-.4-.5-.8-.8-1.3-1.1-.5-.3-1.1-.4-1.7-.4s-1.3.1-1.8.3c-.5.2-1,.5-1.4.9s-.7.9-.9,1.4c-.2.5-.3,1.1-.3,1.8s.1,1.2.3,1.8c.2.5.5,1,.9,1.4ZM190.5,22.1c.1-.4.3-.7.6-1,.3-.3.6-.5.9-.7.4-.2.8-.2,1.2-.2s.9,0,1.2.2c.4.2.7.4.9.7.3.3.5.6.6,1,.1.4.2.8.2,1.2s0,.9-.2,1.2c-.1.4-.3.7-.6,1-.3.3-.6.5-.9.7-.4.2-.8.2-1.2.2s-.9,0-1.2-.2c-.4-.2-.7-.4-.9-.7-.3-.3-.5-.6-.6-1s-.2-.8-.2-1.2,0-.9.2-1.2Z"/>
              <path fill="#c8cdd3" d="M212.8,26.1h0c.3.5.7.9,1.3,1.2.6.3,1.2.5,2,.5s1.1-.1,1.7-.3c.5-.2,1-.5,1.3-.9.4-.4.7-.9.9-1.4.2-.5.3-1.1.3-1.8s-.1-1.2-.3-1.8c-.2-.5-.5-1-.9-1.4-.4-.4-.9-.7-1.4-.9-.5-.2-1.2-.3-1.8-.3s-1.2.1-1.7.4c-.5.3-1,.6-1.3,1.1h0v-6.4h-1.4v13.7h1.4v-1.5ZM213,22.1c.1-.4.3-.7.6-1,.3-.3.6-.5.9-.7.4-.2.8-.2,1.2-.2s.9,0,1.2.2c.4.2.7.4.9.7.3.3.5.6.6,1s.2.8.2,1.2,0,.9-.2,1.2-.3.7-.6,1c-.3.3-.6.5-.9.7-.4.2-.8.2-1.2.2s-.9,0-1.2-.2c-.4-.2-.7-.4-.9-.7-.3-.3-.5-.6-.6-1s-.2-.8-.2-1.2,0-.9.2-1.2Z"/>
              <path fill="#c8cdd3" d="M227.4,29.2c-.2.4-.3.8-.6,1-.2.3-.6.4-1,.4s-.4,0-.5,0c-.2,0-.3,0-.5-.1l-.2,1.2c.2,0,.4.2.6.2.2,0,.4,0,.6,0,.4,0,.8,0,1.1-.2.3-.1.5-.3.8-.5s.4-.5.5-.8c.2-.3.3-.6.4-1l4.1-10.4h-1.5l-2.5,6.6h0l-2.6-6.6h-1.6l3.5,8.5-.6,1.6Z"/>
              <polygon fill="#c8cdd3" points="18.7 185.5 14.1 174.8 12.3 174.8 12.3 187.6 13.5 187.6 13.5 176.3 13.5 176.3 18.5 187.6 19 187.6 23.9 176.3 23.9 176.3 23.9 187.6 25.1 187.6 25.1 174.8 23.4 174.8 18.7 185.5"/>
              <path fill="#c8cdd3" d="M37.8,186.1c0-.3,0-.6,0-.9,0-.3,0-.7,0-1.1v-2c0-1.1-.3-1.8-.9-2.3-.6-.5-1.4-.7-2.4-.7s-1.1,0-1.7.3c-.6.2-1.1.5-1.5.9l.6.7c.7-.6,1.6-.9,2.5-.9s1.2.2,1.7.5c.4.3.7.8.7,1.6v.5h-1.3c-.4,0-.9,0-1.4,0-.5,0-1,.2-1.5.4-.5.2-.9.5-1.2.8-.3.4-.5.9-.5,1.5s0,.8.3,1.1.4.6.7.8c.3.2.6.3.9.4.3,0,.7.1,1.1.1.7,0,1.3-.1,1.8-.4.5-.3.9-.7,1.2-1.2h0c0,.5,0,.9.1,1.4h1c0-.2,0-.5,0-.7,0-.2,0-.5,0-.8ZM36.8,183.9c0,.3,0,.7-.1,1,0,.3-.2.7-.5.9-.2.3-.5.5-.9.7-.4.2-.9.3-1.4.3s-.5,0-.7,0-.4-.2-.6-.3c-.2-.1-.3-.3-.4-.5-.1-.2-.2-.4-.2-.7,0-.4.1-.7.3-.9s.5-.4.8-.6c.3-.1.7-.2,1.2-.3.4,0,.9,0,1.3,0h1.2v.6Z"/>
              <path fill="#c8cdd3" d="M47.4,179c-.6,0-1.2.2-1.6.5-.4.3-.8.7-1.1,1.2,0,0,0-.3,0-.6,0-.3,0-.6,0-.9h-1.1c0,.1,0,.3,0,.5,0,.2,0,.4,0,.6,0,.2,0,.5,0,.7,0,.2,0,.4,0,.6v6h1.1v-4.6c0-.4,0-.8.2-1.1s.3-.7.5-.9c.2-.3.5-.5.8-.6.3-.2.8-.2,1.2-.2s.3,0,.4,0v-1.1s0,0-.2,0c-.1,0-.2,0-.3,0Z"/>
              <polygon fill="#c8cdd3" points="59.6 179.2 58 179.2 53.9 183 53.9 173.9 52.8 173.9 52.8 187.6 53.9 187.6 53.9 183.2 58.5 187.6 60.1 187.6 55.3 183 59.6 179.2"/>
              <path fill="#c8cdd3" d="M71.2,180.2c-.3-.4-.7-.7-1.2-.9-.5-.2-1.1-.3-1.7-.3s-1.2.1-1.7.3c-.5.2-.9.5-1.3.9s-.7.9-.9,1.4c-.2.5-.3,1.1-.3,1.7s0,1.2.3,1.8c.2.5.5,1,.9,1.4s.8.7,1.3.9c.5.2,1.1.3,1.7.3s1.4-.1,2.1-.4c.6-.3,1.1-.7,1.6-1.4l-.8-.7c-.3.5-.7.8-1.2,1.1-.5.3-1.1.4-1.6.4s-1.2-.1-1.6-.4c-.4-.2-.7-.5-1-.9-.2-.3-.4-.7-.5-1,0-.4-.1-.6-.1-.9h7v-.8c0-.5,0-1-.3-1.4-.2-.5-.4-.9-.8-1.3ZM65.2,182.7c0-.1,0-.3.1-.6,0-.3.3-.6.5-.9.2-.3.5-.6.9-.8.4-.2.9-.4,1.5-.4s.8,0,1.1.2.7.3.9.6c.3.2.5.5.6.9s.2.7.2,1h-5.9Z"/>
              <path fill="#c8cdd3" d="M81.2,186.7c-.2,0-.4,0-.6,0-.4,0-.6-.1-.8-.3-.2-.2-.3-.5-.3-.9v-5.4h2.4v-1h-2.4v-2.4h-1.1v2.4h-1.8v1h1.8v5.4c0,.3,0,.6.1.8,0,.3.2.5.4.7.2.2.4.3.7.5.3.1.6.2,1,.2s.4,0,.7,0c.3,0,.5-.1.7-.2v-1c-.3,0-.5.2-.7.2Z"/>
              <rect fill="#c8cdd3" x="87" y="179.2" width="1.1" height="8.4"/>
              <path fill="#c8cdd3" d="M87.5,175.1c-.2,0-.4,0-.6.2s-.2.3-.2.6,0,.4.2.6c.2.2.3.2.6.2s.4,0,.6-.2c.2-.2.2-.3.2-.6s0-.4-.2-.6c-.2-.2-.3-.2-.6-.2Z"/>
              <path fill="#c8cdd3" d="M100.8,180.1c-.2-.3-.6-.6-1-.8-.4-.2-.9-.3-1.6-.3s-1.3.2-1.8.5c-.5.3-.9.7-1.1,1.2h0c0,0,0-.3,0-.6,0-.3,0-.6,0-.9h-1.1c0,.1,0,.3,0,.5,0,.2,0,.4,0,.6,0,.2,0,.5,0,.7,0,.2,0,.4,0,.6v6h1.1v-4.2c0-.6,0-1.1.2-1.5s.4-.8.6-1.1.6-.5.9-.6c.4-.1.7-.2,1.1-.2s.8,0,1.1.2c.3.2.5.4.6.6.2.3.3.5.3.9,0,.3,0,.6,0,1v4.9h1.1v-5c0-.5,0-.9-.1-1.3s-.3-.8-.5-1.1Z"/>
              <path fill="#c8cdd3" d="M114.6,180.6h0c-.3-.5-.7-.9-1.3-1.2-.5-.3-1.2-.4-1.9-.4s-1.2.1-1.7.3c-.5.2-1,.5-1.4.9s-.7.8-1,1.4c-.2.5-.4,1.1-.4,1.7s.1,1.1.4,1.7c.2.5.6,1,1,1.4.4.4.9.7,1.4.9.5.2,1.1.3,1.7.3s1.4-.1,1.9-.4c.5-.3,1-.7,1.3-1.2h0v1.2c0,.2,0,.4,0,.6s0,.5-.1.8c0,.3-.2.6-.3.8s-.3.5-.6.8-.6.4-.9.6-.8.2-1.4.2-1.3-.1-1.8-.4c-.6-.3-1.1-.7-1.4-1.2l-.8.8c.2.3.5.5.8.7s.6.4,1,.6c.4.2.7.3,1.1.3.4,0,.8.1,1.2.1s.9,0,1.4-.2c.5-.1,1-.4,1.5-.7s.8-.8,1.1-1.5.5-1.5.5-2.5v-7.8h-1.1v1.4ZM114.4,184.6c-.2.4-.4.8-.7,1s-.6.5-1,.7-.8.3-1.3.3-.9,0-1.3-.3-.8-.4-1-.7c-.3-.3-.5-.6-.7-1-.2-.4-.3-.8-.3-1.3s0-.9.3-1.3c.2-.4.4-.8.7-1,.3-.3.6-.5,1-.7s.8-.3,1.3-.3.9,0,1.3.3.8.4,1,.7c.3.3.5.6.7,1,.2.4.3.8.3,1.3s0,.9-.3,1.3Z"/>
              <path fill="#c8cdd3" d="M305.1,183.2c-.4-.2-.8-.3-1.2-.4s-.8-.2-1.2-.3c-.4-.1-.7-.2-.9-.4s-.4-.5-.4-.8,0-.4.2-.6c.1-.2.3-.3.4-.4.2-.1.4-.2.6-.3.2,0,.4,0,.6,0,.5,0,.9,0,1.2.3.3.2.6.5.8.9l1-.6c-.3-.5-.7-.9-1.2-1.2s-1.1-.4-1.8-.4-.7,0-1,.1c-.3,0-.6.2-.9.4-.3.2-.5.4-.7.8-.2.3-.3.7-.3,1.1s.1.9.4,1.2.6.5.9.7c.4.2.8.3,1.2.4.4,0,.8.2,1.2.3.4.1.7.3.9.5.2.2.4.5.4.9s0,.5-.2.6c-.1.2-.3.3-.4.5s-.4.2-.6.3c-.2,0-.5.1-.7.1-.5,0-1-.1-1.4-.4-.4-.2-.8-.6-1-1l-1,.7c.3.6.8,1,1.4,1.3.6.3,1.3.4,2,.4s.8,0,1.1-.2c.4-.1.7-.3,1-.5s.5-.5.7-.8c.2-.3.2-.7.2-1.1s-.1-1-.4-1.3c-.2-.3-.6-.5-.9-.7Z"/>
              <path fill="#c8cdd3" d="M216,181.4c-.5-.3-1-.5-1.6-.6-.6-.2-1.1-.3-1.6-.5-.5-.2-.9-.5-1.2-.8s-.5-.8-.5-1.5,0-.8.2-1.1c.2-.3.4-.6.6-.8.3-.2.6-.3.9-.5s.7-.2,1.1-.2c.6,0,1,.1,1.4.3.4.2.8.5,1.1.9l1-.7c-.4-.6-.9-1-1.5-1.2-.6-.2-1.2-.4-1.9-.4s-1.1,0-1.6.2c-.5.2-.9.4-1.3.7-.4.3-.7.7-.9,1.1-.2.4-.3.9-.3,1.5s0,1.1.3,1.5c.2.4.4.8.8,1,.3.3.7.5,1.1.7s.8.3,1.2.5.8.3,1.2.4.7.3,1.1.5c.3.2.6.4.8.7.2.3.3.7.3,1.1s0,.7-.2,1c-.2.3-.4.6-.6.8-.3.2-.6.4-.9.5-.4.1-.7.2-1.1.2-.6,0-1.2-.1-1.7-.4-.5-.3-.9-.7-1.2-1.2l-1.1.8c.5.7,1.1,1.2,1.8,1.5.7.3,1.5.4,2.3.4s1,0,1.5-.2c.5-.2.9-.4,1.3-.7.4-.3.7-.7.9-1.1s.3-1,.3-1.5-.2-1.4-.5-1.9-.7-.8-1.2-1.1Z"/>
              <path fill="#c8cdd3" d="M230.2,180.2c-.4-.4-.9-.7-1.4-.9-.5-.2-1.1-.3-1.8-.3s-1.2.1-1.8.3c-.5.2-1,.5-1.4.9s-.7.9-.9,1.4-.3,1.1-.3,1.8.1,1.2.3,1.8.5,1,.9,1.4.8.7,1.4.9c.5.2,1.1.3,1.8.3s1.2-.1,1.8-.3c.5-.2,1-.5,1.4-.9s.7-.9.9-1.4.3-1.1.3-1.8-.1-1.2-.3-1.8-.5-1-.9-1.4ZM230.2,184.7c-.2.4-.4.8-.7,1.1s-.6.6-1,.7c-.4.2-.9.3-1.4.3s-1,0-1.4-.3c-.4-.2-.8-.4-1-.7s-.5-.7-.7-1.1-.2-.9-.2-1.3,0-.9.2-1.3.4-.8.7-1.1.6-.6,1-.7c.4-.2.9-.3,1.4-.3s1,0,1.4.3c.4.2.8.4,1,.7s.5.7.7,1.1c.2.4.2.9.2,1.3s0,.9-.2,1.3Z"/>
              <rect fill="#c8cdd3" x="237.2" y="173.9" width="1.1" height="13.7"/>
              <path fill="#c8cdd3" d="M251.5,186.5c0-.2,0-.5,0-.7,0-.2,0-.4,0-.6v-6h-1.1v4.2c0,.6,0,1.1-.2,1.5-.2.4-.4.8-.6,1.1s-.6.5-.9.6-.7.2-1.1.2-.8,0-1.1-.2c-.3-.2-.5-.4-.6-.6s-.3-.5-.3-.9,0-.6,0-1v-4.9h-1.1v5c0,.5,0,.9.1,1.3s.2.8.5,1.1c.2.3.6.6,1,.8.4.2.9.3,1.6.3s1.3-.2,1.8-.5c.5-.3.9-.7,1.1-1.2h0c0,0,0,.3,0,.6,0,.3,0,.6,0,.9h1.1c0-.1,0-.3,0-.5,0-.2,0-.4,0-.6Z"/>
              <path fill="#c8cdd3" d="M261,186.7c-.2,0-.4,0-.6,0-.4,0-.6-.1-.8-.3s-.3-.5-.3-.9v-5.4h2.4v-1h-2.4v-2.4h-1.1v2.4h-1.8v1h1.8v5.4c0,.3,0,.6.1.8,0,.3.2.5.4.7.2.2.4.3.7.5.3.1.6.2,1,.2s.4,0,.7,0c.3,0,.5-.1.7-.2v-1c-.3,0-.5.2-.7.2Z"/>
              <rect fill="#c8cdd3" x="266.8" y="179.2" width="1.1" height="8.4"/>
              <path fill="#c8cdd3" d="M267.4,175.1c-.2,0-.4,0-.6.2-.2.2-.2.3-.2.6s0,.4.2.6.3.2.6.2.4,0,.6-.2c.2-.2.2-.3.2-.6s0-.4-.2-.6c-.2-.2-.3-.2-.6-.2Z"/>
              <path fill="#c8cdd3" d="M281.1,180.2c-.4-.4-.9-.7-1.4-.9s-1.1-.3-1.8-.3-1.2.1-1.8.3c-.5.2-1,.5-1.4.9s-.7.9-.9,1.4-.3,1.1-.3,1.8.1,1.2.3,1.8.5,1,.9,1.4.8.7,1.4.9c.5.2,1.1.3,1.8.3s1.2-.1,1.8-.3,1-.5,1.4-.9.7-.9.9-1.4c.2-.5.3-1.1.3-1.8s-.1-1.2-.3-1.8c-.2-.5-.5-1-.9-1.4ZM281,184.7c-.2.4-.4.8-.7,1.1-.3.3-.6.6-1,.7-.4.2-.9.3-1.4.3s-1,0-1.4-.3c-.4-.2-.8-.4-1-.7-.3-.3-.5-.7-.7-1.1-.2-.4-.2-.9-.2-1.3s0-.9.2-1.3c.2-.4.4-.8.7-1.1.3-.3.6-.6,1-.7.4-.2.9-.3,1.4-.3s1,0,1.4.3c.4.2.8.4,1,.7.3.3.5.7.7,1.1.2.4.2.9.2,1.3s0,.9-.2,1.3Z"/>
              <path fill="#c8cdd3" d="M294.4,180.1c-.2-.3-.6-.6-1-.8-.4-.2-.9-.3-1.6-.3s-1.3.2-1.8.5c-.5.3-.9.7-1.1,1.2h0c0,0,0-.3,0-.6,0-.3,0-.6,0-.9h-1.1c0,.1,0,.3,0,.5,0,.2,0,.4,0,.6,0,.2,0,.5,0,.7,0,.2,0,.4,0,.6v6h1.1v-4.2c0-.6,0-1.1.2-1.5.2-.4.4-.8.6-1.1.3-.3.6-.5.9-.6.4-.1.7-.2,1.1-.2s.8,0,1.1.2c.3.2.5.4.6.6.2.3.3.5.3.9,0,.3,0,.6,0,1v4.9h1.1v-5c0-.5,0-.9-.1-1.3,0-.4-.3-.8-.5-1.1Z"/>
              <path fill="#c8cdd3" d="M139.7,180.5h-1.2l-1.8,3.3-3.1-3.3c.4-.2.7-.4,1-.6s.6-.4.9-.7c.3-.3.5-.6.7-.9.2-.3.2-.7.2-1.2s0-.8-.2-1.1c-.2-.3-.4-.6-.6-.8-.3-.2-.6-.4-.9-.6-.3-.1-.7-.2-1.1-.2s-.8,0-1.2.2c-.4.1-.7.3-1,.6s-.5.6-.7.9c-.2.4-.3.8-.3,1.2s0,.6.1.8c0,.3.2.5.4.8.1.3.3.5.5.7.2.2.4.5.6.7-.4.2-.7.5-1.1.7-.3.2-.7.5-.9.8-.3.3-.5.6-.7,1-.2.4-.3.8-.3,1.3s.1,1.1.3,1.5c.2.5.5.8.8,1.2.3.3.8.6,1.2.8s1,.3,1.5.3c.9,0,1.6-.2,2.3-.6.6-.4,1.2-1,1.7-1.7l1.9,2.1h1.6l-2.9-3.1,2.3-4.1ZM131.6,178c0-.2-.1-.5-.1-.7,0-.5.2-1,.6-1.3.4-.3.8-.5,1.4-.5s.9.2,1.3.5c.3.3.5.7.5,1.2s0,.6-.2.9c-.2.3-.3.5-.6.7-.2.2-.5.4-.8.5s-.5.3-.8.4c-.1-.2-.3-.3-.4-.5-.2-.2-.3-.4-.5-.6s-.3-.4-.3-.7ZM135.4,185.6c-.2.2-.5.4-.7.6-.3.2-.5.3-.8.4s-.6.2-.9.2-.8,0-1.1-.2-.7-.3-.9-.5c-.3-.2-.5-.5-.6-.8-.2-.3-.2-.7-.2-1.1s0-.7.2-1c.1-.3.3-.6.6-.8.2-.2.5-.4.8-.6.3-.2.6-.4.9-.5l3.5,3.7c-.2.3-.4.5-.6.8Z"/>
              <polygon fill="#c8cdd3" points="151.6 175.9 156 175.9 156 187.6 157.1 187.6 157.1 175.9 161.5 175.9 161.5 174.8 151.6 174.8 151.6 175.9"/>
              <path fill="#c8cdd3" d="M170.9,180.2c-.3-.4-.7-.7-1.2-.9-.5-.2-1.1-.3-1.7-.3s-1.2.1-1.7.3c-.5.2-.9.5-1.3.9s-.7.9-.9,1.4c-.2.5-.3,1.1-.3,1.7s0,1.2.3,1.8c.2.5.5,1,.9,1.4s.8.7,1.3.9c.5.2,1.1.3,1.7.3s1.4-.1,2.1-.4c.6-.3,1.1-.7,1.6-1.4l-.8-.7c-.3.5-.7.8-1.2,1.1-.5.3-1.1.4-1.6.4s-1.2-.1-1.6-.4c-.4-.2-.7-.5-1-.9-.2-.3-.4-.7-.5-1,0-.4-.1-.6-.1-.9h7v-.8c0-.5,0-1-.3-1.4-.2-.5-.4-.9-.8-1.3ZM164.9,182.7c0-.1,0-.3.1-.6,0-.3.3-.6.5-.9.2-.3.5-.6.9-.8.4-.2.9-.4,1.5-.4s.8,0,1.1.2.7.3.9.6c.3.2.5.5.6.9.2.3.2.7.2,1h-5.9Z"/>
              <path fill="#c8cdd3" d="M178.9,181c.3-.3.6-.6,1-.7.4-.2.9-.3,1.4-.3s.8,0,1.2.3c.4.2.7.5,1,.8l.9-.7c-.4-.5-.9-.8-1.4-1.1-.5-.3-1.1-.4-1.7-.4s-1.2.1-1.8.3c-.5.2-1,.5-1.4.9s-.7.9-.9,1.4-.3,1.1-.3,1.8.1,1.2.3,1.8.5,1,.9,1.4.8.7,1.4.9c.5.2,1.1.3,1.8.3s1.2-.1,1.7-.4c.5-.2,1-.6,1.4-1.1l-.8-.7c-.3.3-.6.6-1,.8-.4.2-.8.3-1.3.3s-1,0-1.4-.3c-.4-.2-.8-.4-1-.7-.3-.3-.5-.7-.7-1.1-.2-.4-.2-.9-.2-1.3s0-.9.2-1.3c.2-.4.4-.8.7-1.1Z"/>
              <path fill="#c8cdd3" d="M195.7,180.1c-.2-.3-.6-.6-1-.8-.4-.2-.9-.3-1.6-.3s-1.3.2-1.8.5c-.5.3-.9.7-1.1,1.2h0v-6.8h-1.1v13.7h1.1v-4.2c0-.6,0-1.1.2-1.5.2-.4.4-.8.6-1.1.3-.3.6-.5.9-.6.4-.1.7-.2,1.1-.2s.8,0,1.1.2c.3.2.5.4.6.6.2.3.3.5.3.9,0,.3,0,.6,0,1v4.9h1.1v-5c0-.5,0-.9-.1-1.3,0-.4-.3-.8-.5-1.1Z"/>
            </svg>
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
                thumbnails={thumbnails}
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
                  </div>
                )}
                {preview && (
                  <SheetNavigator
                    currentSheet={currentSheet}
                    totalSheets={preview.layout?.total_sheets || 1}
                    onNavigate={setCurrentSheet}
                    duplex={config.duplex}
                    side={currentSide}
                    onSideChange={setCurrentSide}
                  />
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
