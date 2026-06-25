import React, { useState } from 'react';
import { Plus, CreditCard as Edit, Trash2, Save, X, Building2, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useData } from '../../contexts/DataContext';
import ImageUpload from '../ImageUpload';
import EditableContent from '../EditableContent';
import toast from 'react-hot-toast';

const ClientLogosManager: React.FC = () => {
  const { clientLogos, refreshClientLogos } = useData();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLogo, setEditingLogo] = useState<any>(null);
  const [newLogo, setNewLogo] = useState({ name: '', logo_url: '', website_url: '' });

  const sortedLogos = [...clientLogos].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // ─── Add ──────────────────────────────────────────────────────────────────
  const handleAddLogo = async () => {
    if (!newLogo.name.trim() || !newLogo.logo_url || !newLogo.website_url.trim()) {
      toast.error('Udfyld alle felter');
      return;
    }
    try {
      const maxSortOrder = clientLogos.length > 0
        ? Math.max(...clientLogos.map(l => l.sort_order ?? 0))
        : -1;
      const { error } = await supabase
        .from('client_logos')
        .insert([{ ...newLogo, sort_order: maxSortOrder + 1 }]);
      if (error) throw error;
      toast.success('Logo tilføjet');
      setNewLogo({ name: '', logo_url: '', website_url: '' });
      setShowAddForm(false);
      await refreshClientLogos();
    } catch (err) {
      console.error(err);
      toast.error('Kunne ikke tilføje logo');
    }
  };

  // ─── Edit ─────────────────────────────────────────────────────────────────
  const handleUpdateLogo = async () => {
    if (!editingLogo?.name?.trim() || !editingLogo?.website_url?.trim()) {
      toast.error('Navn og websted er påkrævet');
      return;
    }
    try {
      const { error } = await supabase
        .from('client_logos')
        .update({
          name: editingLogo.name,
          logo_url: editingLogo.logo_url,
          website_url: editingLogo.website_url,
        })
        .eq('id', editingLogo.id);
      if (error) throw error;
      toast.success('Logo opdateret');
      setEditingLogo(null);
      await refreshClientLogos();
    } catch (err) {
      console.error(err);
      toast.error('Kunne ikke opdatere logo');
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────
  const handleDeleteLogo = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette dette logo?')) return;
    try {
      const { error } = await supabase.from('client_logos').delete().eq('id', id);
      if (error) throw error;
      toast.success('Logo slettet');
      await refreshClientLogos();
    } catch (err) {
      console.error(err);
      toast.error('Kunne ikke slette logo');
    }
  };

  // ─── Reorder ──────────────────────────────────────────────────────────────
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedLogos.length) return;

    const current = sortedLogos[index];
    const target = sortedLogos[targetIndex];
    try {
      await Promise.all([
        supabase.from('client_logos').update({ sort_order: target.sort_order }).eq('id', current.id),
        supabase.from('client_logos').update({ sort_order: current.sort_order }).eq('id', target.id),
      ]);
      await refreshClientLogos();
    } catch (err) {
      console.error(err);
      toast.error('Kunne ikke ændre rækkefølgen');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center">
          <Building2 className="mr-2" size={24} />
          <EditableContent contentKey="client-logos-manager-title" fallback="Kunde Logoer" />
        </h3>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary flex items-center">
          <Plus size={18} className="mr-2" />
          <EditableContent contentKey="client-logos-manager-tilfoej" fallback="Tilføj Logo" />
        </button>
      </div>

      <p className="text-sm text-neutral-400">
        <EditableContent
          contentKey="client-logos-manager-description"
          fallback="Disse logoer vises i en linje på forsiden, lige efter hero-videoen. Alle logoer skaleres til samme højde, så bredden bestemmer hvor mange der er plads til i rækken."
        />
      </p>

      {/* ── Add Form ────────────────────────────────────────────────────── */}
      {showAddForm && (
        <div className="bg-neutral-700/20 rounded-lg p-6 space-y-4">
          <h4 className="text-lg font-semibold">
            <EditableContent contentKey="client-logos-manager-nyt-logo" fallback="Nyt Logo" />
          </h4>
          <div>
            <label className="form-label">
              <EditableContent contentKey="client-logos-manager-virksomhedsnavn" fallback="Virksomhedsnavn" />
            </label>
            <input
              type="text"
              value={newLogo.name}
              onChange={(e) => setNewLogo({ ...newLogo, name: e.target.value })}
              className="form-input"
              placeholder="F.eks. Acme A/S"
            />
          </div>
          <div>
            <label className="form-label">
              <EditableContent contentKey="client-logos-manager-logo" fallback="Logo" />
            </label>
            <ImageUpload
              onImageUploaded={(url) => setNewLogo(prev => ({ ...prev, logo_url: url }))}
              currentImageUrl={newLogo.logo_url || null}
              bucket="client-logos"
            />
          </div>
          <div>
            <label className="form-label">
              <EditableContent contentKey="client-logos-manager-website" fallback="Hjemmeside-link" />
            </label>
            <input
              type="url"
              value={newLogo.website_url}
              onChange={(e) => setNewLogo({ ...newLogo, website_url: e.target.value })}
              className="form-input"
              placeholder="https://example.com"
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => { setShowAddForm(false); setNewLogo({ name: '', logo_url: '', website_url: '' }); }}
              className="btn-secondary"
            >
              <EditableContent contentKey="client-logos-manager-annuller" fallback="Annuller" />
            </button>
            <button onClick={handleAddLogo} className="btn-primary">
              <EditableContent contentKey="client-logos-manager-gem" fallback="Gem Logo" />
            </button>
          </div>
        </div>
      )}

      {/* ── List ────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {sortedLogos.map((logo, index) => (
          <div key={logo.id} className="bg-neutral-700/20 rounded-lg overflow-hidden">
            {editingLogo?.id === logo.id ? (
              <div className="p-6 space-y-4">
                <div>
                  <label className="form-label">
                    <EditableContent contentKey="client-logos-manager-virksomhedsnavn-2" fallback="Virksomhedsnavn" />
                  </label>
                  <input
                    type="text"
                    value={editingLogo.name}
                    onChange={(e) => setEditingLogo({ ...editingLogo, name: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">
                    <EditableContent contentKey="client-logos-manager-logo-2" fallback="Logo" />
                  </label>
                  <ImageUpload
                    onImageUploaded={(url) => setEditingLogo({ ...editingLogo, logo_url: url })}
                    currentImageUrl={editingLogo.logo_url}
                    bucket="client-logos"
                  />
                </div>
                <div>
                  <label className="form-label">
                    <EditableContent contentKey="client-logos-manager-website-2" fallback="Hjemmeside-link" />
                  </label>
                  <input
                    type="url"
                    value={editingLogo.website_url}
                    onChange={(e) => setEditingLogo({ ...editingLogo, website_url: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button onClick={() => setEditingLogo(null)} className="btn-secondary flex items-center">
                    <X size={16} className="mr-2" />
                    <EditableContent contentKey="client-logos-manager-annuller-2" fallback="Annuller" />
                  </button>
                  <button onClick={handleUpdateLogo} className="btn-primary flex items-center">
                    <Save size={16} className="mr-2" />
                    <EditableContent contentKey="client-logos-manager-gem-2" fallback="Gem" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMove(index, 'up')}
                    disabled={index === 0}
                    className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => handleMove(index, 'down')}
                    disabled={index === sortedLogos.length - 1}
                    className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <div className="w-24 h-12 flex items-center justify-center bg-neutral-900/40 rounded shrink-0">
                  <img src={logo.logo_url} alt={logo.name} className="max-h-10 max-w-20 object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{logo.name}</p>
                  <a
                    href={logo.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate block"
                  >
                    {logo.website_url}
                  </a>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditingLogo(logo)}
                    className="p-2 text-neutral-300 hover:text-white hover:bg-neutral-700 rounded transition-colors"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteLogo(logo.id)}
                    className="p-2 text-neutral-300 hover:text-error hover:bg-neutral-700 rounded transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {clientLogos.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <Building2 size={48} className="mx-auto mb-4 opacity-50" />
          <p>
            <EditableContent
              contentKey="client-logos-manager-ingen-logoer"
              fallback="Ingen kunde-logoer fundet. Tilføj det første logo for at komme i gang."
            />
          </p>
        </div>
      )}
    </div>
  );
};

export default ClientLogosManager;
