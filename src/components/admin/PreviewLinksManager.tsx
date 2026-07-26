/**
 * PreviewLinksManager.tsx
 *
 * Admin panel tab for creating client preview links.
 *
 * Flow:
 *   1. Admin pastes a Google Drive URL — a single video, a single photo, or a
 *      folder containing photos — and gives it a title (e.g. the customer name).
 *   2. On submit, /api/drive-preview?mode=meta resolves and validates the URL
 *      against Google Drive (confirms it exists, is readable by the service
 *      account, and matches the chosen type) before anything is saved.
 *   3. A row is inserted into the `preview_links` table and the admin gets a
 *      flai.dk/preview/[ID] link to copy and send to the client.
 *
 * See PreviewPage.tsx for how the client-facing side renders these links, and
 * PREVIEW_LINKS_SETUP.md for the one-time Supabase table setup this depends on.
 */

import EditableContent from '../EditableContent';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { extractGoogleDriveIdOrFolder } from '../../utils/google-drive-utils';
import { PreviewLink } from '../../types/index';
import toast from 'react-hot-toast';
import {
  Film, Images, Copy, Trash2, ExternalLink, Loader2,
  ToggleLeft, ToggleRight, Eye, AlertCircle,
} from 'lucide-react';

type LinkType = 'video' | 'photos';

const PreviewLinksManager: React.FC = () => {
  const [links, setLinks] = useState<PreviewLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<LinkType>('video');
  const [title, setTitle] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadLinks(); }, []);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('preview_links')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLinks(data || []);
    } catch (err) {
      console.error('Error loading preview links:', err);
      toast.error('Fejl ved indlæsning af preview-links');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Angiv en titel (f.eks. kundens navn)'); return; }

    const parsed = extractGoogleDriveIdOrFolder(driveUrl);
    if (!parsed) { toast.error('Kunne ikke genkende Google Drive-linket'); return; }

    setSubmitting(true);
    try {
      // Validate against Drive before saving anything — confirms the ID
      // exists, is readable, and actually matches the chosen type.
      const metaRes = await fetch(`/api/drive-preview?id=${encodeURIComponent(parsed.id)}&mode=meta`);
      const meta = await metaRes.json();
      if (!metaRes.ok) throw new Error(meta.error || 'Kunne ikke læse filen fra Google Drive');

      if (type === 'video' && meta.type !== 'video') {
        throw new Error(`Linket peger ikke på en video (fandt: ${meta.type === 'folder' ? 'en mappe' : meta.type === 'image' ? 'et billede' : 'ukendt filtype'})`);
      }
      if (type === 'photos' && meta.type !== 'folder' && meta.type !== 'image') {
        throw new Error('Linket peger ikke på et billede eller en mappe med billeder');
      }
      if (type === 'photos' && meta.type === 'folder' && meta.count === 0) {
        throw new Error('Mappen indeholder ingen billeder (eller de er ikke delt korrekt)');
      }

      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('preview_links')
        .insert([{
          type,
          drive_id: parsed.id,
          is_folder: meta.type === 'folder',
          title: title.trim(),
          is_active: true,
          created_by: user?.user?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Preview-link oprettet!');
      setTitle('');
      setDriveUrl('');
      setLinks(prev => [data as PreviewLink, ...prev]);
      copyLink(data as PreviewLink);
    } catch (err) {
      console.error('Error creating preview link:', err);
      const message = err instanceof Error ? err.message : 'Fejl ved oprettelse af preview-link';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = (link: PreviewLink) => {
    const url = `${window.location.origin}/preview/${link.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link kopieret!');
  };

  const handleToggleActive = async (link: PreviewLink) => {
    try {
      const { error } = await supabase
        .from('preview_links')
        .update({ is_active: !link.is_active })
        .eq('id', link.id);
      if (error) throw error;
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, is_active: !l.is_active } : l));
    } catch (err) {
      console.error('Error toggling preview link:', err);
      toast.error('Fejl ved opdatering');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Er du sikker på at du vil slette dette preview-link?')) return;
    try {
      const { error } = await supabase.from('preview_links').delete().eq('id', id);
      if (error) throw error;
      setLinks(prev => prev.filter(l => l.id !== id));
      toast.success('Link slettet');
    } catch (err) {
      console.error('Error deleting preview link:', err);
      toast.error('Fejl ved sletning');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-1">
          <EditableContent contentKey="previewlinksmanager-title" fallback="Preview Links" />
        </h2>
        <p className="text-neutral-400 text-sm">
          <EditableContent
            contentKey="previewlinksmanager-subtitle"
            fallback="Indsæt et Google Drive-link til en video, et enkelt billede eller en mappe med billeder, og få et flai.dk/preview-link kunden kan åbne direkte i browseren."
          />
        </p>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} className="bg-neutral-700/40 rounded-xl p-6 border border-neutral-600 space-y-5">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setType('video')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border font-medium transition-colors ${
              type === 'video'
                ? 'bg-primary/15 border-primary text-primary'
                : 'bg-neutral-800 border-neutral-600 text-neutral-400 hover:text-white'
            }`}
          >
            <Film size={16} /> Video
          </button>
          <button
            type="button"
            onClick={() => setType('photos')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border font-medium transition-colors ${
              type === 'photos'
                ? 'bg-primary/15 border-primary text-primary'
                : 'bg-neutral-800 border-neutral-600 text-neutral-400 hover:text-white'
            }`}
          >
            <Images size={16} /> Billeder
          </button>
        </div>

        <div>
          <label className="block text-sm text-neutral-300 mb-1.5">Titel / kundenavn</label>
          <input
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-primary transition-colors"
            placeholder="F.eks. Villa Strandvej 12"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-300 mb-1.5">
            {type === 'video'
              ? 'Google Drive-link til videoen'
              : 'Google Drive-link til billedet eller mappen med billeder'}
          </label>
          <input
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-primary transition-colors"
            placeholder="https://drive.google.com/..."
            value={driveUrl}
            onChange={e => setDriveUrl(e.target.value)}
          />
          <p className="text-xs text-neutral-500 mt-1.5 flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            Filen/mappen skal være delt som &quot;Alle med linket&quot; eller delt direkte med service-kontoen.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting || !title.trim() || !driveUrl.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : (type === 'video' ? <Film size={16} /> : <Images size={16} />)}
          {submitting ? 'Opretter…' : 'Opret preview-link'}
        </button>
      </form>

      {/* Existing links */}
      <div>
        <h3 className="font-medium text-white mb-4">Eksisterende preview-links</h3>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-neutral-500" /></div>
        ) : links.length === 0 ? (
          <p className="text-neutral-500 text-sm">Ingen preview-links endnu.</p>
        ) : (
          <div className="space-y-3">
            {links.map(link => (
              <div key={link.id} className="bg-neutral-700/40 border border-neutral-600 rounded-xl px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
                  {link.type === 'video' ? <Film size={18} className="text-primary" /> : <Images size={18} className="text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{link.title}</p>
                  <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-3">
                    <span>/preview/{link.id}</span>
                    <span className="flex items-center gap-1"><Eye size={12} /> {link.view_count}</span>
                    {!link.is_active && <span className="text-amber-400">Deaktiveret</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => copyLink(link)} title="Kopiér link" className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-600 transition-colors">
                    <Copy size={16} />
                  </button>
                  <a href={`/preview/${link.id}`} target="_blank" rel="noreferrer" title="Åbn preview" className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-600 transition-colors">
                    <ExternalLink size={16} />
                  </a>
                  <button onClick={() => handleToggleActive(link)} title={link.is_active ? 'Deaktiver' : 'Aktiver'} className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-600 transition-colors">
                    {link.is_active ? <ToggleRight size={16} className="text-primary" /> : <ToggleLeft size={16} />}
                  </button>
                  <button onClick={() => handleDelete(link.id)} title="Slet" className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewLinksManager;
