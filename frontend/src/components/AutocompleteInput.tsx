import { useState, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';

const PREFIX = 'autocomplete_';

export function getSuggestions(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(PREFIX + key) || '[]'); } catch { return []; }
}

export function saveSuggestion(key: string, value: string) {
  const v = value.trim();
  if (!v) return;
  const list = getSuggestions(key);
  if (list.includes(v)) return;
  localStorage.setItem(PREFIX + key, JSON.stringify([...list, v]));
}

export function removeSuggestion(key: string, value: string) {
  const list = getSuggestions(key);
  localStorage.setItem(PREFIX + key, JSON.stringify(list.filter(s => s !== value)));
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  storageKey: string;
  placeholder?: string;
  className?: string;
  /** Zusätzliche Vorschläge aus der DB (ohne Löschen-Button) */
  extraSuggestions?: string[];
}

export default function AutocompleteInput({ value, onChange, storageKey, placeholder, className, extraSuggestions = [] }: Props) {
  const [localSuggestions, setLocalSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function reload() {
    setLocalSuggestions(getSuggestions(storageKey));
  }

  useEffect(() => { reload(); }, [storageKey]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Alle Vorschläge: zuerst lokale, dann Extra-Vorschläge (die nicht lokal sind)
  const allSuggestions = [
    ...localSuggestions,
    ...extraSuggestions.filter(s => !localSuggestions.includes(s)),
  ];

  const filtered = allSuggestions.filter(s =>
    s.toLowerCase().includes(value.toLowerCase()) &&
    s.toLowerCase() !== value.toLowerCase()
  );

  function handleDelete(s: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    removeSuggestion(storageKey, s);
    reload();
  }

  function handleBlur() {
    if (value.trim()) {
      saveSuggestion(storageKey, value.trim());
      reload();
    }
    setTimeout(() => setOpen(false), 120);
  }

  function pick(s: string) {
    onChange(s);
    saveSuggestion(storageKey, s);
    reload();
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={className}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { reload(); setOpen(true); }}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto py-1">
          {filtered.map(s => {
            const isLocal = localSuggestions.includes(s);
            return (
              <li key={s} className="flex items-center gap-1 px-2 hover:bg-gray-50">
                <button
                  type="button"
                  className="flex-1 text-left px-2 py-2 text-sm truncate"
                  onMouseDown={() => pick(s)}
                >
                  {s}
                </button>
                {isLocal && (
                  <button
                    type="button"
                    onMouseDown={e => handleDelete(s, e)}
                    className="flex-shrink-0 p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                    title="Vorschlag löschen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
