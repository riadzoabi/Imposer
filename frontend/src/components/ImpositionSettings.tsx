import { ImpositionConfig, BleedConfig, SheetConfig } from '../App';
import { UnitSystem, fromMM, toMM } from '../utils/unitConversion';

interface Props {
  config: ImpositionConfig;
  updateConfig: (patch: Partial<ImpositionConfig>) => void;
  updateBleed: (patch: Partial<BleedConfig>) => void;
  updateSheet: (patch: Partial<SheetConfig>) => void;
  unit: UnitSystem;
}

const SHEET_PRESETS = [
  { name: 'SRA3 (320x450)', w: 320, h: 450 },
  { name: 'SRA2 (450x640)', w: 450, h: 640 },
  { name: 'SRA4 (225x320)', w: 225, h: 320 },
  { name: 'A3 (297x420)', w: 297, h: 420 },
  { name: 'A4 (210x297)', w: 210, h: 297 },
  { name: '13x19" (330x483)', w: 330.2, h: 482.6 },
  { name: '12x18" (305x457)', w: 304.8, h: 457.2 },
];

const inputClass = "w-full bg-white text-gray-800 text-sm rounded-lg px-2.5 py-1.5 border border-gray-300 focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors";
const selectClass = "w-full bg-white text-gray-700 text-sm rounded-lg px-2.5 py-1.5 border border-gray-300 focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors";
const labelClass = "text-[11px] text-gray-400 font-medium";
const sectionClass = "rounded-xl border border-gray-200 p-3 space-y-2";
const headingClass = "text-[11px] font-semibold text-gray-400 uppercase tracking-wider";

export default function ImpositionSettings({
  config, updateConfig, updateBleed, updateSheet, unit,
}: Props) {
  return (
    <div className="space-y-2.5">
      {/* Mode */}
      <div className={sectionClass}>
        <h3 className={headingClass}>Imposition Mode</h3>
        <select
          value={config.mode}
          onChange={e => updateConfig({ mode: e.target.value })}
          className={selectClass}
        >
          <option value="step_and_repeat">Step & Repeat</option>
          <option value="cut_and_stack">Cut & Stack</option>
          <option value="booklet_saddle_stitch">Saddle Stitch Booklet</option>
          <option value="booklet_perfect_bind">Perfect Bind</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={config.auto_rotate}
            onChange={e => updateConfig({ auto_rotate: e.target.checked })}
            className="rounded"
          />
          Auto-rotate for best fit
        </label>
      </div>

      {/* Sheet Size */}
      <div className={sectionClass}>
        <h3 className={headingClass}>Sheet Size</h3>
        <select
          onChange={e => {
            const preset = SHEET_PRESETS.find(p => p.name === e.target.value);
            if (preset) updateSheet({ sheet_width: preset.w, sheet_height: preset.h });
          }}
          className={selectClass}
          defaultValue=""
        >
          <option value="" disabled>Select preset...</option>
          {SHEET_PRESETS.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>Width (mm)</label>
            <input
              type="number" step="0.1" value={config.sheet.sheet_width}
              onChange={e => updateSheet({ sheet_width: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>Height (mm)</label>
            <input
              type="number" step="0.1" value={config.sheet.sheet_height}
              onChange={e => updateSheet({ sheet_height: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>Grip edge (mm)</label>
            <input
              type="number" step="0.5" value={config.sheet.grip_edge}
              onChange={e => updateSheet({ grip_edge: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label className={labelClass}>Mark margin (mm)</label>
            <input
              type="number" step="0.5" value={config.sheet.mark_margin}
              onChange={e => updateSheet({ mark_margin: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Bleed */}
      <div className={sectionClass}>
        <h3 className={headingClass}>Bleed</h3>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={config.bleed.uniform}
            onChange={e => {
              const uniform = e.target.checked;
              if (uniform) {
                updateBleed({ uniform, bottom: config.bleed.top, left: config.bleed.top, right: config.bleed.top });
              } else {
                updateBleed({ uniform });
              }
            }}
            className="rounded"
          />
          Uniform bleed
        </label>
        {config.bleed.uniform ? (
          <div>
            <label className={labelClass}>All sides (mm)</label>
            <input
              type="number" step="0.5" value={config.bleed.top}
              onChange={e => updateBleed({ top: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {(['top', 'bottom', 'left', 'right'] as const).map(side => (
              <div key={side}>
                <label className={`${labelClass} capitalize`}>{side} (mm)</label>
                <input
                  type="number" step="0.5" value={config.bleed[side]}
                  onChange={e => updateBleed({ [side]: parseFloat(e.target.value) || 0 })}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className={labelClass}>Gap between items (mm)</label>
          <input
            type="number" step="0.5" value={config.gap_between_items}
            onChange={e => updateConfig({ gap_between_items: parseFloat(e.target.value) || 0 })}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}
