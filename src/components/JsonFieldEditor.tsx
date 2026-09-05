import React, { useMemo, useState, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Code, LayoutGrid, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// JsonFieldEditor
//
// Detects whether a content value is JSON (single object `{}` or an array
// of objects `[{}, {}]`) and, if so, renders a friendly "boxes + fields" UI
// instead of a raw textarea. Each object in the array gets its own card,
// each key/value pair inside becomes a labeled input, and nested
// objects/arrays are handled recursively (falling back to a small code
// box only for values that are too irregular to represent as fields,
// e.g. arrays of primitives or deeply nested structures).
// ─────────────────────────────────────────────────────────────────────────

export type JsonKind = 'object' | 'array' | null;

/** Returns 'object' | 'array' | null (not JSON) for a raw string value. */
export function detectJsonKind(raw: string): JsonKind {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      // Only treat as "array of objects" if it actually contains objects.
      // An array of plain strings/numbers isn't a great fit for the box UI.
      if (parsed.length === 0) return 'array';
      if (parsed.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
        return 'array';
      }
      return null;
    }
    if (parsed && typeof parsed === 'object') return 'object';
    return null;
  } catch {
    return null;
  }
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isPlainObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Recursively builds a "blank" copy of a value, preserving the full shape
// (all nested object keys and array-of-object item keys) instead of
// collapsing nested objects/arrays down to {} / '' / []. This is what
// powers "add new item" buttons so a field like `user: { name, email }`
// still has its `name`/`email` sub-fields on the newly created item.
function buildTemplateValue(v: JsonValue): JsonValue {
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return false;
  if (v === null) return null;
  if (Array.isArray(v)) {
    // Nested arrays start empty either way (their own "add" button already
    // templates from a sibling item), so no need to fabricate contents here.
    return [];
  }
  if (isPlainObject(v)) {
    return buildTemplateObject(v);
  }
  return '';
}

function buildTemplateObject(obj: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, buildTemplateValue(v)])
  );
}

/** Returns a new array with the item at `from` moved to `to`. No-op if `to` is out of range. */
function moveArrayItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// ─── Small reusable move-up/move-down control ──────────────────────────
const ReorderButtons: React.FC<{
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
}> = ({ index, count, onMove }) => (
  <div className="flex items-center">
    <button
      type="button"
      onClick={() => onMove(index, index - 1)}
      disabled={index === 0}
      title="Flyt op"
      className="p-1 text-neutral-500 hover:text-neutral-200 disabled:opacity-25 disabled:hover:text-neutral-500 disabled:cursor-not-allowed"
    >
      <ArrowUp size={13} />
    </button>
    <button
      type="button"
      onClick={() => onMove(index, index + 1)}
      disabled={index === count - 1}
      title="Flyt ned"
      className="p-1 text-neutral-500 hover:text-neutral-200 disabled:opacity-25 disabled:hover:text-neutral-500 disabled:cursor-not-allowed"
    >
      <ArrowDown size={13} />
    </button>
  </div>
);

function humanizeLabel(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}

function isLongText(v: JsonPrimitive): boolean {
  return typeof v === 'string' && (v.length > 60 || v.includes('\n'));
}

function isImageUrlKey(key: string, v: JsonPrimitive): boolean {
  if (typeof v !== 'string') return false;
  const k = key.toLowerCase();
  const looksLikeUrl = /^https?:\/\//i.test(v) || v.startsWith('/');
  const looksLikeImageExt = /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(v);
  return looksLikeUrl && (k.includes('image') || k.includes('img') || k.includes('photo') || k.includes('avatar') || k.includes('icon') || looksLikeImageExt);
}

// ─── Primitive field ────────────────────────────────────────────────────
const PrimitiveField: React.FC<{
  fieldKey: string;
  value: JsonPrimitive;
  onChange: (v: JsonPrimitive) => void;
}> = ({ fieldKey, value, onChange }) => {
  const label = humanizeLabel(fieldKey);

  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs text-neutral-300">{label}</label>
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-primary' : 'bg-neutral-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : ''}`} />
        </button>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div>
        <label className="block text-xs text-neutral-300 mb-1">{label}</label>
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="form-input text-sm w-full"
        />
      </div>
    );
  }

  if (value === null) {
    return (
      <div>
        <label className="block text-xs text-neutral-300 mb-1">{label} <span className="text-neutral-500">(tom)</span></label>
        <input
          type="text"
          value=""
          placeholder="null"
          onChange={e => onChange(e.target.value)}
          className="form-input text-sm w-full"
        />
      </div>
    );
  }

  // string
  if (isImageUrlKey(fieldKey, value)) {
    return (
      <div>
        <label className="block text-xs text-neutral-300 mb-1">{label}</label>
        <div className="flex items-center gap-2">
          {value && <img src={value} alt={label} className="w-10 h-10 rounded object-cover border border-neutral-600 shrink-0" />}
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="form-input text-sm w-full font-mono"
            placeholder="https://…"
          />
        </div>
      </div>
    );
  }

  if (isLongText(value)) {
    return (
      <div>
        <label className="block text-xs text-neutral-300 mb-1">{label}</label>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="form-input text-sm w-full"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs text-neutral-300 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="form-input text-sm w-full"
      />
    </div>
  );
};

// ─── String-array field (e.g. tags: ["a","b"]) ─────────────────────────
const StringArrayField: React.FC<{
  fieldKey: string;
  value: JsonPrimitive[];
  onChange: (v: JsonPrimitive[]) => void;
}> = ({ fieldKey, value, onChange }) => {
  const label = humanizeLabel(fieldKey);
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...value, v]);
    setDraft('');
  };

  return (
    <div>
      <label className="block text-xs text-neutral-300 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {value.map((item, i) => (
          <span key={i} className="flex items-center gap-1 pl-2 pr-1 py-1 bg-neutral-700 rounded text-xs text-neutral-200">
            {String(item)}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="p-0.5 hover:text-red-400 text-neutral-400"
            >
              <Trash2 size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Tilføj værdi…"
          className="form-input text-sm flex-1"
        />
        <button type="button" onClick={add} className="px-2.5 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-xs text-neutral-200 flex items-center gap-1">
          <Plus size={12} /> Tilføj
        </button>
      </div>
    </div>
  );
};

// ─── Single object card (recursive: handles nested objects/arrays) ────
const ObjectCard: React.FC<{
  obj: JsonObject;
  onChange: (obj: JsonObject) => void;
  depth?: number;
}> = ({ obj, onChange, depth = 0 }) => {
  const [collapsedNested, setCollapsedNested] = useState<Record<string, boolean>>({});

  const setField = (key: string, value: JsonValue) => {
    onChange({ ...obj, [key]: value });
  };

  const entries = Object.entries(obj);

  return (
    <div className={depth > 0 ? 'space-y-3 pl-3 border-l-2 border-neutral-700' : 'space-y-3'}>
      {entries.map(([key, value]) => {
        if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          return <PrimitiveField key={key} fieldKey={key} value={value as JsonPrimitive} onChange={v => setField(key, v)} />;
        }

        if (Array.isArray(value)) {
          const allPrimitive = value.every(v => v === null || typeof v !== 'object');
          if (allPrimitive) {
            return (
              <StringArrayField
                key={key}
                fieldKey={key}
                value={value as JsonPrimitive[]}
                onChange={v => setField(key, v)}
              />
            );
          }
          // Array of objects nested inside an object — render as sub-cards.
          const label = humanizeLabel(key);
          const collapsed = collapsedNested[key];
          return (
            <div key={key} className="bg-neutral-800/60 rounded-lg p-3 border border-neutral-700">
              <button
                type="button"
                onClick={() => setCollapsedNested(prev => ({ ...prev, [key]: !prev[key] }))}
                className="w-full flex items-center justify-between text-xs font-medium text-neutral-200 mb-2"
              >
                <span>{label} ({value.length})</span>
                {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
              </button>
              {!collapsed && (
                <div className="space-y-2">
                  {(value as JsonObject[]).map((item, i) => (
                    <div key={i} className="bg-neutral-900/60 rounded-lg p-3 relative">
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                        <ReorderButtons
                          index={i}
                          count={(value as JsonObject[]).length}
                          onMove={(from, to) => setField(key, moveArrayItem(value as JsonObject[], from, to))}
                        />
                        <button
                          type="button"
                          onClick={() => setField(key, (value as JsonObject[]).filter((_, idx) => idx !== i))}
                          className="p-1 text-neutral-500 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <ObjectCard
                        obj={item}
                        depth={depth + 1}
                        onChange={updated => {
                          const next = [...(value as JsonObject[])];
                          next[i] = updated;
                          setField(key, next);
                        }}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const template = (value as JsonObject[])[0]
                        ? buildTemplateObject((value as JsonObject[])[0])
                        : {};
                      setField(key, [...(value as JsonObject[]), template]);
                    }}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <Plus size={12} /> Tilføj {label.toLowerCase()}
                  </button>
                </div>
              )}
            </div>
          );
        }

        if (isPlainObject(value)) {
          const label = humanizeLabel(key);
          const collapsed = collapsedNested[key];
          return (
            <div key={key} className="bg-neutral-800/60 rounded-lg p-3 border border-neutral-700">
              <button
                type="button"
                onClick={() => setCollapsedNested(prev => ({ ...prev, [key]: !prev[key] }))}
                className="w-full flex items-center justify-between text-xs font-medium text-neutral-200 mb-2"
              >
                <span>{label}</span>
                {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
              </button>
              {!collapsed && (
                <ObjectCard obj={value} depth={depth + 1} onChange={v => setField(key, v)} />
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

// ─── Top-level editor ───────────────────────────────────────────────────
export interface JsonFieldEditorProps {
  value: string;
  onChange: (rawJsonString: string) => void;
}

const JsonFieldEditor: React.FC<JsonFieldEditorProps> = ({ value, onChange }) => {
  const kind = useMemo(() => detectJsonKind(value), [value]);
  const [mode, setMode] = useState<'friendly' | 'code'>('friendly');
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawDraft, setRawDraft] = useState(value);

  const parsed = useMemo<{ items: JsonObject[]; isArray: boolean } | null>(() => {
    try {
      const p = JSON.parse(value.trim());
      if (Array.isArray(p)) return { items: p, isArray: true };
      return { items: [p], isArray: false };
    } catch {
      return null;
    }
  }, [value]);

  const emit = useCallback((items: JsonObject[], isArray: boolean) => {
    const next = isArray ? items : items[0] ?? {};
    onChange(JSON.stringify(next, null, 2));
  }, [onChange]);

  if (kind === null || !parsed) {
    // Not JSON (or invalid) — caller should fall back to a normal textarea.
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400 flex items-center gap-1.5">
          <LayoutGrid size={12} />
          {parsed.isArray ? `${parsed.items.length} element${parsed.items.length !== 1 ? 'er' : ''}` : 'JSON-objekt'}
        </span>
        <div className="flex gap-1 bg-neutral-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setMode('friendly')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${mode === 'friendly' ? 'bg-primary/20 text-primary' : 'text-neutral-400 hover:text-neutral-200'}`}
          >
            <LayoutGrid size={11} /> Formular
          </button>
          <button
            type="button"
            onClick={() => { setRawDraft(value); setMode('code'); }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${mode === 'code' ? 'bg-primary/20 text-primary' : 'text-neutral-400 hover:text-neutral-200'}`}
          >
            <Code size={11} /> Kode
          </button>
        </div>
      </div>

      {mode === 'code' ? (
        <div className="space-y-2">
          <textarea
            value={rawDraft}
            onChange={e => {
              setRawDraft(e.target.value);
              try { JSON.parse(e.target.value.trim()); setParseError(null); onChange(e.target.value); }
              catch (err: any) { setParseError(err.message); }
            }}
            rows={10}
            spellCheck={false}
            className="form-input text-xs font-mono w-full"
          />
          {parseError && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={12} /> Ugyldig JSON: {parseError}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {parsed.items.map((item, i) => (
            <div key={i} className="bg-neutral-700/30 border border-neutral-600 rounded-lg p-4 relative">
              {parsed.isArray && (
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-neutral-400">#{i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <ReorderButtons
                      index={i}
                      count={parsed.items.length}
                      onMove={(from, to) => emit(moveArrayItem(parsed.items, from, to), parsed.isArray)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = parsed.items.filter((_, idx) => idx !== i);
                        emit(next, parsed.isArray);
                      }}
                      className="p-1 text-neutral-500 hover:text-red-400"
                      title="Slet dette element"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
              <ObjectCard
                obj={item}
                onChange={updated => {
                  const next = [...parsed.items];
                  next[i] = updated;
                  emit(next, parsed.isArray);
                }}
              />
            </div>
          ))}

          {parsed.isArray && (
            <button
              type="button"
              onClick={() => {
                const template = parsed.items[0]
                  ? buildTemplateObject(parsed.items[0])
                  : {};
                emit([...parsed.items, template], true);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-dashed border-primary/40 rounded-lg text-sm transition-colors"
            >
              <Plus size={14} /> Tilføj element
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default JsonFieldEditor;
