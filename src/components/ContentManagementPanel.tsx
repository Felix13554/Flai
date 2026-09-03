import EditableContent from './EditableContent';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Settings, Palette, Type, Save, X, Plus, Trash2, Edit3,
  Home, Phone, Info, Briefcase, Megaphone, Search, Eye, EyeOff,
  Database, FolderPlus, FolderInput, MoveRight, Globe, MousePointer2,
  Check, ChevronRight, Scan, RefreshCw, AlertTriangle, Sparkles, Rocket,
  ShieldAlert, ShieldOff, Braces,
} from 'lucide-react';
import { useSiteContent, cancelAutoDeploy } from '../hooks/useSiteContent';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import ImageUpload from './ImageUpload';
import toast from 'react-hot-toast';
import { CONTENT_KEYS } from 'virtual:content-keys';
import JsonFieldEditor, { detectJsonKind } from './JsonFieldEditor';

// ─── Admin settings ────────────────────────────────────────────────────────
export const ADMIN_SETTINGS_KEY = 'flai_admin_settings';

export interface AdminSettings {
  disableEditOverlay: boolean;
  showUnregistered: boolean;
}

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  disableEditOverlay: false,
  showUnregistered: true,
};

export function getAdminSettings(): AdminSettings {
  try {
    const raw = localStorage.getItem(ADMIN_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_ADMIN_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_ADMIN_SETTINGS };
}

export function saveAdminSettings(settings: AdminSettings) {
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('adminSettingsChanged', { detail: settings }));
}

// ─── Registries ────────────────────────────────────────────────────────────
export const hardcodedKeyRegistry = new Map<
  string,
  { fallback: string; category?: string; description?: string; pageHint?: string }
>();

export const domRegistry = new Map<string, HTMLElement>();

// ── Seed from build-time scan ──────────────────────────────────────────────
CONTENT_KEYS.forEach(({ key, fallback, file }) => {
  if (!hardcodedKeyRegistry.has(key)) {
    const fileParts = file.split('/');
    const fileName = fileParts[fileParts.length - 1].replace(/\.tsx?$/, '');
    const category =
      file.includes('/pages/')
        ? fileName.toLowerCase().replace('page', '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() || 'page'
        : file.includes('/components/')
          ? 'ui'
          : 'uncategorized';
    hardcodedKeyRegistry.set(key, {
      fallback,
      category,
      description: key,
      pageHint: '',
    });
  }
});

// ─── Click-to-group global state ───────────────────────────────────────────
export type PickingState = 'idle' | 'picking';
let _pickingState: PickingState = 'idle';
const _selectedKeys = new Set<string>();

export function getPickingState() { return _pickingState; }
export function getSelectedKeys() { return new Set(_selectedKeys); }

export function startPicking(initialKeys?: string[]) {
  _pickingState = 'picking';
  _selectedKeys.clear();
  if (initialKeys) initialKeys.forEach(k => _selectedKeys.add(k));
  window.dispatchEvent(new CustomEvent('pickingStateChanged', {
    detail: { state: 'picking', selectedKeys: Array.from(_selectedKeys) },
  }));
}

export function resumePicking() {
  _pickingState = 'picking';
  window.dispatchEvent(new CustomEvent('pickingStateChanged', {
    detail: { state: 'picking', selectedKeys: Array.from(_selectedKeys) },
  }));
}

export function stopPicking() {
  _pickingState = 'idle';
  window.dispatchEvent(new CustomEvent('pickingStateChanged', {
    detail: { state: 'idle', selectedKeys: Array.from(_selectedKeys) },
  }));
}

export function clearPickedKeys() {
  _selectedKeys.clear();
  window.dispatchEvent(new CustomEvent('pickingStateChanged', {
    detail: { state: _pickingState, selectedKeys: [] },
  }));
}

export function togglePickedKey(key: string) {
  if (_selectedKeys.has(key)) _selectedKeys.delete(key);
  else _selectedKeys.add(key);
  window.dispatchEvent(new CustomEvent('pickingStateChanged', {
    detail: { state: _pickingState, selectedKeys: Array.from(_selectedKeys) },
  }));
}

// ─── Predefined categories ─────────────────────────────────────────────────
const PREDEFINED_CATEGORIES: Record<string, { icon: React.FC<{ size?: number }>; label: string }> = {
  hero:       { icon: Home,      label: 'Forside Hero' },
  about:      { icon: Info,      label: 'Om Os' },
  services:   { icon: Briefcase, label: 'Tjenester' },
  cta:        { icon: Megaphone, label: 'Call to Action' },
  navigation: { icon: Type,      label: 'Navigation' },
  footer:     { icon: Type,      label: 'Footer' },
  contact:    { icon: Phone,     label: 'Kontakt' },
  colors:     { icon: Palette,   label: 'Farver' },
};

const CUSTOM_CATS_KEY = 'flai_custom_categories';
function loadCustomCategories(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY) ?? '{}'); } catch { return {}; }
}
function persistCustomCategories(cats: Record<string, string>) {
  localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(cats));
}

// ─── Deep scan helper ──────────────────────────────────────────────────────
const CHROME_TAGS = new Set(['nav', 'header', 'footer', 'aside']);

function getMainContentElement(): Element {
  const main = document.querySelector('main');
  if (main) return main;
  const roleMain = document.querySelector('[role="main"]');
  if (roleMain) return roleMain;
  let best: Element | null = null;
  let bestArea = 0;
  Array.from(document.body.children).forEach(el => {
    if (CHROME_TAGS.has(el.tagName.toLowerCase())) return;
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) { bestArea = area; best = el; }
  });
  return best ?? document.body;
}

function isInsideChrome(el: Element): boolean {
  let node: Element | null = el;
  while (node && node !== document.body) {
    if (CHROME_TAGS.has(node.tagName.toLowerCase())) return true;
    node = node.parentElement;
  }
  return false;
}

function getDeepScanKeys(currentPath: string): string[] {
  const normalise = (p: string) => p.replace(/\/$/, '') || '/';
  const cur = normalise(currentPath);
  const resultSet = new Set<string>();
  const mainEl = getMainContentElement();

  domRegistry.forEach((el, key) => {
    if (!el) return;
    if (!mainEl.contains(el)) return;
    if (isInsideChrome(el)) return;
    resultSet.add(key);
  });

  hardcodedKeyRegistry.forEach((meta, key) => {
    if (resultSet.has(key)) return;
    const hint = normalise(meta.pageHint ?? '');
    if (!hint || hint === '/') return;
    const hintIsPrefix = cur === hint || cur.startsWith(hint + '/');
    const curIsPrefix  = hint === cur || hint.startsWith(cur + '/');
    if (hintIsPrefix || curIsPrefix) resultSet.add(key);
  });

  const linkedPaths = new Set<string>();
  try {
    mainEl.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a => {
      if (isInsideChrome(a)) return;
      const href = a.getAttribute('href') ?? '';
      if (href.startsWith('/') && !href.startsWith('//') && !href.includes('#')) {
        linkedPaths.add(normalise(href));
      }
    });
  } catch {}

  linkedPaths.forEach(linkedPath => {
    hardcodedKeyRegistry.forEach((meta, key) => {
      if (resultSet.has(key)) return;
      const hint = normalise(meta.pageHint ?? '');
      if (!hint || hint === '/') return;
      const hintIsPrefix = linkedPath === hint || linkedPath.startsWith(hint + '/');
      const curIsPrefix  = hint === linkedPath || hint.startsWith(linkedPath + '/');
      if (hintIsPrefix || curIsPrefix) resultSet.add(key);
    });
  });

  return Array.from(resultSet);
}

// ─── Bundle key scanner ────────────────────────────────────────────────────
async function scanBundleForAllKeys(): Promise<Set<string>> {
  const result = new Set<string>();

  const scriptUrls: string[] = [];
  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach(s => {
    const src = s.src;
    if (src && (src.includes('/assets/') || src.includes('index')) &&
        !src.includes('cookiebot') && !src.includes('stripe') &&
        !src.includes('google') && !src.includes('analytics')) {
      scriptUrls.push(src);
    }
  });

  await Promise.all(scriptUrls.map(async url => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const text = await res.text();

      const ckMatches = text.matchAll(/contentKey:["']([^"']+)["']/g);
      for (const m of ckMatches) result.add(m[1]);

      const gcMatches = text.matchAll(/getContent\(["']([^"']+)["']/g);
      for (const m of gcMatches) result.add(m[1]);
    } catch {}
  }));

  hardcodedKeyRegistry.forEach((_, key) => result.add(key));
  domRegistry.forEach((_, key) => result.add(key));

  return result;
}

// ─── Colour helpers ────────────────────────────────────────────────────────
function toHexForPicker(value: string): string {
  if (!value) return '#000000';
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return '#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3];
  }
  try {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = trimmed;
    const resolved = ctx.fillStyle;
    if (/^#[0-9a-fA-F]{6}$/.test(resolved)) return resolved;
  } catch {}
  return '#000000';
}

// ──────────────────────────────────────────────────────────────────────────
const CLICK_SELECT_PAGE_SIZE = 10;

const ContentManagementPanel: React.FC = () => {
  const { isAdmin } = useAuth();
  const { content, updateContent, setContentNoDeploy, deleteContent, deleteManyContent, addContent, loading } = useSiteContent();

  const [isOpen, setIsOpen]                     = useState(false);
  const [deployStatus, setDeployStatus]         = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [activeCategory, setActiveCategory]     = useState<string>('hero');
  const [editingItem, setEditingItem]           = useState<string | null>(null);
  const [editValue, setEditValue]               = useState('');
  const [editingType, setEditingType]           = useState<'text' | 'image' | 'color'>('text');
  const [showAddForm, setShowAddForm]           = useState(false);
  const [searchQuery, setSearchQuery]           = useState('');
  const [registryVersion, setRegistryVersion]   = useState(0);
  const [adminSettings, setAdminSettingsState]  = useState<AdminSettings>(getAdminSettings);
  const [customCategories, setCustomCategories] = useState<Record<string, string>>(loadCustomCategories);

  const [showNewCatModal, setShowNewCatModal]   = useState(false);
  const [newCatKey, setNewCatKey]               = useState('');
  const [newCatLabel, setNewCatLabel]           = useState('');

  const [movingKey, setMovingKey]               = useState<string | null>(null);
  const [moveTarget, setMoveTarget]             = useState('');

  const [showGroupModal, setShowGroupModal]     = useState(false);
  const [groupMode, setGroupMode]               = useState<'scan' | 'click'>('scan');
  const [groupTargetCat, setGroupTargetCat]     = useState('');
  const [groupNewCatName, setGroupNewCatName]   = useState('');
  const [groupPreviewKeys, setGroupPreviewKeys] = useState<string[] | null>(null);
  const [scanExcludedKeys, setScanExcludedKeys] = useState<Set<string>>(new Set());

  const [isPicking, setIsPicking]       = useState(false);
  const [pickedKeys, setPickedKeys]     = useState<string[]>([]);
  const [clickShowCount, setClickShowCount] = useState(CLICK_SELECT_PAGE_SIZE);

  const [renamingCat, setRenamingCat]         = useState<string | null>(null);
  const [renameValue, setRenameValue]         = useState('');

  const [deletingCat, setDeletingCat]         = useState<string | null>(null);
  const [deleteCatMoveTarget, setDeleteCatMoveTarget] = useState('');

  const [showCleanupModal, setShowCleanupModal]             = useState(false);
  const [cleanupItems, setCleanupItems]                     = useState<typeof content[string][]>([]);
  const [cleanupSelected, setCleanupSelected]               = useState<Set<string>>(new Set());
  const [cleanupDeleting, setCleanupDeleting]               = useState(false);
  const [cleanupScanning, setCleanupScanning]               = useState(false);
  const [cleanupCatFilter, setCleanupCatFilter]             = useState<string>('');
  const [cleanupImageAllowed, setCleanupImageAllowed]       = useState(false);
  const [cleanupShowImagePrompt, setCleanupShowImagePrompt] = useState(false);

  const [newContent, setNewContent] = useState({
    key: '', type: 'text' as 'text' | 'image' | 'color',
    value: '', description: '', category: activeCategory,
  });

  useEffect(() => {
    const handler = () => setRegistryVersion(v => v + 1);
    window.addEventListener('hardcodedKeyRegistered', handler);
    return () => window.removeEventListener('hardcodedKeyRegistered', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { state, selectedKeys } = (e as CustomEvent).detail;
      setIsPicking(state === 'picking');
      setPickedKeys(selectedKeys);
    };
    window.addEventListener('pickingStateChanged', handler);
    return () => window.removeEventListener('pickingStateChanged', handler);
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────
  const allCategoryLabels: Record<string, string> = {
    ...Object.fromEntries(Object.entries(PREDEFINED_CATEGORIES).map(([k, v]) => [k, v.label])),
    ...customCategories,
  };

  const contentByCategory = useMemo(
    () => Object.values(content).reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, typeof content[string][]>),
    [content]
  );

  const unregisteredItems = useMemo(() => {
    if (!adminSettings.showUnregistered) return [];
    return Array.from(hardcodedKeyRegistry.entries())
      .filter(([key]) => !content[key])
      .map(([key, meta]) => ({
        key, fallback: meta.fallback,
        category: meta.category ?? 'uncategorized',
        description: meta.description ?? key,
        pageHint: meta.pageHint,
      }));
  }, [content, adminSettings.showUnregistered, registryVersion]);

  const unregisteredByCategory = useMemo(
    () => unregisteredItems.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, typeof unregisteredItems>),
    [unregisteredItems]
  );

  const extraCategories = useMemo(() => {
    const known = new Set(Object.keys(allCategoryLabels));
    return [...new Set([...Object.keys(contentByCategory), ...Object.keys(unregisteredByCategory)])]
      .filter(k => !known.has(k));
  }, [contentByCategory, unregisteredByCategory, allCategoryLabels]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return {
      dbMatches: Object.values(content).filter(
        i => i.key.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || i.value?.toLowerCase().includes(q)
      ),
      unregMatches: unregisteredItems.filter(
        i => i.key.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || i.fallback?.toLowerCase().includes(q)
      ),
    };
  }, [searchQuery, content, unregisteredItems]);

  // ── useCallback hooks ─────────────────────────────────────────────────────
  const handleDeleteKey = useCallback(async (key: string) => {
    if (!confirm(`Slet "${key}"? Denne handling kan ikke fortrydes.`)) return;
    if (content[key]) await deleteContent(key);
    setGroupPreviewKeys(prev => prev ? prev.filter(k => k !== key) : prev);
    if (_selectedKeys.has(key)) togglePickedKey(key);
    toast.success('Element slettet');
  }, [content, deleteContent]);

  const handleCleanupScan = useCallback(async () => {
    setCleanupScanning(true);
    let hardcodedKeys: Set<string>;
    try {
      hardcodedKeys = await scanBundleForAllKeys();
    } finally {
      setCleanupScanning(false);
    }
    const stale = Object.values(content).filter(
      item => !hardcodedKeys.has(item.key) && item.type !== 'color'
    );
    const hasImages = stale.some(i => i.type === 'image');
    setCleanupItems(stale);
    setCleanupCatFilter('');
    setCleanupImageAllowed(false);
    setCleanupShowImagePrompt(hasImages);
    setCleanupSelected(new Set(stale.filter(i => i.type === 'text').map(i => i.key)));
    setShowCleanupModal(true);
    if (stale.length === 0) {
      toast('Ingen forældede elementer fundet — alt er i brug!', { icon: '✅' });
    }
  }, [content]);

  const handleCleanupAllowImages = useCallback(() => {
    setCleanupImageAllowed(true);
    setCleanupShowImagePrompt(false);
    setCleanupSelected(prev => {
      const next = new Set(prev);
      cleanupItems.filter(i => i.type === 'image').forEach(i => next.add(i.key));
      return next;
    });
  }, [cleanupItems]);

  const handleCleanupDelete = useCallback(async () => {
    if (cleanupSelected.size === 0) return;
    const keys = Array.from(cleanupSelected).filter(key => {
      const item = cleanupItems.find(i => i.key === key);
      return item && item.type !== 'color';
    });
    if (keys.length === 0) return;
    setCleanupDeleting(true);
    const ok = await deleteManyContent(keys);
    setCleanupDeleting(false);
    if (ok) {
      setShowCleanupModal(false);
      setCleanupItems([]);
      setCleanupSelected(new Set());
      setCleanupCatFilter('');
      setCleanupImageAllowed(false);
      setCleanupShowImagePrompt(false);
      toast.success(`${keys.length} forældet element${keys.length === 1 ? '' : 'er'} slettet`);
    }
  }, [cleanupSelected, cleanupItems, deleteManyContent]);

  // ── Early return (after ALL hooks) ───────────────────────────────────────
  if (!isAdmin) return null;
  if (loading) return null;

  const updateAdminSetting = <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => {
    const next = { ...adminSettings, [key]: value };
    setAdminSettingsState(next);
    saveAdminSettings(next);
  };

  // ── Category management ───────────────────────────────────────────────────
  const handleCreateCategory = () => {
    const key = newCatKey.trim().toLowerCase().replace(/\s+/g, '-');
    const label = newCatLabel.trim();
    if (!key || !label) { toast.error('Udfyld nøgle og navn'); return; }
    if (allCategoryLabels[key]) { toast.error('Kategorien findes allerede'); return; }
    const updated = { ...customCategories, [key]: label };
    setCustomCategories(updated); persistCustomCategories(updated);
    setShowNewCatModal(false); setNewCatKey(''); setNewCatLabel('');
    handleCategoryChange(key);
    toast.success(`Kategori "${label}" oprettet`);
  };

  const handleRenameCategory = () => {
    if (!renamingCat) return;
    const newLabel = renameValue.trim();
    if (!newLabel) { toast.error('Navn må ikke være tomt'); return; }
    const updated = { ...customCategories, [renamingCat]: newLabel };
    setCustomCategories(updated);
    persistCustomCategories(updated);
    setRenamingCat(null);
    setRenameValue('');
    toast.success(`Kategori omdøbt til "${newLabel}"`);
  };

  const handleDeleteCategory = async () => {
    if (!deletingCat) return;
    const dbItems = contentByCategory[deletingCat] ?? [];
    if (dbItems.length > 0 && !deleteCatMoveTarget) {
      toast.error('Vælg en kategori at flytte indholdet til');
      return;
    }
    for (const item of dbItems) {
      await deleteContent(item.key);
      await addContent({ key: item.key, type: item.type, value: item.value, description: item.description, category: deleteCatMoveTarget });
    }
    hardcodedKeyRegistry.forEach((meta, key) => {
      if ((meta.category ?? 'uncategorized') === deletingCat) {
        hardcodedKeyRegistry.set(key, { ...meta, category: deleteCatMoveTarget || 'uncategorized' });
      }
    });
    window.dispatchEvent(new CustomEvent('hardcodedKeyRegistered'));
    const updated = { ...customCategories };
    delete updated[deletingCat];
    setCustomCategories(updated);
    persistCustomCategories(updated);
    if (activeCategory === deletingCat) handleCategoryChange(deleteCatMoveTarget || 'hero');
    setDeletingCat(null);
    setDeleteCatMoveTarget('');
    toast.success('Kategori slettet');
  };

  const handleMoveItem = async (key: string) => {
    if (!moveTarget) { toast.error('Vælg en kategori'); return; }
    const item = content[key];
    if (!item) return;
    await deleteContent(key);
    await addContent({ key, type: item.type, value: item.value, description: item.description, category: moveTarget });
    setMovingKey(null); setMoveTarget('');
    toast.success('Indhold flyttet');
  };

  const resolveTargetCat = (): string | null => {
    if (groupTargetCat) return groupTargetCat;
    const label = groupNewCatName.trim();
    if (!label) { toast.error('Vælg eller opret en kategori'); return null; }
    const key = label.toLowerCase().replace(/\s+/g, '-');
    if (!allCategoryLabels[key]) {
      const updated = { ...customCategories, [key]: label };
      setCustomCategories(updated); persistCustomCategories(updated);
    }
    return key;
  };

  const commitGroup = async (keys: string[], targetCat: string) => {
    let moved = 0;
    for (const key of keys) {
      const item = content[key];
      if (item && item.category !== targetCat) {
        await deleteContent(key);
        await addContent({ key, type: item.type, value: item.value, description: item.description, category: targetCat });
        moved++;
      }
      const unreg = hardcodedKeyRegistry.get(key);
      if (unreg && !content[key]) {
        hardcodedKeyRegistry.set(key, { ...unreg, category: targetCat });
        moved++;
      }
    }
    window.dispatchEvent(new CustomEvent('hardcodedKeyRegistered'));
    return moved;
  };

  const handleGroup = async () => {
    const targetCat = resolveTargetCat();
    if (!targetCat) return;
    const activeKeys =
      groupMode === 'click'
        ? [...pickedKeys]
        : (groupPreviewKeys ?? []).filter(k => !scanExcludedKeys.has(k));
    if (activeKeys.length === 0) { toast.error('Ingen elementer valgt'); return; }
    const moved = await commitGroup(activeKeys, targetCat);
    stopPicking();
    clearPickedKeys();
    setShowGroupModal(false);
    setGroupTargetCat(''); setGroupNewCatName('');
    setGroupPreviewKeys(null); setScanExcludedKeys(new Set());
    setClickShowCount(CLICK_SELECT_PAGE_SIZE);
    toast.success(`${moved} elementer grupperet`);
    handleCategoryChange(targetCat);
  };

  const handleExcludeFromScan = (key: string) => {
    setScanExcludedKeys(prev => { const next = new Set(prev); next.add(key); return next; });
  };

  const handleDeselect = (key: string) => {
    if (_selectedKeys.has(key)) togglePickedKey(key);
  };

  const handleScan = () => {
    const currentPath = window.location.pathname;
    const keys = getDeepScanKeys(currentPath);
    setGroupPreviewKeys(keys);
    setScanExcludedKeys(new Set());
    if (keys.length === 0)
      toast(`Ingen indhold fundet for "${currentPath}"`, { icon: 'ℹ️' });
    else
      toast.success(`${keys.length} elementer fundet (inkl. linkede sider)`);
  };

  const handleStartPicking = () => {
    resumePicking();
    setIsOpen(false);
  };

  const handleStopPicking = () => {
    stopPicking();
    setIsOpen(true);
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSaveUnregistered = async (key: string, value: string, meta: { fallback: string; category: string; description: string }) => {
    if (editingType !== 'color' && !value.trim()) { toast.error('Værdi kan ikke være tom'); return; }
    await addContent({ key, type: editingType, value, description: meta.description, category: meta.category });
    setEditingItem(null); setEditValue(''); setEditingType('text');
  };

  const handleEdit = (key: string, val: string) => {
    setEditingItem(key);
    setEditValue(val);
    setEditingType('text');
  };

  const handleCancel = () => { setEditingItem(null); setEditValue(''); setEditingType('text'); };

  const handleSave = async () => {
    if (!editingItem) return;
    const item = content[editingItem];
    const isColor = item?.type === 'color';
    if (!isColor && !editValue.trim()) { toast.error('Værdi kan ikke være tom'); return; }
    const finalValue = isColor ? editValue : editValue.trim();
    const success = await updateContent(editingItem, finalValue);
    if (success) { setEditingItem(null); setEditValue(''); }
  };

  const handleImageUpload = async (url: string) => {
    if (editingItem) { await updateContent(editingItem, url); setEditingItem(null); }
    else if (showAddForm && newContent.type === 'image') setNewContent({ ...newContent, value: url });
  };
  const handleDelete = async (key: string) => {
    if (confirm('Er du sikker? Denne handling kan ikke fortrydes.')) await deleteContent(key);
  };
  const handleAddContent = async () => {
    if (!newContent.key || !newContent.value || !newContent.description) { toast.error('Udfyld alle felter'); return; }
    if (content[newContent.key]) { toast.error('Denne nøgle findes allerede'); return; }
    await addContent(newContent);
    setNewContent({ key: '', type: 'text', value: '', description: '', category: activeCategory });
    setShowAddForm(false);
  };
  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat); setNewContent(prev => ({ ...prev, category: cat }));
    setShowAddForm(false); setEditingItem(null); setSearchQuery('');
  };

  const catCount = (cat: string) =>
    (contentByCategory[cat]?.length ?? 0) +
    (adminSettings.showUnregistered ? (unregisteredByCategory[cat]?.length ?? 0) : 0);

  const catOptions = (
    <>
      <option value=""><EditableContent contentKey="content-management-panel-opret-ny-nedenfor" fallback="— Opret ny nedenfor —" /></option>
      {Object.entries(allCategoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      {extraCategories.map(k => <option key={k} value={k}>{k}</option>)}
    </>
  );

  const keyLabel = (key: string) => {
    const db = content[key]; const meta = hardcodedKeyRegistry.get(key);
    return db?.description ?? meta?.description ?? key;
  };

  // ── Sub-renders ───────────────────────────────────────────────────────────
  const CategoryIcon = ({ cat }: { cat: string }) => {
    const pred = PREDEFINED_CATEGORIES[cat];
    if (pred) { const I = pred.icon; return <I size={15} />; }
    return <FolderPlus size={15} />;
  };

  const renderSidebarCat = (key: string, label: string, editable = false) => {
    const count = catCount(key);
    const isActive = activeCategory === key && !searchQuery;
    return (
      <div key={key} className="relative group/cat">
        <button onClick={() => handleCategoryChange(key)}
          className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors text-sm ${
            isActive ? 'bg-primary text-white' : 'text-neutral-300 hover:bg-neutral-600'
          }`}
        >
          <div className="flex items-center space-x-2 min-w-0">
            <CategoryIcon cat={key} />
            <span className="truncate">{label}</span>
          </div>
          {count > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 shrink-0 ${
              isActive ? 'bg-white/20' : 'bg-neutral-600 text-neutral-400'
            }`}>{count}</span>
          )}
        </button>
        {editable && (
          <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-0.5 opacity-0 group-hover/cat:opacity-100 transition-opacity ${isActive ? 'opacity-100' : ''}`}>
            <button
              onClick={e => { e.stopPropagation(); setRenamingCat(key); setRenameValue(label); }}
              className={`p-1 rounded transition-colors ${isActive ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-neutral-400 hover:text-white hover:bg-neutral-500'}`}
              title="Omdøb kategori"
            >
              <Edit3 size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setDeletingCat(key); setDeleteCatMoveTarget(''); }}
              className={`p-1 rounded transition-colors ${isActive ? 'text-white/70 hover:text-red-300 hover:bg-red-500/10' : 'text-neutral-400 hover:text-red-400 hover:bg-neutral-500'}`}
              title="Slet kategori"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderDbItem = (item: typeof content[string]) => {
    const isEditing = editingItem === item.key;
    const jsonKind = item.type === 'text' ? detectJsonKind(item.value) : null;
    const isNoDeploy = !!item.no_deploy;
    return (
      <div key={item.key} className={`rounded-lg p-4 ${isNoDeploy ? 'bg-sky-950/20 border border-sky-800/40' : 'bg-neutral-700/20'}`}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <h4 className="font-medium text-white text-sm">{item.description}</h4>
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                item.type === 'color' ? 'bg-purple-500/20 text-purple-300' :
                item.type === 'image' ? 'bg-blue-500/20 text-blue-300' :
                'bg-green-500/20 text-green-300'
              }`}>
                {item.type === 'color' ? 'Farve' : item.type === 'image' ? 'Billede' : 'Tekst'}
              </span>
              {jsonKind && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-indigo-500/20 text-indigo-300 flex items-center gap-1">
                  <Braces size={10} /> JSON
                </span>
              )}
              {isNoDeploy && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-sky-500/20 text-sky-300 flex items-center gap-1" title="Deployes ikke til GitHub — forbliver kun i databasen">
                  <ShieldAlert size={10} /> Kun database
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 font-mono truncate">{item.key}</p>
          </div>
          <div className="flex items-center space-x-1 ml-2 shrink-0">
            <button
              onClick={() => setContentNoDeploy(item.key, !isNoDeploy)}
              className={`p-1.5 transition-colors ${isNoDeploy ? 'text-sky-400 hover:text-sky-300' : 'text-neutral-400 hover:text-sky-300'}`}
              title={isNoDeploy ? 'Inkluder i GitHub-deploy igen' : 'Udeluk fra GitHub-deploy (forbliv kun i database)'}
            >
              {isNoDeploy ? <ShieldAlert size={14} /> : <ShieldOff size={14} />}
            </button>
            <button onClick={() => { setMovingKey(item.key); setMoveTarget(item.category); }}
              className="p-1.5 text-neutral-400 hover:text-blue-300 transition-colors" title="Flyt til anden kategori">
              <MoveRight size={14} />
            </button>
            {!isEditing && (
              <button onClick={() => handleEdit(item.key, item.value)} className="p-1.5 text-neutral-400 hover:text-white">
                <Edit3 size={14} />
              </button>
            )}
            <button onClick={() => handleDelete(item.key)} className="p-1.5 text-neutral-400 hover:text-red-400">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-3">
            {item.type === 'image' ? (
              <ImageUpload onImageUploaded={handleImageUpload} bucket="site-content" />
            ) : item.type === 'color' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={toHexForPicker(editValue)}
                    onChange={e => setEditValue(e.target.value)}
                    className="w-14 h-10 rounded border border-neutral-600 cursor-pointer bg-transparent"
                    title="Vælg farve"
                  />
                  <input
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="form-input flex-1 text-sm font-mono"
                    placeholder="#0F52BA"
                    spellCheck={false}
                  />
                  <div
                    className="w-10 h-10 rounded border border-neutral-600 shrink-0"
                    style={{ backgroundColor: editValue || '#000' }}
                    title="Forhåndsvisning"
                  />
                </div>
                <p className="text-xs text-neutral-500">
                  <EditableContent contentKey="content-management-panel-du-kan-bruge-hex-0f52ba" fallback="Du kan bruge hex (#0F52BA), rgb(), hsl() eller CSS-variabler." />
                </p>
              </div>
            ) : jsonKind ? (
              <JsonFieldEditor value={editValue} onChange={setEditValue} />
            ) : (
              <textarea
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                className="form-input w-full text-sm"
                rows={item.description?.includes('beskrivelse') ? 3 : 1}
                autoFocus
              />
            )}
            <div className="flex justify-end space-x-2">
              <button onClick={handleCancel} className="px-3 py-1 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500">
                <EditableContent contentKey="content-management-panel-annuller-9" fallback="Annuller" />
              </button>
              <button onClick={handleSave} className="px-3 py-1 bg-primary text-white rounded flex items-center space-x-1 text-sm hover:bg-primary-dark">
                <Save size={13} /><span><EditableContent contentKey="content-management-panel-gem-2" fallback="Gem" /></span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            {item.type === 'color' ? (
              <div className="flex items-center space-x-2">
                <div
                  className="w-6 h-6 rounded border border-neutral-600"
                  style={{ backgroundColor: item.value }}
                />
                <span className="text-neutral-300 font-mono text-xs">{item.value}</span>
              </div>
            ) : item.type === 'image' ? (
              <div className="flex items-center space-x-3">
                <img src={item.value} alt={item.description} className="w-12 h-12 object-cover rounded" />
                <span className="text-neutral-400 text-xs break-all">{item.value}</span>
              </div>
            ) : jsonKind ? (
              <button
                onClick={() => handleEdit(item.key, item.value)}
                className="w-full text-left text-xs text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg px-3 py-2 transition-colors flex items-center gap-2"
              >
                <Braces size={12} className="shrink-0" />
                {jsonKind === 'array'
                  ? `${(() => { try { return JSON.parse(item.value).length; } catch { return '?'; } })()} element(er) — klik for at redigere`
                  : `${(() => { try { return Object.keys(JSON.parse(item.value)).length; } catch { return '?'; } })()} felt(er) — klik for at redigere`}
              </button>
            ) : (
              <p className="text-neutral-300 text-sm">{item.value}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderUnregisteredItem = (item: { key: string; fallback: string; category: string; description: string; pageHint?: string }) => (
    <div key={item.key} className="bg-amber-900/10 border border-amber-700/30 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <h4 className="font-medium text-amber-200 text-sm">{item.description}</h4>
            <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300"><EditableContent contentKey="content-management-panel-hardkodet" fallback="Hardkodet" /></span>
            {item.pageHint && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-neutral-600/60 text-neutral-400 flex items-center space-x-1">
                <Globe size={9} /><span>{item.pageHint}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 font-mono truncate">{item.key}</p>
        </div>
        <button onClick={() => handleEdit(item.key, item.fallback)} className="p-1.5 text-neutral-400 hover:text-white ml-2 shrink-0">
          <Edit3 size={14} />
        </button>
      </div>
      {editingItem === item.key ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400 shrink-0"><EditableContent contentKey="content-management-panel-type-2" fallback="Type:" /></label>
            <div className="flex gap-1">
              {(['text', 'image', 'color'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setEditingType(t); }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors border ${
                    editingType === t
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'bg-neutral-700 text-neutral-400 border-neutral-600 hover:bg-neutral-600'
                  }`}
                >
                  {t === 'text' && <Type size={11} />}
                  {t === 'image' && <span className="text-[10px]">🖼</span>}
                  {t === 'color' && <Palette size={11} />}
                  <span className="capitalize">{t === 'text' ? 'Tekst' : t === 'image' ? 'Billede' : 'Farve'}</span>
                </button>
              ))}
            </div>
          </div>
          {editingType === 'image' ? (
            <div>
              <ImageUpload onImageUploaded={(url) => setEditValue(url)} bucket="site-content" />
              {editValue && <img src={editValue} alt="Preview" className="mt-2 w-20 h-20 object-cover rounded" />}
            </div>
          ) : editingType === 'color' ? (
            <div className="flex items-center gap-3">
              <input type="color" value={toHexForPicker(editValue)} onChange={e => setEditValue(e.target.value)}
                className="w-12 h-9 rounded border border-neutral-600 cursor-pointer bg-transparent" />
              <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                className="form-input flex-1 text-sm font-mono" placeholder="#0F52BA" />
            </div>
          ) : detectJsonKind(editValue) ? (
            <JsonFieldEditor value={editValue} onChange={setEditValue} />
          ) : (
            <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="form-input w-full text-sm" rows={2} autoFocus />
          )}
          <div className="flex justify-end space-x-2">
            <button onClick={handleCancel} className="px-3 py-1 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500"><EditableContent contentKey="content-management-panel-annuller-8" fallback="Annuller" /></button>
            <button onClick={() => handleSaveUnregistered(item.key, editValue, item)}
              className="px-3 py-1 bg-amber-600 text-white rounded flex items-center space-x-1 text-sm hover:bg-amber-500">
              <Database size={13} /><span><EditableContent contentKey="content-management-panel-gem-i-database" fallback="Gem i database" /></span>
            </button>
          </div>
        </div>
      ) : (
        <p className="text-neutral-500 italic text-xs"><EditableContent contentKey="content-management-panel-standard" fallback="Standard:" /> {item.fallback || '(tom)'}</p>
      )}
    </div>
  );

  const renderCategoryContent = (cat: string) => {
    const dbItems = contentByCategory[cat] ?? [];
    const unregItems = unregisteredByCategory[cat] ?? [];
    if (!dbItems.length && !unregItems.length) {
      return (
        <div className="text-center py-12 text-neutral-500 text-sm">
          <p><EditableContent contentKey="content-management-panel-ingen-indhold-i-denne-kategori" fallback="Ingen indhold i denne kategori." /></p>
          <p className="text-xs mt-1"><EditableContent contentKey="content-management-panel-tilfoej-manuelt-eller-grupper-elementer" fallback="Tilføj manuelt, eller grupper elementer herind." /></p>
        </div>
      );
    }
    return (
      <>
        {dbItems.map(renderDbItem)}
        {unregItems.length > 0 && (
          <>
            {dbItems.length > 0 && (
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 border-t border-amber-700/30" />
                <span className="text-xs text-amber-400 font-medium whitespace-nowrap"><EditableContent contentKey="content-management-panel-hardkodede-ikke-i-database" fallback="Hardkodede · ikke i database" /></span>
                <div className="flex-1 border-t border-amber-700/30" />
              </div>
            )}
            {unregItems.map(renderUnregisteredItem)}
          </>
        )}
      </>
    );
  };

  const renderKeyRow = (
    k: string,
    opts: { onRemove?: () => void; onDelete?: () => void; dimmed?: boolean }
  ) => {
    const label = keyLabel(k);
    const inDb = !!content[k];
    return (
      <div
        key={k}
        className={`flex items-center space-x-2 text-xs rounded px-1.5 py-1 group transition-colors ${
          opts.dimmed ? 'opacity-40 line-through' : 'hover:bg-neutral-700/40'
        }`}
      >
        <ChevronRight size={10} className="text-neutral-500 shrink-0" />
        <span className="truncate flex-1 text-neutral-300">{label}</span>
        {inDb && (
          <span className="text-[10px] text-green-400/70 font-medium shrink-0"><EditableContent contentKey="content-management-panel-db" fallback="DB" /></span>
        )}
        <span className="text-neutral-600 font-mono text-[10px] shrink-0 hidden sm:inline">{k}</span>
        <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {opts.onRemove && (
            <button onClick={opts.onRemove} className="p-0.5 text-neutral-500 hover:text-neutral-200 transition-colors" title="Fjern fra liste">
              <X size={11} />
            </button>
          )}
          {opts.onDelete && (
            <button onClick={opts.onDelete} className="p-0.5 text-neutral-500 hover:text-red-400 transition-colors" title="Slet permanent">
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderScanKeyList = (keys: string[]) => {
    const visibleKeys = keys.filter(k => !scanExcludedKeys.has(k));
    const excludedCount = scanExcludedKeys.size;
    return (
      <div className="mt-2 bg-neutral-900/50 rounded-lg p-3 max-h-52 overflow-y-auto">
        {keys.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center py-2"><EditableContent contentKey="content-management-panel-ingen-elementer-fundet" fallback="Ingen elementer fundet." /></p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-neutral-400 font-medium">
                {visibleKeys.length} <EditableContent contentKey="content-management-panel-elementer" fallback="elementer" />
                {excludedCount > 0 && <span className="ml-1 text-neutral-600">({excludedCount} <EditableContent contentKey="content-management-panel-ekskluderet" fallback="ekskluderet)" /></span>}
              </p>
              {excludedCount > 0 && (
                <button onClick={() => setScanExcludedKeys(new Set())} className="text-[10px] text-neutral-500 hover:text-neutral-300 underline">
                  <EditableContent contentKey="content-management-panel-nulstil" fallback="Nulstil" />
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {keys.map(k => renderKeyRow(k, {
                dimmed: scanExcludedKeys.has(k),
                onRemove: () => handleExcludeFromScan(k),
                onDelete: () => handleDeleteKey(k),
              }))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderClickKeyList = (keys: string[]) => {
    const visible = keys.slice(0, clickShowCount);
    const hasMore = keys.length > clickShowCount;
    return (
      <div className="mt-2 bg-neutral-900/50 rounded-lg p-3 max-h-52 overflow-y-auto">
        {keys.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center py-2"><EditableContent contentKey="content-management-panel-ingen-elementer-valgt-endnu" fallback="Ingen elementer valgt endnu." /></p>
        ) : (
          <>
            <p className="text-xs text-neutral-400 font-medium mb-2">{keys.length} <EditableContent contentKey="content-management-panel-valgt-2" fallback="valgt:" /></p>
            <div className="space-y-0.5">
              {visible.map(k => renderKeyRow(k, {
                onRemove: () => handleDeselect(k),
                onDelete: () => handleDeleteKey(k),
              }))}
            </div>
            {hasMore && (
              <button
                onClick={() => setClickShowCount(c => c + CLICK_SELECT_PAGE_SIZE)}
                className="mt-2 w-full text-xs text-neutral-400 hover:text-neutral-200 transition-colors py-1 border border-neutral-700 rounded hover:border-neutral-500 flex items-center justify-center space-x-1"
              >
                <RefreshCw size={10} />
                <span><EditableContent contentKey="content-management-panel-vis" fallback="Vis" /> {Math.min(CLICK_SELECT_PAGE_SIZE, keys.length - clickShowCount)} <EditableContent contentKey="content-management-panel-mere" fallback="mere (" />{keys.length - clickShowCount} <EditableContent contentKey="content-management-panel-tilbage" fallback="tilbage)" /></span>
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  // ── Modals ────────────────────────────────────────────────────────────────
  const renderMoveModal = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 w-72 shadow-2xl">
        <h3 className="text-white font-semibold mb-3 flex items-center space-x-2 text-sm">
          <MoveRight size={16} /><span><EditableContent contentKey="content-management-panel-flyt-til-kategori-2" fallback="Flyt til kategori" /></span>
        </h3>
        <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)} className="form-input w-full mb-4 text-sm">
          {catOptions}
        </select>
        <div className="flex justify-end space-x-2">
          <button onClick={() => setMovingKey(null)} className="px-3 py-1.5 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500"><EditableContent contentKey="content-management-panel-annuller-7" fallback="Annuller" /></button>
          <button onClick={() => movingKey && handleMoveItem(movingKey)}
            className="px-3 py-1.5 bg-primary text-white rounded text-sm flex items-center space-x-1 hover:bg-primary-dark">
            <MoveRight size={13} /><span><EditableContent contentKey="content-management-panel-flyt" fallback="Flyt" /></span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderGroupModal = () => {
    const activeScanKeys = (groupPreviewKeys ?? []).filter(k => !scanExcludedKeys.has(k));
    const keysForMode = groupMode === 'click' ? pickedKeys : activeScanKeys;
    const canCommit   = keysForMode.length > 0;
    const docked      = isPicking;

    return (
      <div className={docked ? 'fixed bottom-20 right-6 z-[60] pointer-events-none' : 'fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4'}>
        <div className={`bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl pointer-events-auto ${docked ? 'w-80' : 'w-full max-w-md'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
            <h3 className="text-white font-semibold flex items-center space-x-2 text-sm">
              <FolderInput size={15} />
              <span>{docked ? `Vælg elementer (${pickedKeys.length} valgt)` : 'Grupper indhold'}</span>
            </h3>
            <button onClick={() => { setShowGroupModal(false); setGroupPreviewKeys(null); setScanExcludedKeys(new Set()); stopPicking(); clearPickedKeys(); setClickShowCount(CLICK_SELECT_PAGE_SIZE); }} className="text-neutral-400 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {!docked && (
              <div className="flex rounded-lg overflow-hidden border border-neutral-700">
                <button onClick={() => { setGroupMode('scan'); setGroupPreviewKeys(null); setScanExcludedKeys(new Set()); stopPicking(); clearPickedKeys(); }}
                  className={`flex-1 flex items-center justify-center space-x-2 py-2.5 text-sm font-medium transition-colors ${groupMode === 'scan' ? 'bg-primary text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}>
                  <Scan size={14} /><span><EditableContent contentKey="content-management-panel-scan-nuvaerende-side" fallback="Scan nuværende side" /></span>
                </button>
                <button onClick={() => { setGroupMode('click'); setGroupPreviewKeys(null); setScanExcludedKeys(new Set()); stopPicking(); }}
                  className={`flex-1 flex items-center justify-center space-x-2 py-2.5 text-sm font-medium transition-colors ${groupMode === 'click' ? 'bg-primary text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}>
                  <MousePointer2 size={14} /><span><EditableContent contentKey="content-management-panel-vaelg-ved-klik" fallback="Vælg ved klik" /></span>
                </button>
              </div>
            )}

            {!docked && groupMode === 'scan' && (
              <div className="space-y-2">
                <div className="bg-neutral-700/30 rounded-lg p-3 text-xs text-neutral-400 leading-relaxed">
                  <p><EditableContent contentKey="content-management-panel-finder-alle-redigerbare-felter-der" fallback="Finder alle redigerbare felter der er:" /></p>
                  <ul className="mt-1.5 space-y-1 list-none">
                    <li className="flex items-start space-x-1.5"><Check size={10} className="mt-0.5 text-green-400 shrink-0" /><span><EditableContent contentKey="content-management-panel-aktuelt-monteret-i-dom-paa" fallback="Aktuelt monteret i DOM på denne side" /></span></li>
                    <li className="flex items-start space-x-1.5"><Check size={10} className="mt-0.5 text-green-400 shrink-0" /><span><EditableContent contentKey="content-management-panel-registreret-under-stien" fallback="Registreret under stien" /> <code className="font-mono bg-neutral-700/60 px-1 rounded">{window.location.pathname}</code></span></li>
                    <li className="flex items-start space-x-1.5"><Check size={10} className="mt-0.5 text-green-400 shrink-0" /><span><EditableContent contentKey="content-management-panel-knyttet-til-interne-links-paa" fallback="Knyttet til interne links på siden (linkede komponenter)" /></span></li>
                  </ul>
                  <p className="mt-2 text-neutral-500"><EditableContent contentKey="content-management-panel-svaev-over-et-element-for" fallback="Svæv over et element for at fjerne det fra resultater eller slette det." /></p>
                </div>
                <div className="flex space-x-2">
                  <button onClick={handleScan}
                    className="flex-1 py-2 bg-neutral-700 text-neutral-200 rounded-lg text-sm hover:bg-neutral-600 transition-colors flex items-center justify-center space-x-2">
                    <Scan size={14} /><span><EditableContent contentKey="content-management-panel-scan-siden-nu" fallback="Scan siden nu" /></span>
                  </button>
                  {groupPreviewKeys !== null && groupPreviewKeys.length > 0 && (
                    <button onClick={() => { const scanActive = groupPreviewKeys.filter(k => !scanExcludedKeys.has(k)); setGroupMode('click'); setGroupPreviewKeys(null); setScanExcludedKeys(new Set()); startPicking(scanActive); stopPicking(); }}
                      className="py-2 px-3 bg-blue-800/60 text-blue-300 rounded-lg text-sm hover:bg-blue-700/60 transition-colors flex items-center justify-center space-x-1.5 border border-blue-700/40"
                      title="Overfør til klik-tilstand og finjuster">
                      <MousePointer2 size={13} /><span className="whitespace-nowrap"><EditableContent contentKey="content-management-panel-finjuster-med-klik" fallback="Finjuster med klik" /></span>
                    </button>
                  )}
                </div>
                {groupPreviewKeys !== null && renderScanKeyList(groupPreviewKeys)}
              </div>
            )}

            {!docked && groupMode === 'click' && (
              <div className="space-y-2">
                <div className="bg-neutral-700/30 rounded-lg p-3 text-xs text-neutral-400 leading-relaxed">
                  <p><EditableContent contentKey="content-management-panel-panelet-minimeres-til-hjoernet-klik" fallback="Panelet minimeres til hjørnet. Klik direkte på redigerbare felter på siden for at vælge/fravælge dem." /></p>
                </div>
                {renderClickKeyList(pickedKeys)}
                <button onClick={handleStartPicking}
                  className="w-full py-2 bg-blue-700 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2">
                  <MousePointer2 size={14} /><span>{pickedKeys.length > 0 ? 'Fortsæt klik-vælg' : 'Start klik-vælg'}</span>
                </button>
              </div>
            )}

            {docked && (
              <div className="space-y-2">
                <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-3 text-xs text-blue-300">
                  <p><EditableContent contentKey="content-management-panel-klik-paa-redigerbare-elementer-for" fallback="Klik på redigerbare elementer for at tilføje/fjerne." /></p>
                </div>
                {renderClickKeyList(pickedKeys)}
                <button onClick={handleStopPicking}
                  className="w-full py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 flex items-center justify-center space-x-2">
                  <Check size={13} /><span><EditableContent contentKey="content-management-panel-faerdig-med-at-vaelge" fallback="Færdig med at vælge (" />{pickedKeys.length})</span>
                </button>
              </div>
            )}

            <div className="border-t border-neutral-700 pt-3 space-y-2">
              <label className="block text-xs text-neutral-300"><EditableContent contentKey="content-management-panel-flyt-til-kategori" fallback="Flyt til kategori" /></label>
              <select value={groupTargetCat} onChange={e => { setGroupTargetCat(e.target.value); if (e.target.value) setGroupNewCatName(''); }} className="form-input w-full text-sm">
                {catOptions}
              </select>
              {!groupTargetCat && (
                <input type="text" value={groupNewCatName} onChange={e => setGroupNewCatName(e.target.value)} className="form-input w-full text-sm" placeholder="Eller skriv ny kategorinavn" />
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2 px-4 pb-4">
            <button onClick={() => { setShowGroupModal(false); setGroupPreviewKeys(null); setScanExcludedKeys(new Set()); stopPicking(); clearPickedKeys(); setClickShowCount(CLICK_SELECT_PAGE_SIZE); }} className="px-3 py-1.5 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500"><EditableContent contentKey="content-management-panel-annuller-6" fallback="Annuller" /></button>
            <button onClick={handleGroup} disabled={!canCommit}
              className="px-3 py-1.5 bg-primary text-white rounded text-sm flex items-center space-x-1 hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed">
              <FolderInput size={13} />
              <span><EditableContent contentKey="content-management-panel-grupper" fallback="Grupper" /> {canCommit ? `(${keysForMode.length})` : ''}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderNewCatModal = () => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 w-72 shadow-2xl">
        <h3 className="text-white font-semibold mb-3 flex items-center space-x-2 text-sm">
          <FolderPlus size={16} /><span><EditableContent contentKey="content-management-panel-ny-kategori-2" fallback="Ny kategori" /></span>
        </h3>
        <label className="block text-xs text-neutral-300 mb-1"><EditableContent contentKey="content-management-panel-noegle-intern-brug" fallback="Nøgle (intern brug)" /></label>
        <input type="text" value={newCatKey} onChange={e => setNewCatKey(e.target.value)} className="form-input w-full mb-3 text-sm" placeholder="mine-produkter" />
        <label className="block text-xs text-neutral-300 mb-1"><EditableContent contentKey="content-management-panel-visningsnavn" fallback="Visningsnavn" /></label>
        <input type="text" value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)} className="form-input w-full mb-4 text-sm" placeholder="Mine Produkter" />
        <div className="flex justify-end space-x-2">
          <button onClick={() => { setShowNewCatModal(false); setNewCatKey(''); setNewCatLabel(''); }} className="px-3 py-1.5 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500"><EditableContent contentKey="content-management-panel-annuller-5" fallback="Annuller" /></button>
          <button onClick={handleCreateCategory} className="px-3 py-1.5 bg-primary text-white rounded text-sm flex items-center space-x-1 hover:bg-primary-dark">
            <Check size={13} /><span><EditableContent contentKey="content-management-panel-opret" fallback="Opret" /></span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderRenameCatModal = () => {
    const isPredefined = !!PREDEFINED_CATEGORIES[renamingCat!];
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 w-80 shadow-2xl">
          <h3 className="text-white font-semibold mb-1 flex items-center space-x-2 text-sm">
            <Edit3 size={15} /><span><EditableContent contentKey="content-management-panel-omdoeb-kategori" fallback="Omdøb kategori" /></span>
          </h3>
          <p className="text-xs text-neutral-500 font-mono mb-3">{renamingCat}</p>
          {isPredefined ? (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 mb-4 text-xs text-amber-300">
              <EditableContent contentKey="content-management-panel-foruddefinerede-kategorier-kan-ikke-omdoebes" fallback="Foruddefinerede kategorier kan ikke omdøbes." />
            </div>
          ) : (
            <>
              <label className="block text-xs text-neutral-300 mb-1"><EditableContent contentKey="content-management-panel-nyt-visningsnavn" fallback="Nyt visningsnavn" /></label>
              <input type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRenameCategory()} className="form-input w-full mb-4 text-sm" autoFocus />
            </>
          )}
          <div className="flex justify-end space-x-2">
            <button onClick={() => { setRenamingCat(null); setRenameValue(''); }} className="px-3 py-1.5 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500"><EditableContent contentKey="content-management-panel-annuller-4" fallback="Annuller" /></button>
            {!isPredefined && (
              <button onClick={handleRenameCategory} className="px-3 py-1.5 bg-primary text-white rounded text-sm flex items-center space-x-1 hover:bg-primary-dark">
                <Check size={13} /><span><EditableContent contentKey="content-management-panel-gem" fallback="Gem" /></span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteCatModal = () => {
    const label = allCategoryLabels[deletingCat!] ?? deletingCat;
    const dbItems = contentByCategory[deletingCat!] ?? [];
    const hasContent = dbItems.length > 0;
    const isPredefined = !!PREDEFINED_CATEGORIES[deletingCat!];
    const targetOptions = Object.entries(allCategoryLabels)
      .filter(([k]) => k !== deletingCat)
      .concat(extraCategories.filter(k => k !== deletingCat && !allCategoryLabels[k]).map(k => [k, k]));

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 w-80 shadow-2xl">
          <h3 className="text-white font-semibold mb-1 flex items-center space-x-2 text-sm">
            <Trash2 size={15} className="text-red-400" /><span><EditableContent contentKey="content-management-panel-slet-kategori" fallback="Slet kategori" /></span>
          </h3>
          <p className="text-xs text-neutral-500 font-mono mb-3">{deletingCat}</p>
          {isPredefined ? (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 mb-4 text-xs text-amber-300">
              <EditableContent contentKey="content-management-panel-foruddefinerede-kategorier-kan-ikke-slettes" fallback="Foruddefinerede kategorier kan ikke slettes." />
            </div>
          ) : (
            <>
              <div className={`rounded-lg p-3 mb-4 text-xs ${hasContent ? 'bg-red-900/20 border border-red-700/30 text-red-300' : 'bg-neutral-700/30 text-neutral-400'}`}>
                {hasContent ? (
                  <><p className="font-medium mb-1"><EditableContent contentKey="content-management-panel-kategorien-indeholder" fallback="⚠ Kategorien indeholder" /> {dbItems.length} {dbItems.length === 1 ? 'element' : 'elementer'}.</p><p><EditableContent contentKey="content-management-panel-du-skal-vaelge-hvor-indholdet" fallback="Du skal vælge, hvor indholdet skal flyttes hen, inden kategorien kan slettes." /></p></>
                ) : (
                  <p><EditableContent contentKey="content-management-panel-kategorien-er-tom-og-kan" fallback="Kategorien er tom og kan slettes sikkert." /></p>
                )}
              </div>
              {hasContent && (
                <div className="mb-4">
                  <label className="block text-xs text-neutral-300 mb-1"><EditableContent contentKey="content-management-panel-flyt-indhold-til" fallback="Flyt indhold til" /></label>
                  <select value={deleteCatMoveTarget} onChange={e => setDeleteCatMoveTarget(e.target.value)} className="form-input w-full text-sm">
                    <option value=""><EditableContent contentKey="content-management-panel-vaelg-kategori" fallback="— Vælg kategori —" /></option>
                    {targetOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end space-x-2">
            <button onClick={() => { setDeletingCat(null); setDeleteCatMoveTarget(''); }} className="px-3 py-1.5 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500"><EditableContent contentKey="content-management-panel-annuller-3" fallback="Annuller" /></button>
            {!isPredefined && (
              <button onClick={handleDeleteCategory} disabled={hasContent && !deleteCatMoveTarget}
                className="px-3 py-1.5 bg-red-600 text-white rounded text-sm flex items-center space-x-1 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed">
                <Trash2 size={13} /><span><EditableContent contentKey="content-management-panel-slet-2" fallback="Slet" />{hasContent && deleteCatMoveTarget ? ' & flyt' : ''}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCleanupModal = () => {
    const staleCats = Array.from(new Set(cleanupItems.map(i => i.category))).sort();
    const visibleItems = cleanupCatFilter
      ? cleanupItems.filter(i => i.category === cleanupCatFilter)
      : cleanupItems;
    const selectableItems = visibleItems.filter(
      i => i.type === 'text' || (i.type === 'image' && cleanupImageAllowed)
    );
    const lockedItems = visibleItems.filter(
      i => i.type === 'image' && !cleanupImageAllowed
    );
    const visibleSelected = selectableItems.filter(i => cleanupSelected.has(i.key));
    const allVisibleSelected = selectableItems.length > 0 && visibleSelected.length === selectableItems.length;
    const someSelected = cleanupSelected.size > 0;

    const toggleVisibleAll = () => {
      setCleanupSelected(prev => {
        const next = new Set(prev);
        if (allVisibleSelected) selectableItems.forEach(i => next.delete(i.key));
        else selectableItems.forEach(i => next.add(i.key));
        return next;
      });
    };

    const toggleItem = (key: string) => {
      setCleanupSelected(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
    };

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[88vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-700 shrink-0">
            <div className="flex items-center space-x-2">
              <Sparkles size={16} className="text-amber-400" />
              <h3 className="text-white font-semibold text-sm"><EditableContent contentKey="content-management-panel-ryd-op-i-indhold" fallback="Ryd op i indhold" /></h3>
            </div>
            <button
              onClick={() => { setShowCleanupModal(false); setCleanupShowImagePrompt(false); }}
              className="text-neutral-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
            {cleanupItems.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <Check size={22} className="text-green-400" />
                </div>
                <p className="text-green-300 font-medium text-sm"><EditableContent contentKey="content-management-panel-alt-indhold-er-i-brug" fallback="Alt indhold er i brug" /></p>
                <p className="text-neutral-500 text-xs"><EditableContent contentKey="content-management-panel-ingen-foraeldede-database-poster-fundet" fallback="Ingen forældede database-poster fundet." /></p>
              </div>
            ) : (
              <>
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 text-xs text-amber-300 leading-relaxed">
                  <p className="font-medium mb-1">
                    {cleanupItems.length} <EditableContent contentKey="content-management-panel-foraeldet" fallback="forældet" />{cleanupItems.length === 1 ? '' : 'e'} <EditableContent contentKey="content-management-panel-database-post" fallback="database-post" />{cleanupItems.length === 1 ? '' : 'er'} <EditableContent contentKey="content-management-panel-fundet" fallback="fundet" />
                  </p>
                  <p className="text-amber-400/70">
                    <EditableContent contentKey="content-management-panel-disse-noegler-findes-i-databasen" fallback="Disse nøgler findes i databasen men bruges ikke i koden. Farver kan aldrig slettes herfra. Vælg hvad du vil fjerne og bekræft." />
                  </p>
                </div>

                {cleanupShowImagePrompt && (
                  <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-3 space-y-2">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle size={14} className="text-blue-300 mt-0.5 shrink-0" />
                      <div className="text-xs text-blue-200 leading-relaxed">
                        <p className="font-medium mb-0.5"><EditableContent contentKey="content-management-panel-billeder-fundet" fallback="Billeder fundet" /></p>
                        <p className="text-blue-300/70">
                          <EditableContent contentKey="content-management-panel-scanningen-fandt-foraeldede-billeder-at" fallback="Scanningen fandt forældede billeder. At slette billeder er irreversibelt — filer fjernes fra storage. Vil du inkludere billeder i oprydningen?" />
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setCleanupShowImagePrompt(false)}
                        className="flex-1 py-1.5 bg-neutral-700 text-neutral-300 rounded text-xs hover:bg-neutral-600 transition-colors"
                      >
                        <EditableContent contentKey="content-management-panel-nej-kun-tekst" fallback="Nej, kun tekst" />
                      </button>
                      <button
                        onClick={handleCleanupAllowImages}
                        className="flex-1 py-1.5 bg-blue-700 text-white rounded text-xs hover:bg-blue-600 transition-colors flex items-center justify-center space-x-1"
                      >
                        <Check size={11} />
                        <span><EditableContent contentKey="content-management-panel-ja-inkluder-billeder" fallback="Ja, inkluder billeder" /></span>
                      </button>
                    </div>
                  </div>
                )}

                {staleCats.length > 1 && (
                  <div className="flex items-center space-x-2">
                    <Search size={12} className="text-neutral-500 shrink-0" />
                    <select
                      value={cleanupCatFilter}
                      onChange={e => setCleanupCatFilter(e.target.value)}
                      className="flex-1 bg-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 border border-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value=""><EditableContent contentKey="content-management-panel-alle-kategorier" fallback="Alle kategorier (" />{cleanupItems.length})</option>
                      {staleCats.map(cat => (
                        <option key={cat} value={cat}>
                          {allCategoryLabels[cat] ?? cat} ({cleanupItems.filter(i => i.category === cat).length})
                        </option>
                      ))}
                    </select>
                    {cleanupCatFilter && (
                      <button
                        onClick={() => setCleanupCatFilter('')}
                        className="text-neutral-500 hover:text-neutral-300 transition-colors"
                        title="Ryd filter"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                )}

                {selectableItems.length > 0 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={toggleVisibleAll}
                      className="flex items-center space-x-2 text-xs text-neutral-400 hover:text-white transition-colors"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        allVisibleSelected ? 'bg-primary border-primary' : 'border-neutral-500'
                      }`}>
                        {allVisibleSelected && <Check size={10} className="text-white" />}
                      </div>
                      <span><EditableContent contentKey="content-management-panel-vaelg-alle-synlige" fallback="Vælg alle synlige" /></span>
                    </button>
                    <span className="text-xs text-neutral-500">
                      {visibleSelected.length} / {selectableItems.length} <EditableContent contentKey="content-management-panel-valgt" fallback="valgt" />
                      {cleanupCatFilter ? ' i denne kategori' : ''}
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  {selectableItems.map(item => {
                    const checked = cleanupSelected.has(item.key);
                    return (
                      <div
                        key={item.key}
                        onClick={() => toggleItem(item.key)}
                        className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-red-900/20 border-red-700/40 hover:bg-red-900/30'
                            : 'bg-neutral-700/20 border-neutral-700/40 hover:bg-neutral-700/40'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                          checked ? 'bg-red-500 border-red-500' : 'border-neutral-500'
                        }`}>
                          {checked && <Check size={10} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className="text-sm font-medium text-white truncate">{item.description || item.key}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              item.type === 'image' ? 'bg-blue-500/20 text-blue-300' : 'bg-neutral-600 text-neutral-400'
                            }`}>
                              {item.type === 'image' ? 'Billede' : 'Tekst'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-600/60 text-neutral-400">
                              {allCategoryLabels[item.category] ?? item.category}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 font-mono truncate">{item.key}</p>
                          {item.type === 'image' ? (
                            <div className="flex items-center space-x-2 mt-1.5">
                              <img
                                src={item.value} alt=""
                                className="w-8 h-8 object-cover rounded border border-neutral-600"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <span className="text-[10px] text-neutral-500 truncate">{item.value}</span>
                            </div>
                          ) : (
                            <p className="text-[10px] text-neutral-500 mt-0.5 truncate">"{item.value}"</p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {lockedItems.map(item => (
                    <div
                      key={item.key}
                      className="flex items-start space-x-3 p-3 rounded-lg border border-neutral-700/30 bg-neutral-800/40 opacity-50 cursor-not-allowed"
                      title="Klik 'Ja, inkluder billeder' ovenfor for at aktivere"
                    >
                      <div className="w-4 h-4 rounded border border-neutral-600 flex items-center justify-center mt-0.5 shrink-0">
                        <X size={9} className="text-neutral-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <span className="text-sm font-medium text-neutral-400 truncate">{item.description || item.key}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400/60"><EditableContent contentKey="content-management-panel-billede-2" fallback="Billede" /></span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-700/60 text-neutral-500"><EditableContent contentKey="content-management-panel-kraever-tilladelse" fallback="Kræver tilladelse" /></span>
                        </div>
                        <p className="text-xs text-neutral-600 font-mono truncate">{item.key}</p>
                      </div>
                    </div>
                  ))}

                  {visibleItems.length === 0 && (
                    <p className="text-xs text-neutral-500 text-center py-4"><EditableContent contentKey="content-management-panel-ingen-elementer-i-denne-kategori" fallback="Ingen elementer i denne kategori." /></p>
                  )}
                </div>
              </>
            )}
          </div>

          {cleanupItems.length > 0 && (
            <div className="px-5 py-4 border-t border-neutral-700 shrink-0 flex items-center justify-between gap-3">
              <div className="text-xs text-neutral-500">
                {someSelected
                  ? <span className="text-red-300">{cleanupSelected.size} <EditableContent contentKey="content-management-panel-element" fallback="element" />{cleanupSelected.size === 1 ? '' : 'er'} <EditableContent contentKey="content-management-panel-slettes-permanent" fallback="slettes permanent" /></span>
                  : <span><EditableContent contentKey="content-management-panel-ingen-valgt" fallback="Ingen valgt" /></span>
                }
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => { setShowCleanupModal(false); setCleanupShowImagePrompt(false); }}
                  className="px-3 py-1.5 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500 transition-colors"
                >
                  <EditableContent contentKey="content-management-panel-annuller-2" fallback="Annuller" />
                </button>
                <button
                  onClick={handleCleanupDelete}
                  disabled={!someSelected || cleanupDeleting}
                  className="px-4 py-1.5 bg-red-600 text-white rounded text-sm flex items-center space-x-1.5 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {cleanupDeleting
                    ? <><RefreshCw size={13} className="animate-spin" /><span><EditableContent contentKey="content-management-panel-sletter" fallback="Sletter…" /></span></>
                    : <><Trash2 size={13} /><span><EditableContent contentKey="content-management-panel-slet" fallback="Slet" /> {someSelected ? `(${cleanupSelected.size})` : ''}</span></>
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Quick deploy ──────────────────────────────────────────────────────────
  const handleQuickDeploy = async () => {
    if (deployStatus === 'loading') return;
    if (!confirm('Deploy indhold til GitHub nu?')) return;
    cancelAutoDeploy();
    setDeployStatus('loading');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const supabaseUrl = (supabase as any).supabaseUrl as string || import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/deploy-content-to-github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.errors?.length > 0 && !data.deployedKeys?.length) {
        setDeployStatus('error');
        toast.error(`Deploy fejl: ${data.errors[0]}`);
      } else {
        setDeployStatus('success');
        toast.success(data.deployedKeys?.length > 0 ? `${data.deployedKeys.length} nøgle(r) deployed til GitHub` : 'Intet nyt at deploye');
        setTimeout(() => setDeployStatus('idle'), 3000);
      }
    } catch (err: any) {
      setDeployStatus('error');
      toast.error(`Deploy fejl: ${err.message}`);
      setTimeout(() => setDeployStatus('idle'), 3000);
    }
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      {/* ── FIX 1: FAB buttons ─────────────────────────────────────────────
          Added style with safe-area-inset-bottom so the buttons clear the
          iOS home indicator / bottom navigation bar on mobile.               */}
      <div
        className="fixed bottom-6 right-6 flex items-center gap-2 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          onClick={handleQuickDeploy}
          disabled={deployStatus === 'loading'}
          title="Deploy indhold til GitHub"
          className={`p-4 text-white rounded-full shadow-lg transition-colors ${
            deployStatus === 'loading' ? 'bg-neutral-600 cursor-not-allowed' :
            deployStatus === 'success' ? 'bg-green-600 hover:bg-green-700' :
            deployStatus === 'error'   ? 'bg-red-600 hover:bg-red-700' :
            'bg-neutral-700 hover:bg-neutral-600'
          }`}
        >
          {deployStatus === 'loading'
            ? <RefreshCw size={24} className="animate-spin" />
            : deployStatus === 'success'
            ? <Check size={24} />
            : <Rocket size={24} />
          }
        </button>

        <button onClick={() => setIsOpen(true)}
          className="p-4 bg-primary text-white rounded-full shadow-lg hover:bg-primary-dark transition-colors"
          title="Rediger indhold">
          <Settings size={24} />
        </button>
      </div>

      {isOpen && (
        // ── FIX 2: Panel backdrop ─────────────────────────────────────────
        // Changed from `fixed inset-0 z-50` to `fixed inset-x-0 bottom-0 top-16 z-40`.
        // • top-16 (64px) = navbar height — modal never covers the navbar.
        // • z-40 < navbar z-index (z-50) — navbar always renders on top.
        // Adjust `top-16` if your navbar uses a different height (top-14 = 56px, etc.)
        <div className="fixed inset-x-0 bottom-0 top-16 bg-black/50 flex items-center justify-center p-4 z-40">
          <div className="bg-neutral-800 rounded-xl shadow-2xl max-w-6xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
            {/* ↑ FIX 3: max-h-[85vh] on mobile, 90vh on sm+ for extra breathing room */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700 shrink-0">
              <h2 className="text-xl font-bold text-white"><EditableContent contentKey="content-management-panel-indholdsstyring" fallback="Indholdsstyring" /></h2>
              <button onClick={() => setIsOpen(false)} className="p-2 text-neutral-400 hover:text-white transition-colors">
                <X size={22} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 bg-neutral-900/60 border-b border-neutral-700 shrink-0">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider"><EditableContent contentKey="content-management-panel-site" fallback="Site:" /></span>
              <button onClick={() => updateAdminSetting('disableEditOverlay', !adminSettings.disableEditOverlay)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${adminSettings.disableEditOverlay ? 'bg-orange-600/20 text-orange-300 border-orange-600/40' : 'bg-neutral-700 text-neutral-300 border-transparent hover:bg-neutral-600'}`}>
                {adminSettings.disableEditOverlay ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{adminSettings.disableEditOverlay ? 'Overlay slået fra' : 'Overlay aktivt'}</span>
              </button>
              <button onClick={() => updateAdminSetting('showUnregistered', !adminSettings.showUnregistered)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${adminSettings.showUnregistered ? 'bg-amber-600/20 text-amber-300 border-amber-600/40' : 'bg-neutral-700 text-neutral-300 border-transparent hover:bg-neutral-600'}`}>
                <Database size={13} />
                <span>{adminSettings.showUnregistered ? 'Viser hardkodede' : 'Skjuler hardkodede'}</span>
              </button>
              <div className="ml-auto flex items-center space-x-2">
                <button onClick={handleCleanupScan} disabled={cleanupScanning}
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-600/30 hover:bg-amber-600/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Find og slet forældet indhold der ikke bruges i koden">
                  {cleanupScanning
                    ? <><RefreshCw size={13} className="animate-spin" /><span><EditableContent contentKey="content-management-panel-scanner" fallback="Scanner..." /></span></>
                    : <><Sparkles size={13} /><span><EditableContent contentKey="content-management-panel-ryd-op" fallback="Ryd op" /></span></>
                  }
                </button>
                <button onClick={() => { setShowGroupModal(true); setGroupMode('scan'); setGroupPreviewKeys(null); setScanExcludedKeys(new Set()); stopPicking(); }}
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-700 text-neutral-300 hover:bg-neutral-600 border border-transparent transition-colors">
                  <FolderInput size={13} /><span><EditableContent contentKey="content-management-panel-grupper-indhold" fallback="Grupper indhold" /></span>
                </button>
                <button onClick={() => setShowNewCatModal(true)}
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors">
                  <FolderPlus size={13} /><span><EditableContent contentKey="content-management-panel-ny-kategori" fallback="Ny kategori" /></span>
                </button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="w-56 bg-neutral-700/40 p-3 overflow-y-auto shrink-0 flex flex-col gap-3 border-r border-neutral-700">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Søg…"
                    className="w-full pl-8 pr-6 py-1.5 bg-neutral-600 text-white rounded-lg text-xs placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary" />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white">
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {Object.entries(PREDEFINED_CATEGORIES).map(([k, v]) => renderSidebarCat(k, v.label))}
                </div>
                {Object.keys(customCategories).length > 0 && (
                  <div className="border-t border-neutral-600 pt-2">
                    <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold px-1 mb-1.5"><EditableContent contentKey="content-management-panel-egne" fallback="Egne" /></p>
                    <div className="space-y-0.5">
                      {Object.entries(customCategories).map(([k, v]) => renderSidebarCat(k, v, true))}
                    </div>
                  </div>
                )}
                {extraCategories.filter(k => !customCategories[k]).length > 0 && (
                  <div className="border-t border-neutral-600 pt-2">
                    <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold px-1 mb-1.5"><EditableContent contentKey="content-management-panel-andre" fallback="Andre" /></p>
                    <div className="space-y-0.5">
                      {extraCategories.filter(k => !customCategories[k]).map(k => renderSidebarCat(k, k, true))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 p-5 overflow-y-auto">
                {searchQuery ? (
                  <div className="space-y-3">
                    <p className="text-sm text-neutral-400">
                      {(searchResults?.dbMatches.length ?? 0) + (searchResults?.unregMatches.length ?? 0)} <EditableContent contentKey="content-management-panel-resultater-for" fallback="resultater for “" />{searchQuery}&rdquo;
                    </p>
                    {searchResults?.dbMatches.map(renderDbItem)}
                    {searchResults?.unregMatches.map(renderUnregisteredItem)}
                    {(searchResults?.dbMatches.length ?? 0) + (searchResults?.unregMatches.length ?? 0) === 0 && (
                      <div className="text-center py-12 text-neutral-500 text-sm"><EditableContent contentKey="content-management-panel-ingen-resultater" fallback="Ingen resultater." /></div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-white">
                        {allCategoryLabels[activeCategory] ?? activeCategory}
                      </h3>
                      <button onClick={() => setShowAddForm(v => !v)}
                        className="flex items-center space-x-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark transition-colors">
                        <Plus size={14} /><span><EditableContent contentKey="content-management-panel-tilfoej-2" fallback="Tilføj" /></span>
                      </button>
                    </div>
                    {showAddForm && (
                      <div className="bg-neutral-700/20 border border-neutral-700 rounded-lg p-4 mb-4 space-y-3">
                        <h4 className="text-sm font-medium text-white"><EditableContent contentKey="content-management-panel-nyt-indhold" fallback="Nyt indhold" /></h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-neutral-300 mb-1"><EditableContent contentKey="content-management-panel-noegle" fallback="Nøgle" /></label>
                            <input type="text" value={newContent.key} onChange={e => setNewContent({ ...newContent, key: e.target.value })} className="form-input text-sm" placeholder="hero-title" />
                          </div>
                          <div>
                            <label className="block text-xs text-neutral-300 mb-1"><EditableContent contentKey="content-management-panel-type" fallback="Type" /></label>
                            <select value={newContent.type} onChange={e => setNewContent({ ...newContent, type: e.target.value as 'text' | 'image' | 'color' })} className="form-input text-sm">
                              <option value="text"><EditableContent contentKey="content-management-panel-tekst" fallback="Tekst" /></option>
                              <option value="image"><EditableContent contentKey="content-management-panel-billede" fallback="Billede" /></option>
                              <option value="color"><EditableContent contentKey="content-management-panel-farve" fallback="Farve" /></option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-300 mb-1"><EditableContent contentKey="content-management-panel-beskrivelse" fallback="Beskrivelse" /></label>
                          <input type="text" value={newContent.description} onChange={e => setNewContent({ ...newContent, description: e.target.value })} className="form-input text-sm" placeholder="Hvad er dette felt?" />
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-300 mb-1"><EditableContent contentKey="content-management-panel-vaerdi" fallback="Værdi" /></label>
                          {newContent.type === 'image' ? (
                            <div>
                              <ImageUpload onImageUploaded={handleImageUpload} bucket="site-content" />
                              {newContent.value && <img src={newContent.value} alt="Preview" className="mt-2 w-24 h-24 object-cover rounded" />}
                            </div>
                          ) : newContent.type === 'color' ? (
                            <div className="flex items-center gap-3">
                              <input type="color" value={toHexForPicker(newContent.value)} onChange={e => setNewContent({ ...newContent, value: e.target.value })} className="w-14 h-10 rounded border border-neutral-600 cursor-pointer bg-transparent" />
                              <input type="text" value={newContent.value} onChange={e => setNewContent({ ...newContent, value: e.target.value })} className="form-input flex-1 text-sm font-mono" placeholder="#0F52BA" />
                            </div>
                          ) : (
                            <textarea value={newContent.value} onChange={e => setNewContent({ ...newContent, value: e.target.value })} className="form-input text-sm" rows={2} placeholder="Indhold…" />
                          )}
                        </div>
                        <div className="flex justify-end space-x-2">
                          <button onClick={() => { setShowAddForm(false); setNewContent({ key: '', type: 'text', value: '', description: '', category: activeCategory }); }}
                            className="px-3 py-1.5 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500"><EditableContent contentKey="content-management-panel-annuller" fallback="Annuller" /></button>
                          <button onClick={handleAddContent} className="px-3 py-1.5 bg-primary text-white rounded text-sm hover:bg-primary-dark"><EditableContent contentKey="content-management-panel-tilfoej" fallback="Tilføj" /></button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-3">{renderCategoryContent(activeCategory)}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {movingKey && renderMoveModal()}
      {showNewCatModal && renderNewCatModal()}
      {showGroupModal && renderGroupModal()}
      {renamingCat && renderRenameCatModal()}
      {deletingCat && renderDeleteCatModal()}
      {showCleanupModal && renderCleanupModal()}
    </>
  );
};

export default ContentManagementPanel;
