import { MarkConfig } from '../App';
import { UnitSystem } from '../utils/unitConversion';

interface Props {
  marks: MarkConfig;
  updateMarks: (patch: Partial<MarkConfig>) => void;
  unit: UnitSystem;
}

const inputClass = "w-full bg-white text-gray-800 text-sm rounded-lg px-2.5 py-1.5 border border-gray-300 focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors";
const labelClass = "text-[11px] text-gray-400 font-medium";

export default function MarkSettings({ marks, updateMarks }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
      <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Marks & Slug</h3>

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" checked={marks.crop_marks_enabled}
          onChange={e => updateMarks({ crop_marks_enabled: e.target.checked })}
          className="rounded" />
        Crop marks
      </label>

      {marks.crop_marks_enabled && (
        <div className="pl-5 space-y-1.5 border-l-2 border-brand-cyan/20 ml-1">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>Length (mm)</label>
              <input type="number" step="0.5" value={marks.crop_mark_length}
                onChange={e => updateMarks({ crop_mark_length: parseFloat(e.target.value) || 0 })}
                className={inputClass} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Offset (mm)</label>
              <input type="number" step="0.5" value={marks.crop_mark_offset}
                onChange={e => updateMarks({ crop_mark_offset: parseFloat(e.target.value) || 0 })}
                className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelClass}>Stroke (pt)</label>
              <input type="number" step="0.05" value={marks.crop_mark_stroke_weight}
                onChange={e => updateMarks({ crop_mark_stroke_weight: parseFloat(e.target.value) || 0 })}
                className={inputClass} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Color</label>
              <select value={marks.crop_mark_color}
                onChange={e => updateMarks({ crop_mark_color: e.target.value as any })}
                className={inputClass}>
                <option value="registration">Registration</option>
                <option value="black_only">Black only</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" checked={marks.registration_marks_enabled}
          onChange={e => updateMarks({ registration_marks_enabled: e.target.checked })}
          className="rounded" />
        Registration marks
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" checked={marks.color_bars_enabled}
          onChange={e => updateMarks({ color_bars_enabled: e.target.checked })}
          className="rounded" />
        Color bars
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" checked={marks.fold_marks_enabled}
          onChange={e => updateMarks({ fold_marks_enabled: e.target.checked })}
          className="rounded" />
        Fold marks
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" checked={marks.slug_info_enabled}
          onChange={e => updateMarks({ slug_info_enabled: e.target.checked })}
          className="rounded" />
        Slug info
      </label>
    </div>
  );
}
