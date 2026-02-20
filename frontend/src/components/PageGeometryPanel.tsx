import { formatValue, UnitSystem } from '../utils/unitConversion';
import { ImpositionConfig } from '../App';

interface Props {
  analysis: any;
  unit: UnitSystem;
  config: ImpositionConfig;
  updateConfig: (patch: Partial<ImpositionConfig>) => void;
}

export default function PageGeometryPanel({ analysis, unit, config, updateConfig }: Props) {
  if (!analysis?.pages?.length) return null;

  const pg = analysis.pages[0];
  const bleed = pg.detected_bleed;

  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
      <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">PDF Analysis</h3>

      <div className="text-xs space-y-1 text-gray-500">
        <p>Pages: <span className="text-gray-800 font-medium">{analysis.page_count}</span></p>
        <p>
          Media: <span className="text-gray-800 font-medium">
            {formatValue(pg.media_box.width, unit)} x {formatValue(pg.media_box.height, unit)}
          </span>
        </p>
        {pg.trim_box && (
          <p>
            Trim: <span className="text-gray-800 font-medium">
              {formatValue(pg.trim_box.width, unit)} x {formatValue(pg.trim_box.height, unit)}
            </span>
          </p>
        )}
        {pg.bleed_box && (
          <p>
            Bleed Box: <span className="text-gray-800 font-medium">
              {formatValue(pg.bleed_box.width, unit)} x {formatValue(pg.bleed_box.height, unit)}
            </span>
          </p>
        )}
        <p>
          Detected Bleed:
          <span className="text-gray-800 font-medium ml-1">
            T:{bleed.top.toFixed(1)} B:{bleed.bottom.toFixed(1)} L:{bleed.left.toFixed(1)} R:{bleed.right.toFixed(1)} mm
          </span>
        </p>
        <p>
          Existing marks: <span className={pg.has_existing_marks
            ? 'text-amber-600 font-medium'
            : 'text-emerald-600 font-medium'
          }>
            {pg.has_existing_marks ? 'Detected (will be stripped)' : 'None'}
          </span>
        </p>
      </div>

      {analysis.warnings?.length > 0 && (
        <div className="space-y-1">
          {analysis.warnings.map((w: string, i: number) => (
            <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-1.5 rounded-lg">{w}</p>
          ))}
        </div>
      )}

      {/* Editable trim */}
      <div className="pt-2 border-t border-gray-100">
        <p className="text-[11px] text-gray-400 mb-1.5 font-medium">Trim size (editable):</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[11px] text-gray-400 font-medium">W</label>
            <input
              type="number"
              step="0.1"
              value={config.trim_width}
              onChange={e => updateConfig({ trim_width: parseFloat(e.target.value) || 0 })}
              className="w-full bg-white text-gray-800 text-sm rounded-lg px-2.5 py-1.5 border border-gray-300 focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-gray-400 font-medium">H</label>
            <input
              type="number"
              step="0.1"
              value={config.trim_height}
              onChange={e => updateConfig({ trim_height: parseFloat(e.target.value) || 0 })}
              className="w-full bg-white text-gray-800 text-sm rounded-lg px-2.5 py-1.5 border border-gray-300 focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
