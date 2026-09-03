import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, CheckCircle, XCircle, Database, Zap, AlertTriangle } from 'lucide-react';
import { syncAllToMeilisearch, getMeilisearchIndexStats } from '../../utils/meilisearchSync';
import { getMeilisearchHealth } from '../../utils/meilisearch';
import toast from 'react-hot-toast';
import EditableContent from '../EditableContent';

interface IndexStat {
  numberOfDocuments: number;
  isIndexing: boolean;
}

const MeilisearchManager: React.FC = () => {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    success: boolean;
    counts: Record<string, number>;
    errors: string[];
    timestamp: Date;
  } | null>(null);
  const [stats, setStats] = useState<Record<string, IndexStat> | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [health, setHealth] = useState<{ status: string; version: string } | null>(null);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [s, h] = await Promise.all([
        getMeilisearchIndexStats(),
        getMeilisearchHealth(),
      ]);
      setStats(s);
      setHealth(h);
    } catch (err) {
      console.error('Failed to load Meilisearch stats', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    const toastId = toast.loading('Synkroniserer med Meilisearch...');
    try {
      const result = await syncAllToMeilisearch();
      setLastSyncResult({ ...result, timestamp: new Date() });
      if (result.success) {
        const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
        toast.success(`Synk gennemført! ${total} dokumenter indekseret.`, { id: toastId });
      } else {
        toast.error(`Synk afsluttet med fejl (${result.errors.length})`, { id: toastId });
      }
      await loadStats();
    } catch (err) {
      toast.error('Synk fejlede', { id: toastId });
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const INDEX_LABELS: Record<string, string> = {
    products: 'Produkter',
    portfolio: 'Portfolio',
    pages: 'Sider',
    content: 'Indhold',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Search size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold"><EditableContent contentKey="meilisearch-manager-meilisearch" fallback="Meilisearch" /></h2>
            <p className="text-sm text-neutral-400"><EditableContent contentKey="meilisearch-manager-soegeindeks-administration" fallback="Søgeindeks administration" /></p>
          </div>
        </div>

        {health && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
            <CheckCircle size={14} />
            {health.status} <EditableContent contentKey="meilisearch-manager-v" fallback="· v" />{health.version}
          </div>
        )}
      </div>

      {/* Index Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(INDEX_LABELS).map(([key, label]) => {
          const stat = stats?.[key];
          return (
            <div key={key} className="bg-neutral-800 rounded-xl p-4 border border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 uppercase tracking-wide">{label}</span>
                {stat?.isIndexing && (
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" title="Indekserer..." />
                )}
              </div>
              {loadingStats ? (
                <div className="h-7 bg-neutral-700 rounded animate-pulse" />
              ) : (
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-bold text-white">
                    {stat?.numberOfDocuments === -1 ? '—' : (stat?.numberOfDocuments ?? 0)}
                  </span>
                  <span className="text-xs text-neutral-500 mb-0.5"><EditableContent contentKey="meilisearch-manager-docs" fallback="docs" /></span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sync Action */}
      <div className="bg-neutral-800 rounded-xl p-5 border border-neutral-700">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium mb-1 flex items-center gap-2">
              <Database size={16} className="text-primary" />
              <EditableContent contentKey="meilisearch-manager-fuld-genindeksering" fallback="Fuld Genindeksering" /></h3>
            <p className="text-sm text-neutral-400">
              <EditableContent contentKey="meilisearch-manager-synkroniserer-alle-produkter-portfolio-sider" fallback="Synkroniserer alle produkter, portfolio, sider og sideindhold fra Supabase til Meilisearch.
              Kør dette efter større dataopdateringer." /></p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm font-medium"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Synkroniserer...' : 'Synkroniser nu'}
          </button>
        </div>
      </div>

      {/* Last Sync Result */}
      {lastSyncResult && (
        <div
          className={`rounded-xl p-5 border ${
            lastSyncResult.success
              ? 'bg-green-500/5 border-green-500/20'
              : 'bg-yellow-500/5 border-yellow-500/20'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            {lastSyncResult.success ? (
              <CheckCircle size={16} className="text-green-400" />
            ) : (
              <AlertTriangle size={16} className="text-yellow-400" />
            )}
            <span className="font-medium text-sm">
              {lastSyncResult.success ? 'Synkronisering gennemført' : 'Synkronisering med advarsler'}
            </span>
            <span className="text-xs text-neutral-500 ml-auto">
              {lastSyncResult.timestamp.toLocaleTimeString('da-DK')}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {Object.entries(lastSyncResult.counts).map(([key, count]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <Zap size={12} className="text-primary" />
                <span className="text-neutral-300">{INDEX_LABELS[key] ?? key}:</span>
                <span className="text-white font-medium">{count}</span>
              </div>
            ))}
          </div>

          {lastSyncResult.errors.length > 0 && (
            <div className="space-y-1">
              {lastSyncResult.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-yellow-300">
                  <XCircle size={12} className="shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700/50 text-sm text-neutral-400">
        <p className="font-medium text-neutral-300 mb-1"><EditableContent contentKey="meilisearch-manager-automatisk-synkronisering" fallback="💡 Automatisk synkronisering" /></p>
        <p>
          <EditableContent contentKey="meilisearch-manager-produkter-og-portfolio-opdateres-automatisk" fallback="Produkter og portfolio opdateres automatisk i Meilisearch via" />{' '}
          <code className="text-primary bg-primary/10 px-1 rounded"><EditableContent contentKey="meilisearch-manager-syncproducttomeilisearch" fallback="syncProductToMeilisearch()" /></code> <EditableContent contentKey="meilisearch-manager-og" fallback="og" />{' '}
          <code className="text-primary bg-primary/10 px-1 rounded"><EditableContent contentKey="meilisearch-manager-syncportfolioitemtomeilisearch" fallback="syncPortfolioItemToMeilisearch()" /></code>{' '}
          <EditableContent contentKey="meilisearch-manager-fra" fallback="fra" /><code className="text-primary bg-primary/10 px-1 rounded"><EditableContent contentKey="meilisearch-manager-meilisearchsync-ts" fallback="meilisearchSync.ts" /></code><EditableContent contentKey="meilisearch-manager-brug-fuld-genindeksering-kun-ved" fallback=".
          Brug &quot;Fuld Genindeksering&quot; kun ved behov." /></p>
      </div>
    </div>
  );
};

export default MeilisearchManager;