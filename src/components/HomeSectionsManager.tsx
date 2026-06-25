import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, X, ArrowUp, ArrowDown, Code, FileCode, List, ListOrdered, Bold, Italic, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../utils/supabase';
import ImageUpload from './ImageUpload';
import toast from 'react-hot-toast';
import EditableContent from './EditableContent';
import { DEPLOYED_HOME_SECTIONS } from '../pages/HomePage';
import HomeSectionCard from './HomeSectionCard';
import CodeProjectRenderer from './CodeProjectRenderer';

interface CodeFile {
  filename: string;
  language: 'tsx';
  content: string;
}

interface HomeSection {
  id: string;
  title: string;
  description: string;
  image_url?: string;
  image_url_2?: string;
  image_url_3?: string;
  order_index: number;
  is_active: boolean;
  section_type: 'standard' | 'code';
  code_files?: CodeFile[];
  created_at: string;
  updated_at: string;
}

// A mutable draft — decoupled from the immutable sections list
type SectionDraft = {
  title: string;
  description: string;
  image_url: string;
  image_url_2: string;
  image_url_3: string;
  is_active: boolean;
  section_type: 'standard' | 'code';
  code_files: CodeFile[];
};

interface SectionConflict {
  sectionId: string;
  databaseVersion: HomeSection;
  deployedVersion: Partial<HomeSection>;
  differences: string[];
}

interface ScanResult {
  conflicts: SectionConflict[];
  sectionsToDeployDirectly: HomeSection[];
  deployedSections: HomeSection[];
  totalDatabaseSections: number;
  totalDeployedSections: number;
}

interface DeployResult {
  deployedSections: string[];
  deletedFromDB: number;
  commitSha: string | null;
  commitUrl: string | null;
  netlifyTriggered: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// RichTextEditor
// ---------------------------------------------------------------------------
interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (isInternalUpdate.current) { isInternalUpdate.current = false; return; }
    if (el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    isInternalUpdate.current = true;
    onChange(el.innerHTML);
  }, [onChange]);

  const exec = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, undefined);
    handleInput();
  };

  const isEmpty = !value || value === '<br>' || value === '';

  return (
    <div className="rounded-lg border border-neutral-600 overflow-hidden focus-within:border-primary transition-colors">
      <div className="flex items-center gap-1 px-2 py-1 bg-neutral-700 border-b border-neutral-600">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} className="p-1.5 rounded hover:bg-neutral-600 text-neutral-300 hover:text-white transition-colors" title="Fed"><Bold size={14} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} className="p-1.5 rounded hover:bg-neutral-600 text-neutral-300 hover:text-white transition-colors" title="Kursiv"><Italic size={14} /></button>
        <div className="w-px h-4 bg-neutral-600 mx-1" />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }} className="p-1.5 rounded hover:bg-neutral-600 text-neutral-300 hover:text-white transition-colors" title="Punktliste"><List size={14} /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }} className="p-1.5 rounded hover:bg-neutral-600 text-neutral-300 hover:text-white transition-colors" title="Nummereret liste"><ListOrdered size={14} /></button>
      </div>
      <div className="relative">
        {isEmpty && <span className="absolute top-2 left-3 text-neutral-500 pointer-events-none select-none text-sm" aria-hidden>{placeholder}</span>}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={(e) => {
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');
            if (html) {
              const allowed = /<\/?(ul|ol|li|b|strong|i|em|br|p)\b[^>]*>/gi;
              const cleaned = html
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<\/?(div|span|h[1-6]|section|article|header|footer|table|tr|td|th)[^>]*>/gi, '')
                .replace(/<[^>]+>/g, (tag) => (allowed.test(tag) ? tag : ''));
              document.execCommand('insertHTML', false, cleaned);
            } else {
              document.execCommand('insertHTML', false,
                text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'));
            }
            handleInput();
          }}
          className="min-h-[80px] px-3 py-2 text-sm text-neutral-100 outline-none [&_ul]:list-disc[&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic"
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SectionForm
// ---------------------------------------------------------------------------
interface SectionFormProps {
  section: SectionDraft;
  onChange: (updates: Partial<SectionDraft>) => void;
  formId: string;
}

const SectionForm: React.FC<SectionFormProps> = ({ section, onChange, formId }) => {
  const onTypeChange = (type: 'standard' | 'code') => {
    if (type === 'code' && section.code_files.length === 0) {
      onChange({ section_type: type, code_files: [{ filename: 'component.tsx', language: 'tsx', content: '' }] });
    } else {
      onChange({ section_type: type });
    }
  };

  const tsxContent = section.code_files[0]?.content ?? '';

  return (
    <div className="space-y-4">
      {/* Type selector */}
      <div>
        <label className="form-label">
          <EditableContent contentKey="home-sections-manager-sektion-type" fallback="Sektion Type" />
        </label>
        <select value={section.section_type} onChange={(e) => onTypeChange(e.target.value as 'standard' | 'code')} className="form-input">
          <option value="standard"><EditableContent contentKey="home-sections-manager-standard-billede-tekst" fallback="Standard (Billede + Tekst)" /></option>
          <option value="code"><EditableContent contentKey="home-sections-manager-tsx-komponent" fallback="TSX Komponent" /></option>
        </select>
      </div>

      {section.section_type === 'standard' ? (
        <>
          <div>
            <label className="form-label">
              <EditableContent contentKey="home-sections-manager-titel" fallback="Titel" />
            </label>
            <input type="text" value={section.title} onChange={(e) => onChange({ title: e.target.value })} className="form-input" placeholder="Indtast titel" />
          </div>

          <div>
            <label className="form-label">
              <EditableContent contentKey="home-sections-manager-beskrivelse" fallback="Beskrivelse" />
            </label>
            <RichTextEditor value={section.description} onChange={(html) => onChange({ description: html })} placeholder="Indtast beskrivelse" />
          </div>

          {/* Image 1 */}
          <div>
            <label className="form-label">
              <EditableContent contentKey="home-sections-manager-billede" fallback="Billede 1 (primært, påkrævet)" />
            </label>
            <ImageUpload onImageUploaded={(url) => onChange({ image_url: url })} bucket="home-sections" />
            {section.image_url && (
              <div className="mt-2 flex items-start gap-2">
                <img src={section.image_url} alt="Preview 1" className="w-full h-32 object-cover rounded-lg" />
                <button type="button" onClick={() => onChange({ image_url: '' })} className="p-1.5 text-neutral-400 hover:text-error transition-colors flex-shrink-0"><X size={16} /></button>
              </div>
            )}
          </div>

          {/* Image 2 */}
          <div>
            <label className="form-label"><EditableContent contentKey="home-sections-manager-billede-2" fallback="Billede 2" /> <span className="text-neutral-500 font-normal"><EditableContent contentKey="home-sections-manager-valgfrit-2" fallback="(valgfrit)" /></span></label>
            <ImageUpload onImageUploaded={(url) => onChange({ image_url_2: url })} bucket="home-sections" />
            {section.image_url_2 && (
              <div className="mt-2 flex items-start gap-2">
                <img src={section.image_url_2} alt="Preview 2" className="h-24 object-cover rounded-lg" />
                <button type="button" onClick={() => onChange({ image_url_2: '' })} className="p-1.5 text-neutral-400 hover:text-error transition-colors flex-shrink-0"><X size={16} /></button>
              </div>
            )}
          </div>

          {/* Image 3 */}
          <div>
            <label className="form-label"><EditableContent contentKey="home-sections-manager-billede-3" fallback="Billede 3" /> <span className="text-neutral-500 font-normal"><EditableContent contentKey="home-sections-manager-valgfrit" fallback="(valgfrit)" /></span></label>
            <ImageUpload onImageUploaded={(url) => onChange({ image_url_3: url })} bucket="home-sections" />
            {section.image_url_3 && (
              <div className="mt-2 flex items-start gap-2">
                <img src={section.image_url_3} alt="Preview 3" className="h-24 object-cover rounded-lg" />
                <button type="button" onClick={() => onChange({ image_url_3: '' })} className="p-1.5 text-neutral-400 hover:text-error transition-colors flex-shrink-0"><X size={16} /></button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* TSX editor */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="form-label">
                <EditableContent contentKey="home-sections-manager-project-filer" fallback="TSX Komponent" />
              </label>
              <span className="flex items-center gap-1.5 text-xs text-blue-300 bg-blue-500/20 border border-blue-500/30 rounded-full px-2.5 py-0.5 font-mono">
                <Code size={11} /><EditableContent contentKey="home-sections-manager-component-tsx-2" fallback="component.tsx" />
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              <EditableContent contentKey="home-sections-manager-skriv-en-react-komponent-i" fallback="Skriv en React-komponent i TSX med" /> <code className="bg-neutral-700 px-1 rounded"><EditableContent contentKey="home-sections-manager-export-default" fallback="export default" /></code><EditableContent contentKey="home-sections-manager-du-kan-bruge-inline-styles" fallback=".               Du kan bruge inline styles eller Tailwind-klasser." />
            </p>
            <div className="rounded-lg border border-neutral-600 overflow-hidden focus-within:border-primary transition-colors">
              <div className="flex items-center gap-2 px-3 py-2 bg-neutral-700 border-b border-neutral-600">
                <FileCode size={14} className="text-blue-400" />
                <span className="text-xs font-mono text-blue-300"><EditableContent contentKey="home-sections-manager-component-tsx" fallback="component.tsx" /></span>
                <span className="ml-auto text-xs text-neutral-500"><EditableContent contentKey="home-sections-manager-tsx-react" fallback="TSX · React" /></span>
              </div>
              <textarea
                value={tsxContent}
                onChange={(e) => onChange({ code_files:[{ filename: 'component.tsx', language: 'tsx', content: e.target.value }] })}
                className="w-full bg-neutral-900 text-neutral-100 font-mono text-sm px-4 py-3 outline-none resize-none leading-relaxed"
                rows={20}
                placeholder={`const MySection = () => (\n  <div style={{ background: '#262626', padding: '48px 20px' }}>\n    <h2 style={{ color: 'white' }}>Hello!</h2>\n  </div>\n);\n\nexport default MySection;`}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>
          </div>

          <div>
            <label className="form-label"><EditableContent contentKey="home-sections-manager-titel" fallback="Titel" /> <span className="text-neutral-500 font-normal"><EditableContent contentKey="home-sections-manager-intern-reference" fallback="(intern reference)" /></span></label>
            <input type="text" value={section.title} onChange={(e) => onChange({ title: e.target.value })} className="form-input" placeholder="f.eks. Hvorfor Flai?" />
          </div>
        </>
      )}

      <div className="flex items-center">
        <input type="checkbox" id={`${formId}-active`} checked={section.is_active} onChange={(e) => onChange({ is_active: e.target.checked })} className="mr-2" />
        <label htmlFor={`${formId}-active`} className="text-neutral-300">
          <EditableContent contentKey="home-sections-manager-aktiv" fallback="Aktiv" />
        </label>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Conflict Resolution Modal
// ---------------------------------------------------------------------------
interface ConflictResolutionModalProps {
  conflicts: SectionConflict[];
  onResolve: (selections: Record<string, 'database' | 'deployed'>) => void;
  onCancel: () => void;
}

const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({ conflicts, onResolve, onCancel }) => {
  const[selections, setSelections] = useState<Record<string, 'database' | 'deployed'>>(() => {
    const init: Record<string, 'database' | 'deployed'> = {};
    conflicts.forEach(c => { init[c.sectionId] = 'database'; });
    return init;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-neutral-800 border-b border-neutral-700 p-6 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><AlertCircle className="text-warning" size={24} /><h2 className="text-2xl font-bold text-white"><EditableContent contentKey="home-sections-manager-sections-conflict-detected" fallback="Sections Conflict Detected" /></h2></div>
            <button onClick={onCancel} className="text-neutral-400 hover:text-white transition-colors"><X size={24} /></button>
          </div>
          <p className="text-neutral-300 mt-2"><EditableContent contentKey="home-sections-manager-choose-which-version-to-keep" fallback="Choose which version to keep for each section." /></p>
        </div>
        <div className="p-6 space-y-6">
          {conflicts.map((conflict) => (
            <div key={conflict.sectionId} className="bg-neutral-900 rounded-lg p-6 border border-neutral-700">
              <h3 className="text-xl font-semibold text-white mb-2">{conflict.databaseVersion.title}</h3>
              <p className="text-sm text-neutral-400 mb-4"><EditableContent contentKey="home-sections-manager-differences" fallback="Differences:" /> {conflict.differences.join(', ')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  { key: 'database' as const, label: 'Database Version (New)', data: conflict.databaseVersion },
                  { key: 'deployed' as const, label: 'Deployed Version (Current)', data: conflict.deployedVersion as HomeSection },
                ]).map(({ key, label, data }) => (
                  <div key={key}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${selections[conflict.sectionId] === key ? 'border-primary bg-primary/10' : 'border-neutral-600 hover:border-neutral-500'}`}
                    onClick={() => setSelections(prev => ({ ...prev, [conflict.sectionId]: key }))}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-white">{label}</h4>
                      <input type="radio" checked={selections[conflict.sectionId] === key} onChange={() => setSelections(prev => ({ ...prev, [conflict.sectionId]: key }))} className="w-4 h-4" />
                    </div>
                    <div className="space-y-2 text-sm">
                      <div><span className="text-neutral-400"><EditableContent contentKey="home-sections-manager-title-2" fallback="Title:" /></span><span className="text-white ml-2">{data.title || 'N/A'}</span></div>
                      <div><span className="text-neutral-400"><EditableContent contentKey="home-sections-manager-active-2" fallback="Active:" /></span><span className="text-white ml-2">{data.is_active !== undefined ? (data.is_active ? 'Yes' : 'No') : 'N/A'}</span></div>
                      {data.image_url && <img src={data.image_url} alt="Preview" className="w-full h-32 object-cover rounded mt-2" />}
                      <div><span className="text-neutral-400"><EditableContent contentKey="home-sections-manager-description-2" fallback="Description:" /></span><div className="text-white ml-2 text-xs mt-1 max-h-20 overflow-y-auto" dangerouslySetInnerHTML={{ __html: data.description || 'N/A' }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 bg-neutral-800 border-t border-neutral-700 p-6 flex justify-end gap-4">
          <button onClick={onCancel} className="px-6 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors"><EditableContent contentKey="home-sections-manager-cancel" fallback="Cancel" /></button>
          <button onClick={() => onResolve(selections)} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"><CheckCircle2 size={20} /><EditableContent contentKey="home-sections-manager-deploy-selected-versions" fallback="Deploy Selected Versions" /></button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Conflict resolution cache
// ---------------------------------------------------------------------------
const CONFLICT_CACHE_KEY = 'home_sections_conflict_cache';
type ConflictResolution = { choice: 'hardcoded' | 'database' | 'deleted'; hardcodedHash: string };
type ConflictCache = Record<string, ConflictResolution>;

function hashSection(s: Partial<HomeSection>): string {
  let hash = 0;
  const str = JSON.stringify({ title: s.title, description: s.description, image_url: s.image_url, image_url_2: s.image_url_2, image_url_3: s.image_url_3, order_index: s.order_index, is_active: s.is_active, section_type: s.section_type, code_files: s.code_files });
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return hash.toString(36);
}
function loadConflictCache(): ConflictCache { try { const r = localStorage.getItem(CONFLICT_CACHE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; } }
function saveConflictCache(c: ConflictCache): void { try { localStorage.setItem(CONFLICT_CACHE_KEY, JSON.stringify(c)); } catch {} }

function recordConflictChoice(id: string, choice: 'hardcoded' | 'database' | 'deleted', section: Partial<HomeSection>): void { 
  const c = loadConflictCache(); 
  c[id] = { choice, hardcodedHash: hashSection(section) }; 
  saveConflictCache(c); 
}

function getCachedChoice(id: string, section: Partial<HomeSection>): 'hardcoded' | 'database' | 'deleted' | null { 
  const c = loadConflictCache(); 
  const e = c[id]; 
  if (!e) return null; 
  if (e.hardcodedHash !== hashSection(section)) return null; 
  return e.choice; 
}

function isCachedAsDatabase(id: string): boolean { return loadConflictCache()[id]?.choice === 'database'; }

function getDeletedHardcodedIds(): string[] { 
  return Object.entries(loadConflictCache()).filter(([, e]) => e.choice === 'deleted').map(([id]) => id); 
}

// ---------------------------------------------------------------------------
// Load Conflict Modal
// ---------------------------------------------------------------------------
interface LoadConflictModalProps {
  conflicts: Array<{ hardcodedSection: HomeSection; databaseSection: HomeSection }>;
  onResolve: (resolutions: Record<string, 'hardcoded' | 'database'>) => void;
}

const LoadConflictModal: React.FC<LoadConflictModalProps> = ({ conflicts, onResolve }) => {
  const [resolutions, setResolutions] = useState<Record<string, 'hardcoded' | 'database'>>(() => {
    const init: Record<string, 'hardcoded' | 'database'> = {};
    conflicts.forEach(c => { 
      // Safely default to 'database' if 'deleted' is somehow here
      const cached = getCachedChoice(c.hardcodedSection.id, c.hardcodedSection);
      init[c.hardcodedSection.id] = (cached === 'hardcoded' || cached === 'database') ? cached : 'database'; 
    });
    return init;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-neutral-800 border-b border-neutral-700 p-6 z-10">
          <div className="flex items-center gap-3"><AlertCircle className="text-warning" size={24} /><h2 className="text-2xl font-bold text-white"><EditableContent contentKey="home-sections-manager-section-conflicts-detected" fallback="Section Conflicts Detected" /></h2></div>
          <p className="text-neutral-300 mt-2"><EditableContent contentKey="home-sections-manager-choose-which-version-to-use" fallback="Choose which version to use for sections that exist in both deployed code and database." /></p>
        </div>
        <div className="p-6 space-y-6">
          {conflicts.map((conflict) => (
            <div key={conflict.hardcodedSection.id} className="bg-neutral-900 rounded-lg p-6 border border-neutral-700">
              <h3 className="text-xl font-semibold text-white mb-2">{conflict.hardcodedSection.title}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  { key: 'hardcoded' as const, label: 'Deployed Version (Hardcoded)', data: conflict.hardcodedSection },
                  { key: 'database' as const, label: 'Database Version', data: conflict.databaseSection },
                ]).map(({ key, label, data }) => (
                  <div key={key}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${resolutions[conflict.hardcodedSection.id] === key ? 'border-primary bg-primary/10' : 'border-neutral-600 hover:border-neutral-500'}`}
                    onClick={() => setResolutions(prev => ({ ...prev, [conflict.hardcodedSection.id]: key }))}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-white">{label}</h4>
                      <input type="radio" checked={resolutions[conflict.hardcodedSection.id] === key} onChange={() => setResolutions(prev => ({ ...prev, [conflict.hardcodedSection.id]: key }))} className="w-4 h-4" />
                    </div>
                    <div className="space-y-2 text-sm">
                      <div><span className="text-neutral-400"><EditableContent contentKey="home-sections-manager-title" fallback="Title:" /></span><span className="text-white ml-2">{data.title}</span></div>
                      <div><span className="text-neutral-400"><EditableContent contentKey="home-sections-manager-active" fallback="Active:" /></span><span className="text-white ml-2">{data.is_active ? 'Yes' : 'No'}</span></div>
                      {data.image_url && <img src={data.image_url} alt="Preview" className="w-full h-32 object-cover rounded mt-2" />}
                      <div><span className="text-neutral-400"><EditableContent contentKey="home-sections-manager-description" fallback="Description:" /></span><div className="text-white ml-2 text-xs mt-1 max-h-20 overflow-y-auto" dangerouslySetInnerHTML={{ __html: data.description }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 bg-neutral-800 border-t border-neutral-700 p-6 flex justify-end">
          <button onClick={() => onResolve(resolutions)} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"><CheckCircle2 size={20} /><EditableContent contentKey="home-sections-manager-apply-selections" fallback="Apply Selections" /></button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BLANK_DRAFT: SectionDraft = { title: '', description: '', image_url: '', image_url_2: '', image_url_3: '', is_active: true, section_type: 'standard', code_files:[] };

function sectionToDraft(s: HomeSection): SectionDraft {
  return { title: s.title, description: s.description, image_url: s.image_url ?? '', image_url_2: s.image_url_2 ?? '', image_url_3: s.image_url_3 ?? '', is_active: s.is_active, section_type: s.section_type, code_files: s.code_files ?? [] };
}

function collectUsedImages(draft: SectionDraft): string[] {
  const urls = new Set<string>();
  const base = import.meta.env.VITE_SUPABASE_URL;
  const add = (u?: string) => { if (u && base && u.includes(base)) urls.add(u); };
  add(draft.image_url); add(draft.image_url_2); add(draft.image_url_3);
  draft.code_files.forEach(f => (f.content.match(/https?:\/\/[^\s"'`]+supabase[^\s"'`]*/g) ??[]).forEach(add));
  return Array.from(urls);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const HomeSectionsManager: React.FC = () => {
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit draft — isolated from the sections list so image uploads never re-sort
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SectionDraft>(BLANK_DRAFT);

  // Add draft
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDraft, setNewDraft] = useState<SectionDraft>(BLANK_DRAFT);

  // Deploy
  const [isDeploying, setIsDeploying] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const[showConflictModal, setShowConflictModal] = useState(false);

  // Hardcoded / conflict state
  const[hardcodedSections, setHardcodedSections] = useState<HomeSection[]>([]);
  const[loadConflicts, setLoadConflicts] = useState<Array<{ hardcodedSection: HomeSection; databaseSection: HomeSection }>>([]);
  const [showLoadConflictModal, setShowLoadConflictModal] = useState(false);

  useEffect(() => { fetchSections(); },[]);

  const fetchSections = async () => {
    try {
      const { data: dbData, error: dbError } = await supabase.from('home_sections').select('*').order('order_index', { ascending: true });
      if (dbError) throw dbError;
      const dbSections = dbData || [];

      let hardcoded: HomeSection[] = DEPLOYED_HOME_SECTIONS as unknown as HomeSection[];
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deploy-home-sections-to-github`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scan' }),
          });
          if (res.ok) {
            const sr: ScanResult = await res.json();
            if (sr.deployedSections?.length > 0) hardcoded = sr.deployedSections;
          }
        }
      } catch (e) { console.warn('Could not fetch deployed sections from GitHub:', e); }

      setHardcodedSections(hardcoded);

      const conflicts: Array<{ hardcodedSection: HomeSection; databaseSection: HomeSection }> =[];
      for (const hs of hardcoded) {
        const dbMatch = dbSections.find(db => db.id === hs.id || db.title === hs.title);
        if (!dbMatch) continue;
        const cached = getCachedChoice(hs.id, hs);
        if (cached !== null) {
          if (cached === 'hardcoded' || cached === 'deleted') await supabase.from('home_sections').delete().eq('id', dbMatch.id);
          continue;
        }
        conflicts.push({ hardcodedSection: hs, databaseSection: dbMatch });
      }

      if (conflicts.length > 0) {
        setLoadConflicts(conflicts);
        setShowLoadConflictModal(true);
        mergeSections(hardcoded, dbSections);
      } else {
        const { data: freshDb } = await supabase.from('home_sections').select('*').order('order_index', { ascending: true });
        mergeSections(hardcoded, freshDb ||[]);
      }
    } catch (err) {
      console.error('Error fetching home sections:', err);
      toast.error('Kunne ikke hente sektioner');
    } finally {
      setLoading(false);
    }
  };

  const mergeSections = (hardcoded: HomeSection[], database: HomeSection[]) => {
    const dbIds = new Set(database.map(s => s.id));
    const hardcodedToShow = hardcoded.filter(h => {
      if (dbIds.has(h.id)) return false;
      const cache = loadConflictCache();
      const entry = cache[h.id];
      // Hide section entirely if it's explicitly marked as deleted
      if (entry?.choice === 'deleted') return false;
      
      // Clear out database overrides once resolved, otherwise fallthrough to show it
      if (entry?.choice === 'database') { delete cache[h.id]; saveConflictCache(cache); return true; }
      return true;
    });

    const merged =[...database, ...hardcodedToShow];
    merged.sort((a, b) => a.order_index - b.order_index);
    const normalised = merged.map((s, i) => ({ ...s, order_index: i }));
    setSections(normalised);
  };

  // Stable callbacks
  const handleEditDraftChange = useCallback((updates: Partial<SectionDraft>) => {
    setEditDraft(prev => ({ ...prev, ...updates }));
  },[]);

  const handleNewDraftChange = useCallback((updates: Partial<SectionDraft>) => {
    setNewDraft(prev => ({ ...prev, ...updates }));
  },[]);

  const startEditing = useCallback((section: HomeSection) => {
    setEditingId(section.id);
    setEditDraft(sectionToDraft(section));
  },[]);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditDraft(BLANK_DRAFT);
  },[]);

  // ---------------------------------------------------------------------------
  // Add — optimistic
  // ---------------------------------------------------------------------------
  const handleAddSection = async () => {
    if (newDraft.section_type === 'standard') {
      if (!newDraft.title.trim() || !newDraft.description.trim() || !newDraft.image_url) {
        toast.error('Udfyld alle felter for standard sektion'); return;
      }
    } else if (!newDraft.code_files[0]?.content.trim()) {
      toast.error('Skriv TSX kode for sektionen'); return;
    }

    try {
      const maxOrder = sections.length > 0 ? Math.max(...sections.map(s => s.order_index)) : -1;
      const usedImages = collectUsedImages(newDraft);

      const { data, error } = await supabase
        .from('home_sections')
        .insert([{
          title: newDraft.title || 'Code Section',
          description: newDraft.description || 'Interactive TSX Section',
          image_url: newDraft.image_url || null,
          image_url_2: newDraft.image_url_2 || null,
          image_url_3: newDraft.image_url_3 || null,
          is_active: newDraft.is_active,
          section_type: newDraft.section_type,
          code_files: newDraft.section_type === 'code' ? newDraft.code_files : null,
          used_images: usedImages.length > 0 ? usedImages : null,
          order_index: maxOrder + 1,
        }])
        .select()
        .single();

      if (error) throw error;

      setSections(prev => [...prev, data]);
      setNewDraft(BLANK_DRAFT);
      setShowAddForm(false);
      toast.success('Sektion tilføjet');
    } catch (err) {
      console.error('Error adding section:', err);
      toast.error('Kunne ikke tilføje sektion');
    }
  };

  // ---------------------------------------------------------------------------
  // Update — optimistic
  // ---------------------------------------------------------------------------
  const handleUpdateSection = async () => {
    if (!editingId) return;
    if (editDraft.section_type === 'standard') {
      if (!editDraft.title.trim() || !editDraft.description.trim() || !editDraft.image_url) {
        toast.error('Udfyld alle felter for standard sektion'); return;
      }
    } else if (!editDraft.code_files[0]?.content.trim()) {
      toast.error('Skriv TSX kode for sektionen'); return;
    }

    const originalSection = sections.find(s => s.id === editingId);
    if (!originalSection) return;

    try {
      const usedImages = collectUsedImages(editDraft);

      const { error: delErr } = await supabase.from('home_sections').delete().eq('id', editingId);
      if (delErr) throw delErr;

      const { data, error: insErr } = await supabase
        .from('home_sections')
        .insert({
          id: editingId,
          title: editDraft.title,
          description: editDraft.description,
          image_url: editDraft.image_url || null,
          image_url_2: editDraft.image_url_2 || null,
          image_url_3: editDraft.image_url_3 || null,
          is_active: editDraft.is_active,
          section_type: editDraft.section_type,
          code_files: editDraft.section_type === 'code' ? editDraft.code_files : null,
          used_images: usedImages.length > 0 ? usedImages : null,
          order_index: originalSection.order_index,
        })
        .select()
        .single();

      if (insErr) throw insErr;

      const hv = hardcodedSections.find(h => h.id === editingId);
      if (hv) recordConflictChoice(editingId, 'database', hv);

      setSections(prev => prev.map(s => s.id === editingId ? data : s));
      setEditingId(null);
      setEditDraft(BLANK_DRAFT);
      toast.success('Sektion opdateret');
    } catch (err) {
      console.error('Error updating section:', err);
      toast.error('Kunne ikke opdatere sektion');
    }
  };

  // ---------------------------------------------------------------------------
  // Move Section
  // ---------------------------------------------------------------------------
  const handleMoveSection = async (id: string, direction: 'up' | 'down') => {
    const ci = sections.findIndex(s => s.id === id);
    if (ci === -1) return;
    const ni = direction === 'up' ? ci - 1 : ci + 1;
    if (ni < 0 || ni >= sections.length) return;

    // Swap and re-assign contiguous order_index values
    const reordered = [...sections];
    [reordered[ci], reordered[ni]] = [reordered[ni], reordered[ci]];
    const updated = reordered.map((s, i) => ({ ...s, order_index: i }));

    setSections(updated); // optimistic update

    try {
      // Fetch which IDs currently exist in DB
      const { data: dbRows } = await supabase.from('home_sections').select('id');
      const dbIds = new Set((dbRows ??[]).map((r: { id: string }) => r.id));

      // For sections already in DB: update order_index
      // For hardcoded-only sections involved in the swap: upsert them so their
      // order is persisted and they become moveable permanently.
      const swappedIds = new Set([sections[ci].id, sections[ni].id]);

      await Promise.all(
        updated.map(s => {
          if (dbIds.has(s.id)) {
            // Already in DB — just update the index
            return supabase.from('home_sections').update({ order_index: s.order_index }).eq('id', s.id);
          } else if (swappedIds.has(s.id)) {
            // Hardcoded section that was part of the swap — upsert it so the
            // new position is saved to DB and future moves work too.
            return supabase.from('home_sections').upsert({
              id: s.id,
              title: s.title,
              description: s.description,
              image_url: s.image_url ?? null,
              image_url_2: s.image_url_2 ?? null,
              image_url_3: s.image_url_3 ?? null,
              is_active: s.is_active,
              section_type: s.section_type,
              code_files: s.code_files ?? null,
              order_index: s.order_index,
            });
          }
          return Promise.resolve();
        })
      );

      toast.success('Rækkefølge opdateret');
    } catch (err) {
      console.error('Error moving section:', err);
      toast.error('Kunne ikke ændre rækkefølge');
      await fetchSections(); // revert on failure
    }
  };

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------
  const handleDeleteSection = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette denne sektion?')) return;
    try {
      const { error } = await supabase.from('home_sections').delete().eq('id', id);
      if (error) throw error;
      const hv = hardcodedSections.find(h => h.id === id);
      
      // Update this strictly to 'deleted'
      if (hv) recordConflictChoice(id, 'deleted', hv);
      
      setSections(prev => prev.filter(s => s.id !== id));
      toast.success('Sektion slettet');
    } catch (err) {
      console.error('Error deleting section:', err);
      toast.error('Kunne ikke slette sektion');
    }
  };

  // ---------------------------------------------------------------------------
  // Load conflict resolution
  // ---------------------------------------------------------------------------
  const handleResolveLoadConflicts = async (resolutions: Record<string, 'hardcoded' | 'database'>) => {
    try {
      for (const conflict of loadConflicts) {
        const res = resolutions[conflict.hardcodedSection.id];
        recordConflictChoice(conflict.hardcodedSection.id, res, conflict.hardcodedSection);
        if (res === 'hardcoded') await supabase.from('home_sections').delete().eq('id', conflict.databaseSection.id);
      }
      toast.success('Konflikter løst');
      setShowLoadConflictModal(false);
      const { data: dbData } = await supabase.from('home_sections').select('*').order('order_index', { ascending: true });
      mergeSections(hardcodedSections, dbData ||[]);
    } catch (err) {
      console.error('Error resolving conflicts:', err);
      toast.error('Kunne ikke løse konflikter');
    }
  };

  // ---------------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------------
  const handleDeployClick = async () => {
    try {
      setIsDeploying(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('You must be logged in to deploy sections'); return; }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deploy-home-sections-to-github`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to scan'); }

      const result: ScanResult = await res.json();
      setScanResult(result);
      if (result.conflicts?.length > 0) setShowConflictModal(true);
      else await performDeploy({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deploy');
    } finally {
      setIsDeploying(false);
    }
  };

  const performDeploy = async (selections: Record<string, 'database' | 'deployed'>) => {
    try {
      setIsDeploying(true);
      setShowConflictModal(false);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('You must be logged in to deploy sections'); return; }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deploy-home-sections-to-github`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deploy', selections, deletedHardcodedIds: getDeletedHardcodedIds() }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to deploy'); }

      const result: DeployResult = await res.json();
      if (result.errors?.length > 0) toast.error(`Deploy errors: ${result.errors.join(', ')}`);
      else toast.success(`Deployed ${result.deployedSections.length} section(s)!${result.netlifyTriggered ? ' Netlify build triggered.' : ''}`);

      await fetchSections();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deploy');
    } finally {
      setIsDeploying(false);
    }
  };

  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="mt-2"><EditableContent contentKey="home-sections-manager-indlaeser-sektioner" fallback="Indlæser sektioner..." /></p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showLoadConflictModal && loadConflicts.length > 0 && (
        <LoadConflictModal conflicts={loadConflicts} onResolve={handleResolveLoadConflicts} />
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          <EditableContent contentKey="home-sections-manager-forside-sektioner" fallback="Forside Sektioner" />
        </h2>
        <div className="flex gap-3">
          <button onClick={handleDeployClick} disabled={isDeploying || sections.length === 0} className="btn-primary flex items-center disabled:opacity-50 disabled:cursor-not-allowed">
            <Upload size={20} className="mr-2" />
            {isDeploying ? 'Deploying...' : 'Deploy to GitHub'}
          </button>
          <button onClick={() => { setNewDraft(BLANK_DRAFT); setShowAddForm(true); }} className="btn-primary flex items-center">
            <Plus size={20} className="mr-2" />
            <EditableContent contentKey="home-sections-manager-tilfoej-sektion" fallback="Tilføj Sektion" />
          </button>
        </div>
      </div>

      {sections.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-blue-100">
              <p className="font-semibold mb-1"><EditableContent contentKey="home-sections-manager-deploy-process" fallback="Deploy Process:" /></p>
              <ol className="list-decimal list-inside space-y-1 text-blue-200">
                <li><EditableContent contentKey="home-sections-manager-scans-for-differences-between-database" fallback="Scans for differences between database and deployed versions" /></li>
                <li><EditableContent contentKey="home-sections-manager-if-conflicts-exist-prompts-you" fallback="If conflicts exist, prompts you to choose which version to keep" /></li>
                <li><EditableContent contentKey="home-sections-manager-deploys-selected-sections-to-github" fallback="Deploys selected sections to GitHub & triggers Netlify rebuild" /></li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {showConflictModal && scanResult && scanResult.conflicts.length > 0 && (
        <ConflictResolutionModal conflicts={scanResult.conflicts} onResolve={performDeploy} onCancel={() => setShowConflictModal(false)} />
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700">
          <h3 className="text-xl font-semibold mb-4">
            <EditableContent contentKey="home-sections-manager-tilfoej-ny-sektion" fallback="Tilføj Ny Sektion" />
          </h3>
          <SectionForm section={newDraft} onChange={handleNewDraftChange} formId="new" />
          <div className="flex justify-end space-x-3 mt-4">
            <button onClick={() => { setShowAddForm(false); setNewDraft(BLANK_DRAFT); }} className="btn-secondary">
              <EditableContent contentKey="home-sections-manager-annuller" fallback="Annuller" />
            </button>
            <button onClick={handleAddSection} className="btn-primary">
              <EditableContent contentKey="home-sections-manager-tilfoej-sektion-2" fallback="Tilføj Sektion" />
            </button>
          </div>
        </div>
      )}

      {/* Section list */}
      <div className="space-y-4">
        {sections.map((section, index) => (
          <div key={section.id} className="bg-neutral-800 rounded-xl p-6 border border-neutral-700">
            {editingId === section.id ? (
              <div>
                <SectionForm section={editDraft} onChange={handleEditDraftChange} formId={section.id} />
                <div className="flex justify-end space-x-3 mt-4">
                  <button onClick={cancelEditing} className="btn-secondary flex items-center">
                    <X size={16} className="mr-2" />
                    <EditableContent contentKey="home-sections-manager-annuller-2" fallback="Annuller" />
                  </button>
                  <button onClick={handleUpdateSection} className="btn-primary flex items-center">
                    <Save size={16} className="mr-2" />
                    <EditableContent contentKey="home-sections-manager-gem" fallback="Gem" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-base font-semibold truncate">{section.title}</h3>
                    {section.section_type === 'code' && (
                      <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30 font-mono flex-shrink-0"><EditableContent contentKey="home-sections-manager-tsx" fallback="TSX" /></span>
                    )}
                    {hardcodedSections.some(h => h.id === section.id) && !isCachedAsDatabase(section.id) && (
                      <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-300 rounded-full border border-green-500/30 flex-shrink-0"><EditableContent contentKey="home-sections-manager-deployed" fallback="Deployed" /></span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${section.is_active ? 'bg-success/10 text-success' : 'bg-neutral-600/20 text-neutral-400'}`}>
                      {section.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                    <span className="text-xs text-neutral-500 flex-shrink-0">#{section.order_index + 1}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleMoveSection(section.id, 'up')} disabled={index === 0} className="p-1.5 text-neutral-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUp size={15} /></button>
                    <button onClick={() => handleMoveSection(section.id, 'down')} disabled={index === sections.length - 1} className="p-1.5 text-neutral-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ArrowDown size={15} /></button>
                    <button onClick={() => startEditing(section)} className="p-1.5 text-neutral-400 hover:text-white transition-colors"><Edit size={15} /></button>
                    <button onClick={() => handleDeleteSection(section.id)} className="p-1.5 text-neutral-400 hover:text-error transition-colors"><Trash2 size={15} /></button>
                  </div>
                </div>
<div className="rounded-lg overflow-hidden border border-neutral-700 pointer-events-none select-none">
                  {section.section_type === 'code' ? (
                    <div className="pointer-events-none">
                      <CodeProjectRenderer files={section.code_files ||[]} />
                    </div>
                  ) : (
                    <HomeSectionCard section={section} index={index} isPreview />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {sections.length === 0 && (
          <p className="text-center py-12 text-neutral-400">
            <EditableContent 
              contentKey="home-sections-manager-ingen-sektioner-fundet-tilfoej-den" 
              fallback="Ingen sektioner fundet. Tilføj den første sektion for at komme i gang." 
            />
          </p>
        )}
      </div>
    </div>
  );
};

export default HomeSectionsManager;
