import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import toast from 'react-hot-toast';
import { inferContentDefaults } from '../utils/contentDefaults';
import { useLoading } from '../contexts/LoadingContext';

interface NewContent {
  key: string;
  type: 'text' | 'image' | 'color';
  value: string;
  description: string;
  category: string;
}

function dispatchContentUpdated() {
  window.dispatchEvent(new CustomEvent('siteContentUpdated'));
}

// ─── Auto-deploy timer (module-level, shared across all hook instances) ───────
const AUTO_DEPLOY_DELAY_MS = 8 * 60 * 1000;
let autoDeployTimer: ReturnType<typeof setTimeout> | null = null;
let autoDeployDeadline: number | null = null;

function dispatchTimerUpdate(msRemaining: number | null) {
  window.dispatchEvent(new CustomEvent('autoDeployTimerUpdate', { detail: { msRemaining } }));
}

async function scheduleAutoDeploy(getToken: () => Promise<string | null>) {
  if (autoDeployTimer !== null) clearTimeout(autoDeployTimer);
  autoDeployDeadline = Date.now() + AUTO_DEPLOY_DELAY_MS;
  dispatchTimerUpdate(AUTO_DEPLOY_DELAY_MS);

  autoDeployTimer = setTimeout(async () => {
    autoDeployTimer = null;
    autoDeployDeadline = null;
    dispatchTimerUpdate(null);

    const accessToken = await getToken();
    if (!accessToken) { console.warn('Auto-deploy: no session'); return; }

    const supabaseUrl = (supabase as any).supabaseUrl as string || import.meta.env.VITE_SUPABASE_URL;
    try {
      toast.loading('Auto-deploy starter...', { id: 'auto-deploy' });
      const res = await fetch(`${supabaseUrl}/functions/v1/deploy-content-to-github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.deployedKeys?.length > 0) {
        toast.success(`Auto-deploy: ${data.deployedKeys.length} noegle(r) committed til GitHub`, { id: 'auto-deploy', duration: 6000 });
      } else if (data.errors?.length > 0) {
        toast.error(`Auto-deploy fejl: ${data.errors[0]}`, { id: 'auto-deploy' });
      } else {
        toast.dismiss('auto-deploy');
      }
    } catch (err: any) {
      toast.error(`Auto-deploy fejl: ${err.message}`, { id: 'auto-deploy' });
    }
  }, AUTO_DEPLOY_DELAY_MS);
}

export function getAutoDeployMsRemaining(): number | null {
  if (autoDeployDeadline === null) return null;
  const remaining = autoDeployDeadline - Date.now();
  return remaining > 0 ? remaining : null;
}

export function cancelAutoDeploy() {
  if (autoDeployTimer !== null) {
    clearTimeout(autoDeployTimer);
    autoDeployTimer = null;
    autoDeployDeadline = null;
    dispatchTimerUpdate(null);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useSiteContent = () => {
  const { isAdmin } = useAuth();
  const { siteContent, getContent, getContentItem, refreshSiteContent, optimisticRemoveContent, isSiteContentLoaded } = useData();
  const { setLoading, isLoading } = useLoading();

  const getAccessToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const updateContent = async (key: string, value: string) => {
    if (!isAdmin) { toast.error('Du har ikke tilladelse til at redigere indhold'); return false; }
    try {
      const defaults = inferContentDefaults(key, value);
      const { error: upsertError } = await supabase.from('site_content').upsert(
        { key, value, type: defaults.type, category: defaults.category, description: defaults.description },
        { onConflict: 'key' }
      );
      if (upsertError) throw upsertError;
      await refreshSiteContent();
      dispatchContentUpdated();
      toast.success('Indhold opdateret');
      scheduleAutoDeploy(getAccessToken);
      return true;
    } catch (err: any) {
      console.error('Error updating content:', err);
      toast.error('Kunne ikke opdatere indhold');
      return false;
    }
  };

  const deleteContent = async (key: string) => {
    if (!isAdmin) { toast.error('Du har ikke tilladelse til at slette indhold'); return false; }
    try {
      // Optimistic update — remove from UI instantly, no refresh wait
      optimisticRemoveContent(key);
      const { error: deleteError } = await supabase.from('site_content').delete().eq('key', key);
      if (deleteError) {
        await refreshSiteContent(); // rollback on failure
        throw deleteError;
      }
      dispatchContentUpdated();
      toast.success('Indhold slettet');
      scheduleAutoDeploy(getAccessToken);
      return true;
    } catch (err: any) {
      console.error('Error deleting content:', err);
      toast.error('Kunne ikke slette indhold');
      return false;
    }
  };

  const deleteManyContent = async (keys: string[]) => {
    if (!isAdmin) { toast.error('Du har ikke tilladelse til at slette indhold'); return false; }
    if (keys.length === 0) return true;
    try {
      // Optimistic update — remove all keys from UI instantly
      optimisticRemoveContent(keys);
      const { error } = await supabase.from('site_content').delete().in('key', keys);
      if (error) {
        await refreshSiteContent(); // rollback on failure
        throw error;
      }
      dispatchContentUpdated();
      scheduleAutoDeploy(getAccessToken);
      return true;
    } catch (err: any) {
      console.error('Error batch-deleting content:', err);
      toast.error('Kunne ikke slette indhold');
      return false;
    }
  };

  const addContent = async (newContent: NewContent) => {
    if (!isAdmin) { toast.error('Du har ikke tilladelse til at tilføje indhold'); return false; }
    try {
      const { error: insertError } = await supabase.from('site_content').insert([newContent]);
      if (insertError) throw insertError;
      await refreshSiteContent();
      dispatchContentUpdated();
      toast.success('Indhold tilføjet');
      scheduleAutoDeploy(getAccessToken);
      return true;
    } catch (err: any) {
      console.error('Error adding content:', err);
      toast.error('Kunne ikke tilføje indhold');
      return false;
    }
  };

  const isContentLoading = (key: string) => isLoading(`content-${key}`);

  return {
    content: siteContent,
    loading: !isSiteContentLoaded,
    error: null,
    updateContent,
    deleteContent,
    deleteManyContent,
    addContent,
    getContent,
    getContentItem,
    fetchContent: refreshSiteContent,
    isContentLoading,
  };
};