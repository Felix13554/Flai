// DonationsManager.tsx
import React, { useState, useEffect } from 'react';
import { supabase} from '../../utils/supabase';
import { DonationLink } from '../../types/index';
import { Copy, Trash2, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { generateSlug, generateUniqueSlug } from '../../utils/slug';
import EditableContent from '../EditableContent';

const DonationsManager: React.FC = () => {
  const [donationLinks, setDonationLinks] = useState<DonationLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minAmount, setMinAmount] = useState('50');
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    loadDonationLinks();
  }, []);

  const loadDonationLinks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('donation_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDonationLinks(data || []);
    } catch (err) {
      console.error('Error loading donation links:', err);
      toast.error('Fejl ved indlæsning af betalingslinks');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Angiv venligst en titel');
      return;
    }

    try {
      setFormLoading(true);
      const { data: user } = await supabase.auth.getUser();

      const baseSlug = generateSlug(title);

      const slug = await generateUniqueSlug(
        baseSlug,
        async (slugToCheck) => {
          const { data } = await supabase
            .from('donation_links')
            .select('id')
            .eq('slug', slugToCheck)
            .maybeSingle();
          return !!data;
        }
      );

      const { data, error } = await supabase
        .from('donation_links')
        .insert([
          {
            title: title.trim(),
            slug,
            description: description.trim(),
            min_amount: parseInt(minAmount) || 50,
            is_active: true,
            currency: 'DKK',
            created_by: user?.user?.id
          }
        ])
        .select();

      if (error) throw error;

      toast.success('Betalingslink oprettet!');
      setTitle('');
      setDescription('');
      setMinAmount('50');
      setShowForm(false);
      loadDonationLinks();
    } catch (err) {
      console.error('Error creating donation link:', err);
      toast.error('Fejl ved oprettelse af betalingslink');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (link: DonationLink) => {
    try {
      const { error } = await supabase
        .from('donation_links')
        .update({ is_active: !link.is_active })
        .eq('id', link.id);

      if (error) throw error;

      toast.success(link.is_active ? 'Link deaktiveret' : 'Link aktiveret');
      loadDonationLinks();
    } catch (err) {
      console.error('Error toggling link:', err);
      toast.error('Fejl ved opdatering');
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!window.confirm('Er du sikker på at du vil slette dette link?')) return;

    try {
      const { error } = await supabase
        .from('donation_links')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Link slettet');
      loadDonationLinks();
    } catch (err) {
      console.error('Error deleting link:', err);
      toast.error('Fejl ved sletning');
    }
  };

  const copyToClipboard = (link: DonationLink) => {
    const donationUrl = `${window.location.origin}/donate/${link.slug}`;
    navigator.clipboard.writeText(donationUrl);
    toast.success('Link kopieret!');
  };

  if (loading) {
    return <div className="text-center py-8"><EditableContent contentKey="donations-manager-indlaeser" fallback="Indlæser..." /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold"><EditableContent contentKey="donations-manager-betalingslinks" fallback="Betalingslinks" /></h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          {showForm ? 'Luk' : 'Nyt Link'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateLink} className="bg-neutral-700/30 rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2"><EditableContent contentKey="donations-manager-titel" fallback="Titel" /></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="f.eks. Produktbetaling 2024"
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2"><EditableContent contentKey="donations-manager-beskrivelse" fallback="Beskrivelse" /></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kort beskrivelse af betalingen"
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2"><EditableContent contentKey="donations-manager-minimumsbeloeb-dkk" fallback="Minimumsbeløb (DKK)" /></label>
            <input
              type="number"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="50"
              min="1"
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white"
            />
          </div>
          <button
            type="submit"
            disabled={formLoading}
            className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {formLoading ? 'Opretter...' : 'Opret Link'}
          </button>
        </form>
      )}

      <div className="grid gap-4">
        {donationLinks.length === 0 ? (
          <div className="text-center py-8 text-neutral-400">
            <EditableContent contentKey="donations-manager-ingen-betalingslinks-endnu-opret-det" fallback="Ingen betalingslinks endnu. Opret det første link for at komme i gang!" />
          </div>
        ) : (
          donationLinks.map((link) => (
            <div key={link.id} className="bg-neutral-700/20 rounded-lg p-4 flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-white">{link.title}</h3>
                {link.description && (
                  <p className="text-sm text-neutral-400 mt-1">{link.description}</p>
                )}
                <p className="text-sm text-neutral-500 mt-1"><EditableContent contentKey="donations-manager-slug" fallback="Slug:" /> {link.slug}</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => copyToClipboard(link)}
                  className="p-2 hover:bg-neutral-700 rounded-lg transition-colors"
                  title="Kopier link"
                >
                  <Copy size={18} className="text-neutral-400" />
                </button>

                <button
                  onClick={() => handleToggleActive(link)}
                  className={`p-2 rounded-lg transition-colors ${
                    link.is_active ? 'bg-green-500/20 text-green-500' : 'bg-neutral-600/20 text-neutral-400'
                  }`}
                  title={link.is_active ? 'Deaktiver' : 'Aktivér'}
                >
                  <ToggleRight size={18} />
                </button>

                <button
                  onClick={() => handleDeleteLink(link.id)}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                  title="Slet link"
                >
                  <Trash2 size={18} className="text-red-500" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DonationsManager;
