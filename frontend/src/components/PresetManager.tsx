import { useState, useEffect, useCallback } from 'react';
import { listPresets, getPreset, savePreset } from '../utils/api';
import { ImpositionConfig } from '../App';

interface Props {
  config: ImpositionConfig;
  onLoad: (config: ImpositionConfig) => void;
}

export default function PresetManager({ config, onLoad }: Props) {
  const [presets, setPresets] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');

  const fetchPresets = useCallback(async () => {
    try {
      const data = await listPresets();
      setPresets(data.presets || []);
    } catch {}
  }, []);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const handleLoad = async (id: string) => {
    try {
      const data = await getPreset(id);
      if (data.config) {
        onLoad(data.config as ImpositionConfig);
      }
    } catch {}
    setShowDropdown(false);
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    try {
      await savePreset(saveName.trim(), config);
      await fetchPresets();
      setShowSave(false);
      setSaveName('');
    } catch {}
  };

  return (
    <div className="relative flex gap-1">
      <button
        onClick={() => { setShowDropdown(!showDropdown); setShowSave(false); }}
        className="bg-white border border-gray-300 hover:border-gray-400 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-50"
      >
        Load Preset
      </button>
      <button
        onClick={() => { setShowSave(!showSave); setShowDropdown(false); }}
        className="bg-white border border-gray-300 hover:border-gray-400 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-50"
      >
        Save Preset
      </button>

      {showDropdown && (
        <div className="absolute bottom-full right-0 mb-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-64 overflow-y-auto">
          {presets.length === 0 ? (
            <p className="p-3 text-gray-400 text-sm">No presets available</p>
          ) : (
            presets.map(p => (
              <button
                key={p.id}
                onClick={() => handleLoad(p.id)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-brand-cyan-light border-b border-gray-100 last:border-0 transition-colors"
              >
                <span className="block font-medium">{p.name}</span>
                {p.builtin && (
                  <span className="text-xs text-gray-400">Built-in</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {showSave && (
        <div className="absolute bottom-full right-0 mb-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-30 p-3">
          <input
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Preset name..."
            className="w-full bg-white text-gray-800 text-sm rounded-lg px-3 py-1.5 border border-gray-300 mb-2 focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan outline-none transition-colors"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <button
            onClick={handleSave}
            className="w-full bg-brand-cyan hover:bg-brand-cyan-hover text-white py-1.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
