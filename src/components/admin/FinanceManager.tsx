import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart,
  RefreshCw, Plus, Trash2, Edit2, Check, X, AlertCircle,
  BarChart2, Percent, CreditCard, Calendar,
} from 'lucide-react';
import { supabase, supabaseUrl } from '../../utils/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StripeData {
  fetched_at: string;
  months_range: number;
  balance: { available_dkk: number; pending_dkk: number };
  summary: {
    total_revenue: number;
    total_refunds: number;
    net_revenue: number;
    transaction_count: number;
    average_order: number;
    new_customers: number;
    conversion_rate: number;
  };
  monthly: Array<{ month: string; revenue: number; refunds: number; count: number }>;
  top_payments: Array<{
    id: string; amount: number; currency: string;
    description: string | null; customer_email: string | null; created: number;
  }>;
}

interface FinanceRow {
  id: string;
  label: string;
  amount: number;
  category: 'expense' | 'income' | 'note';
  month: string | null;
  notes: string | null;
  created_at: string;
}

type EditDraft = Omit<FinanceRow, 'id' | 'created_at'>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (ore: number, currency = 'DKK') =>
  new Intl.NumberFormat('da-DK', { style: 'currency', currency, maximumFractionDigits: 0 })
    .format(ore / 100);

const fmtDKK = (kr: number) =>
  new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 })
    .format(kr);

const monthLabel = (yyyymm: string) => {
  const [y, m] = yyyymm.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('da-DK', { month: 'short', year: '2-digit' });
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color = 'text-primary', trend,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color?: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-neutral-700/50 border border-neutral-600 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-400">{label}</span>
        <Icon size={18} className={color} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && (
        <div className="flex items-center gap-1 text-xs text-neutral-400">
          {trend === 'up'   && <TrendingUp size={12} className="text-green-400" />}
          {trend === 'down' && <TrendingDown size={12} className="text-red-400" />}
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Bar chart (pure CSS) ─────────────────────────────────────────────────────

function MiniBarChart({ data }: { data: StripeData['monthly'] }) {
  const max = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="flex items-end gap-1 h-24 w-full">
      {data.map(d => (
        <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div
            className="w-full rounded-t bg-primary/70 hover:bg-primary transition-all"
            style={{ height: `${Math.max(4, (d.revenue / max) * 88)}px` }}
          />
          {/* Tooltip */}
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10">
            <div className="bg-neutral-900 border border-neutral-600 text-xs text-white rounded px-2 py-1 whitespace-nowrap shadow-lg">
              {monthLabel(d.month)}<br />
              {fmt(d.revenue)}<br />
              {d.count} betaling{d.count !== 1 ? 'er' : ''}
            </div>
          </div>
          <span className="text-[9px] text-neutral-500 rotate-45 origin-left mt-1 whitespace-nowrap">
            {monthLabel(d.month)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const EMPTY_DRAFT: EditDraft = {
  label: '', amount: 0, category: 'expense', month: null, notes: null,
};

export default function FinanceManager() {
  const [stripe, setStripe]       = useState<StripeData | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError]     = useState<string | null>(null);
  const [months, setMonths]               = useState<number | 'all'>(12);

  const [rows, setRows]           = useState<FinanceRow[]>([]);
  const [rowsLoading, setRowsLoading]     = useState(false);

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft]         = useState<EditDraft>(EMPTY_DRAFT);
  const [saving, setSaving]       = useState(false);

  // ── Fetch Stripe data ──────────────────────────────────────────────────────
  const fetchStripe = useCallback(async () => {
    setStripeLoading(true);
    setStripeError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const query = months === 'all' ? 'all=true' : `months=${months}`;
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/get-stripe-finance?${query}`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || res.statusText);
      }
      setStripe(await res.json());
    } catch (e: any) {
      setStripeError(e.message);
    } finally {
      setStripeLoading(false);
    }
  }, [months]);

  // ── Fetch finance_data rows ────────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    setRowsLoading(true);
    const { data, error } = await supabase
      .from('finance_data')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setRows(data as FinanceRow[]);
    setRowsLoading(false);
  }, []);

  useEffect(() => { fetchStripe(); }, [fetchStripe]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ── Computed: net profit including manual rows ────────────────────────────
  const manualExpenses = rows
    .filter(r => r.category === 'expense')
    .reduce((s, r) => s + r.amount, 0);
  const manualIncome = rows
    .filter(r => r.category === 'income')
    .reduce((s, r) => s + r.amount, 0);
  const stripeNet = stripe ? stripe.summary.net_revenue : 0;
  // stripe amounts are in øre; manual rows are in DKK whole units
  const netProfit = stripeNet / 100 + manualIncome - manualExpenses;

  // ── CRUD helpers ───────────────────────────────────────────────────────────
  const startNew = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId('new');
  };
  const startEdit = (r: FinanceRow) => {
    setDraft({ label: r.label, amount: r.amount, category: r.category, month: r.month, notes: r.notes });
    setEditingId(r.id);
  };
  const cancelEdit = () => { setEditingId(null); setDraft(EMPTY_DRAFT); };

  const saveRow = async () => {
    if (!draft.label.trim()) return;
    setSaving(true);
    if (editingId === 'new') {
      const { error } = await supabase.from('finance_data').insert([draft]);
      if (!error) { cancelEdit(); fetchRows(); }
    } else {
      const { error } = await supabase
        .from('finance_data').update(draft).eq('id', editingId!);
      if (!error) { cancelEdit(); fetchRows(); }
    }
    setSaving(false);
  };

  const deleteRow = async (id: string) => {
    if (!confirm('Slet denne post?')) return;
    await supabase.from('finance_data').delete().eq('id', id);
    fetchRows();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={24} className="text-primary" /> Økonomi & Omsætning
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Stripe-data kombineret med dine egne udgifts- og indkomstposter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={months}
            onChange={e => setMonths(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value={1}>Seneste måned</option>
            <option value={3}>Seneste 3 mdr.</option>
            <option value={6}>Seneste 6 mdr.</option>
            <option value={12}>Seneste 12 mdr.</option>
            <option value={24}>Seneste 2 år</option>
            <option value="all">Alle tider</option>
          </select>
          <button
            onClick={fetchStripe}
            disabled={stripeLoading}
            className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={stripeLoading ? 'animate-spin' : ''} />
            {stripeLoading ? 'Henter…' : 'Opdater Stripe'}
          </button>
        </div>
      </div>

      {/* ── Stripe error ───────────────────────────────────────────────────── */}
      {stripeError && (
        <div className="bg-red-900/30 border border-red-500 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Stripe-fejl</p>
            <p className="text-xs text-red-400 mt-0.5">{stripeError}</p>
          </div>
        </div>
      )}

      {/* ── Stripe loading skeleton ────────────────────────────────────────── */}
      {stripeLoading && !stripe && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-neutral-700/30 rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Stripe data ────────────────────────────────────────────────────── */}
      {stripe && (
        <>
          {/* Balance */}
          <div className="bg-neutral-700/30 border border-neutral-600 rounded-xl p-4">
            <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3">
              Stripe Balance – opdateret {new Date(stripe.fetched_at).toLocaleString('da-DK')}
            </p>
            <div className="flex gap-6 flex-wrap">
              <div>
                <p className="text-xs text-neutral-500">Tilgængelig</p>
                <p className="text-xl font-bold text-green-400">{fmt(stripe.balance.available_dkk)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Afventende</p>
                <p className="text-xl font-bold text-yellow-400">{fmt(stripe.balance.pending_dkk)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Netto-omsætning ({months === 'all' ? 'alle tider' : `${months} mdr.`})</p>
                <p className="text-xl font-bold text-primary">{fmt(stripe.summary.net_revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Beregnet Netto-profit</p>
                <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmtDKK(netProfit)}
                </p>
              </div>
            </div>
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Brutto-omsætning"
              value={fmt(stripe.summary.total_revenue)}
              icon={DollarSign} color="text-green-400"
            />
            <StatCard
              label="Refunderinger"
              value={fmt(stripe.summary.total_refunds)}
              icon={TrendingDown} color="text-red-400"
            />
            <StatCard
              label="Transaktioner"
              value={String(stripe.summary.transaction_count)}
              sub={`Gns. ${fmt(stripe.summary.average_order)}/ordre`}
              icon={ShoppingCart} color="text-primary"
            />
            <StatCard
              label="Nye kunder"
              value={String(stripe.summary.new_customers)}
              icon={Users} color="text-blue-400"
            />
            <StatCard
              label="Konverteringsrate"
              value={`${stripe.summary.conversion_rate}%`}
              icon={Percent} color="text-purple-400"
            />
            <StatCard
              label="Egne udgifter"
              value={fmtDKK(manualExpenses)}
              icon={CreditCard} color="text-red-300"
            />
            <StatCard
              label="Ekstra indkomst"
              value={fmtDKK(manualIncome)}
              icon={TrendingUp} color="text-green-300"
            />
            <StatCard
              label="Netto-profit (total)"
              value={fmtDKK(netProfit)}
              trend={netProfit >= 0 ? 'up' : 'down'}
              icon={BarChart2}
              color={netProfit >= 0 ? 'text-green-400' : 'text-red-400'}
            />
          </div>

          {/* Monthly chart */}
          {stripe.monthly.length > 0 && (
            <div className="bg-neutral-700/30 border border-neutral-600 rounded-xl p-5">
              <p className="text-sm font-medium text-neutral-300 mb-4 flex items-center gap-2">
                <Calendar size={14} /> Månedlig omsætning
              </p>
              <MiniBarChart data={stripe.monthly} />
            </div>
          )}

          {/* Top payments */}
          {stripe.top_payments.length > 0 && (
            <div className="bg-neutral-700/30 border border-neutral-600 rounded-xl overflow-hidden">
              <p className="text-sm font-medium text-neutral-300 px-5 py-4 flex items-center gap-2 border-b border-neutral-600">
                <CreditCard size={14} /> Top betalinger
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-neutral-500 border-b border-neutral-700">
                      <th className="text-left px-5 py-2 font-medium">Dato</th>
                      <th className="text-left px-5 py-2 font-medium">Beskrivelse</th>
                      <th className="text-left px-5 py-2 font-medium">Kunde</th>
                      <th className="text-right px-5 py-2 font-medium">Beløb</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stripe.top_payments.map(p => (
                      <tr key={p.id} className="border-b border-neutral-700/50 hover:bg-neutral-700/20">
                        <td className="px-5 py-2.5 text-neutral-400 whitespace-nowrap">
                          {new Date(p.created * 1000).toLocaleDateString('da-DK')}
                        </td>
                        <td className="px-5 py-2.5 text-neutral-300 max-w-xs truncate">
                          {p.description || <span className="text-neutral-600 italic">—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-neutral-400 truncate max-w-xs">
                          {p.customer_email || <span className="text-neutral-600 italic">—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-right text-green-400 font-medium whitespace-nowrap">
                          {fmt(p.amount, p.currency.toUpperCase())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Data table (manual rows) ────────────────────────────────────────── */}
      <div className="bg-neutral-700/30 border border-neutral-600 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-600">
          <div>
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <BarChart2 size={14} className="text-primary" /> Data — Udgifter &amp; Tilpasninger
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">
              Tilføj udgifter, ekstra indkomst eller noter. Bruges til at beregne netto-profit.
            </p>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary/80 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} /> Tilføj
          </button>
        </div>

        {/* New row form */}
        {editingId === 'new' && (
          <div className="px-5 py-4 bg-neutral-600/20 border-b border-neutral-600">
            <DataRowForm
              draft={draft} onChange={setDraft}
              onSave={saveRow} onCancel={cancelEdit} saving={saving}
            />
          </div>
        )}

        {/* Table */}
        {rowsLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-7 h-7 border-2 border-neutral-500 border-t-primary rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-neutral-500 text-sm py-10">
            Ingen poster endnu. Klik "Tilføj" for at starte.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 border-b border-neutral-700">
                  <th className="text-left px-5 py-2 font-medium">Betegnelse</th>
                  <th className="text-left px-5 py-2 font-medium">Kategori</th>
                  <th className="text-left px-5 py-2 font-medium">Måned</th>
                  <th className="text-left px-5 py-2 font-medium">Noter</th>
                  <th className="text-right px-5 py-2 font-medium">Beløb (DKK)</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  editingId === r.id ? (
                    <tr key={r.id} className="border-b border-neutral-700 bg-neutral-600/20">
                      <td colSpan={6} className="px-5 py-3">
                        <DataRowForm
                          draft={draft} onChange={setDraft}
                          onSave={saveRow} onCancel={cancelEdit} saving={saving}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} className="border-b border-neutral-700/50 hover:bg-neutral-700/20 group">
                      <td className="px-5 py-3 text-neutral-200 font-medium">{r.label}</td>
                      <td className="px-5 py-3">
                        <CategoryBadge category={r.category} />
                      </td>
                      <td className="px-5 py-3 text-neutral-400">
                        {r.month ? monthLabel(r.month) : <span className="text-neutral-600">—</span>}
                      </td>
                      <td className="px-5 py-3 text-neutral-400 max-w-xs truncate">
                        {r.notes || <span className="text-neutral-600">—</span>}
                      </td>
                      <td className={`px-5 py-3 text-right font-semibold ${
                        r.category === 'expense' ? 'text-red-400' :
                        r.category === 'income'  ? 'text-green-400' :
                        'text-neutral-300'
                      }`}>
                        {r.category === 'expense' ? '−' : r.category === 'income' ? '+' : ''}
                        {fmtDKK(r.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(r)}
                            className="p-1 text-neutral-400 hover:text-white transition-colors"
                            title="Rediger"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => deleteRow(r.id)}
                            className="p-1 text-neutral-400 hover:text-red-400 transition-colors"
                            title="Slet"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Category badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: FinanceRow['category'] }) {
  const map = {
    expense: { label: 'Udgift',  cls: 'bg-red-900/40 text-red-300 border-red-700/50' },
    income:  { label: 'Indkomst', cls: 'bg-green-900/40 text-green-300 border-green-700/50' },
    note:    { label: 'Note',    cls: 'bg-neutral-700 text-neutral-300 border-neutral-600' },
  };
  const { label, cls } = map[category];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>{label}</span>
  );
}

// ─── Inline edit form ─────────────────────────────────────────────────────────

function DataRowForm({
  draft, onChange, onSave, onCancel, saving,
}: {
  draft: EditDraft;
  onChange: (d: EditDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) =>
    onChange({ ...draft, [k]: v });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
      <div className="lg:col-span-2">
        <label className="block text-xs text-neutral-400 mb-1">Betegnelse *</label>
        <input
          value={draft.label}
          onChange={e => set('label', e.target.value)}
          placeholder="F.eks. Husleje, Software-abonnement…"
          className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Kategori</label>
        <select
          value={draft.category}
          onChange={e => set('category', e.target.value as EditDraft['category'])}
          className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="expense">Udgift</option>
          <option value="income">Indkomst</option>
          <option value="note">Note</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Beløb (DKK)</label>
        <input
          type="number"
          min={0}
          value={draft.amount}
          onChange={e => set('amount', parseFloat(e.target.value) || 0)}
          className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Måned (valgfri)</label>
        <input
          type="month"
          value={draft.month || ''}
          onChange={e => set('month', e.target.value || null)}
          className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Note</label>
        <input
          value={draft.notes || ''}
          onChange={e => set('notes', e.target.value || null)}
          placeholder="Valgfri kommentar"
          className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
        />
      </div>
      <div className="flex items-end gap-2">
        <button
          onClick={onSave}
          disabled={saving || !draft.label.trim()}
          className="flex items-center gap-1 bg-primary hover:bg-primary/80 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Check size={14} /> {saving ? 'Gemmer…' : 'Gem'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1 bg-neutral-600 hover:bg-neutral-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
