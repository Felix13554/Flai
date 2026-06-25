import EditableContent from '../components/EditableContent';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart,
  RefreshCw, Plus, Trash2, Edit2, Check, X, AlertCircle,
  BarChart2, Percent, CreditCard, Calendar, Banknote, Landmark,
  Smartphone, FileText,
} from 'lucide-react';
import { supabase } from '../utils/supabase';

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

type PaymentMethod = 'cash' | 'bank_transfer' | 'mobilepay' | 'invoice' | 'other';

interface FinanceRow {
  id: string;
  label: string;
  amount: number;
  category: 'expense' | 'income' | 'note' | 'payment';
  month: string | null;
  notes: string | null;
  created_at: string;
  payment_method?: PaymentMethod | null;
  customer_name?: string | null;
  customer_email?: string | null;
}

type EditDraft = Omit<FinanceRow, 'id' | 'created_at'>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (ore: number, currency = 'DKK') =>
  new Intl.NumberFormat('da-DK', { style: 'currency', currency, maximumFractionDigits: 0 })
    .format(ore / 100);

const fmtDKK = (kr: number) =>
  new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 })
    .format(kr);

const dateLabel = (dateStr: string) => {
  const d = new Date(dateStr + (dateStr.length === 7 ? '-01' : ''));
  if (dateStr.length === 7) {
    return d.toLocaleString('da-DK', { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: '2-digit' });
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:          'Kontant',
  bank_transfer: 'Bankoverførsel',
  mobilepay:     'MobilePay',
  invoice:       'Faktura',
  other:         'Andet',
};

const PAYMENT_METHOD_ICONS: Record<PaymentMethod, React.ElementType> = {
  cash:          Banknote,
  bank_transfer: Landmark,
  mobilepay:     Smartphone,
  invoice:       FileText,
  other:         CreditCard,
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
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10">
            <div className="bg-neutral-900 border border-neutral-600 text-xs text-white rounded px-2 py-1 whitespace-nowrap shadow-lg">
              {dateLabel(d.month)}<br />
              {fmt(d.revenue)}<br />
              {d.count} <EditableContent contentKey="finance-page-betaling" fallback="betaling" />{d.count !== 1 ? 'er' : ''}
            </div>
          </div>
          <span className="text-[9px] text-neutral-500 rotate-45 origin-left mt-1 whitespace-nowrap">
            {dateLabel(d.month)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Payment method badge ─────────────────────────────────────────────────────

function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const Icon = PAYMENT_METHOD_ICONS[method];
  const colorMap: Record<PaymentMethod, string> = {
    cash:          'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    bank_transfer: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    mobilepay:     'bg-purple-900/40 text-purple-300 border-purple-700/50',
    invoice:       'bg-orange-900/40 text-orange-300 border-orange-700/50',
    other:         'bg-neutral-700 text-neutral-300 border-neutral-600',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${colorMap[method]}`}>
      <Icon size={10} />
      {PAYMENT_METHOD_LABELS[method]}
    </span>
  );
}

// ─── Category badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: FinanceRow['category'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    expense: { label: 'Udgift',   cls: 'bg-red-900/40 text-red-300 border-red-700/50' },
    income:  { label: 'Indkomst', cls: 'bg-green-900/40 text-green-300 border-green-700/50' },
    note:    { label: 'Note',     cls: 'bg-neutral-700 text-neutral-300 border-neutral-600' },
    payment: { label: 'Betaling', cls: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50' },
  };
  const { label, cls } = map[category] ?? map.note;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>{label}</span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const EMPTY_DRAFT: EditDraft = {
  label: '', amount: 0, category: 'expense', month: null, notes: null,
  payment_method: null, customer_name: null, customer_email: null,
};

const currentDate = () => new Date().toISOString().slice(0, 10);

export default function FinancePage() {
  const [stripe, setStripe]               = useState<StripeData | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError]     = useState<string | null>(null);

  const [months, setMonths] = useState<number | 'all' | 'custom'>(12);
  const [customFrom, setCustomFrom] = useState<string>(''); // YYYY-MM-DD

  const [rows, setRows]               = useState<FinanceRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | 'new' | 'new-payment' | null>(null);
  const [draft, setDraft]         = useState<EditDraft>({ ...EMPTY_DRAFT, month: currentDate() });
  const [saving, setSaving]       = useState(false);

  // ── Fetch Stripe data ──────────────────────────────────────────────────────
  const fetchStripe = useCallback(async () => {
    setStripeLoading(true);
    setStripeError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const query =
        months === 'all'    ? 'all=true' :
        months === 'custom' ? (customFrom ? `from=${customFrom}` : 'all=true') :
        `months=${months}`;
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
  }, [months, customFrom]);

  // ── Fetch finance_data rows ────────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    setRowsLoading(true);
    const { data, error } = await supabase
      .from('finance_data')
      .select('*')
      .order('month', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error && data) setRows(data as FinanceRow[]);
    setRowsLoading(false);
  }, []);

  useEffect(() => { fetchStripe(); }, [fetchStripe]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ── Filter rows by timespan ────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (months === 'all') return rows;
    if (months === 'custom') {
      if (!customFrom) return rows;
      return rows.filter(r => {
        if (!r.month) return true;
        return r.month.slice(0, 10) >= customFrom;
      });
    }
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return rows.filter(r => {
      if (!r.month) return true;
      return r.month.slice(0, 10) >= cutoffStr;
    });
  }, [rows, months, customFrom]);

  // ── Computed totals (all from filteredRows for consistency) ────────────────
  const manualExpenses = filteredRows
    .filter(r => r.category === 'expense')
    .reduce((s, r) => s + r.amount, 0);
  const manualIncome = filteredRows
    .filter(r => r.category === 'income')
    .reduce((s, r) => s + r.amount, 0);
  const manualPayments = filteredRows
    .filter(r => r.category === 'payment')
    .reduce((s, r) => s + r.amount, 0);
  const stripeNet = stripe ? stripe.summary.net_revenue : 0;
  // stripeNet is in øre → divide by 100 for DKK; manual amounts are already DKK
  const netProfit = stripeNet / 100 + manualIncome + manualPayments - manualExpenses;

  // ── Table rows — use filteredRows so display matches the selected period ───
  const paymentRows = filteredRows.filter(r => r.category === 'payment');
  const otherRows   = filteredRows.filter(r => r.category !== 'payment');

  // ── CRUD helpers ───────────────────────────────────────────────────────────
  const startNew = () => {
    setDraft({ ...EMPTY_DRAFT, month: currentDate() });
    setEditingId('new');
  };
  const startNewPayment = () => {
    setDraft({ ...EMPTY_DRAFT, category: 'payment', payment_method: 'cash', month: currentDate() });
    setEditingId('new-payment');
  };
  const startEdit = (r: FinanceRow) => {
    setDraft({
      label: r.label, amount: r.amount, category: r.category,
      month: r.month, notes: r.notes,
      payment_method: r.payment_method ?? null,
      customer_name: r.customer_name ?? null,
      customer_email: r.customer_email ?? null,
    });
    setEditingId(r.id);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, month: currentDate() });
  };

  const saveRow = async () => {
    if (!draft.label.trim()) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      label: draft.label, amount: draft.amount,
      category: draft.category, month: draft.month, notes: draft.notes,
    };
    if (draft.category === 'payment') {
      payload.payment_method  = draft.payment_method;
      payload.customer_name   = draft.customer_name;
      payload.customer_email  = draft.customer_email;
    }
    if (editingId === 'new' || editingId === 'new-payment') {
      const { error } = await supabase.from('finance_data').insert([payload]);
      if (!error) { cancelEdit(); fetchRows(); }
    } else {
      const { error } = await supabase.from('finance_data').update(payload).eq('id', editingId!);
      if (!error) { cancelEdit(); fetchRows(); }
    }
    setSaving(false);
  };

  const deleteRow = async (id: string) => {
    if (!confirm('Slet denne post?')) return;
    await supabase.from('finance_data').delete().eq('id', id);
    fetchRows();
  };

  const spanLabel =
    months === 'all'    ? 'alle tider' :
    months === 'custom' ? (customFrom ? `fra ${new Date(customFrom).toLocaleDateString('da-DK')}` : 'alle tider') :
    months === 1  ? 'seneste måned' :
    months === 12 ? 'seneste 12 mdr.' :
    months === 24 ? 'seneste 2 år' :
    `seneste ${months} mdr.`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="pt-24 pb-16 min-h-screen">
      <div className="container">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <TrendingUp size={24} className="text-primary" /> <EditableContent contentKey="finance-page-oekonomi-omsaetning" fallback="Økonomi & Omsætning" />
              </h2>
              <p className="text-sm text-neutral-400 mt-1">
                <EditableContent contentKey="finance-page-stripe-data-kombineret-med-dine" fallback="Stripe-data kombineret med dine egne udgifts- og indkomstposter." />
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={months}
                onChange={e => {
                  const v = e.target.value;
                  setMonths(v === 'all' ? 'all' : v === 'custom' ? 'custom' : Number(v));
                }}
                className="bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
              >
                <option value={1}><EditableContent contentKey="finance-page-seneste-maaned" fallback="Seneste måned" /></option>
                <option value={3}><EditableContent contentKey="finance-page-seneste-3-mdr" fallback="Seneste 3 mdr." /></option>
                <option value={6}><EditableContent contentKey="finance-page-seneste-6-mdr" fallback="Seneste 6 mdr." /></option>
                <option value={12}><EditableContent contentKey="finance-page-seneste-12-mdr" fallback="Seneste 12 mdr." /></option>
                <option value={24}><EditableContent contentKey="finance-page-seneste-2-aar" fallback="Seneste 2 år" /></option>
                <option value="all"><EditableContent contentKey="finance-page-alle-tider" fallback="Alle tider" /></option>
                <option value="custom"><EditableContent contentKey="finance-page-vaelg-dato" fallback="Vælg dato…" /></option>
              </select>
              {months === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-400 whitespace-nowrap"><EditableContent contentKey="finance-page-fra-dato" fallback="Fra dato" /></span>
                  <input
                    type="date"
                    value={customFrom}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary [color-scheme:dark]"
                  />
                </div>
              )}
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

          {/* ── Stripe error ─────────────────────────────────────────────────── */}
          {stripeError && (
            <div className="bg-red-900/30 border border-red-500 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300"><EditableContent contentKey="finance-page-stripe-fejl" fallback="Stripe-fejl" /></p>
                <p className="text-xs text-red-400 mt-0.5">{stripeError}</p>
              </div>
            </div>
          )}

          {/* ── Loading skeleton ──────────────────────────────────────────────── */}
          {stripeLoading && !stripe && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-neutral-700/30 rounded-xl h-28 animate-pulse" />
              ))}
            </div>
          )}

          {/* ── Stripe data ───────────────────────────────────────────────────── */}
          {stripe && (
            <>
              {/* Balance row */}
              <div className="bg-neutral-700/30 border border-neutral-600 rounded-xl p-4">
                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3">
                  <EditableContent contentKey="finance-page-stripe-balance-opdateret" fallback="Stripe Balance – opdateret" /> {new Date(stripe.fetched_at).toLocaleString('da-DK')}
                </p>
                <div className="flex gap-6 flex-wrap">
                  <div>
                    <p className="text-xs text-neutral-500"><EditableContent contentKey="finance-page-tilgaengelig" fallback="Tilgængelig" /></p>
                    <p className="text-xl font-bold text-green-400">{fmt(stripe.balance.available_dkk)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500"><EditableContent contentKey="finance-page-afventende" fallback="Afventende" /></p>
                    <p className="text-xl font-bold text-yellow-400">{fmt(stripe.balance.pending_dkk)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500"><EditableContent contentKey="finance-page-netto-omsaetning" fallback="Netto-omsætning (" />{spanLabel})</p>
                    <p className="text-xl font-bold text-primary">{fmtDKK(stripe.summary.net_revenue / 100 + manualPayments + manualIncome)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500"><EditableContent contentKey="finance-page-manuel-betalinger-2" fallback="Manuel betalinger (" />{spanLabel})</p>
                    <p className="text-xl font-bold text-yellow-300">{fmtDKK(manualPayments + manualIncome)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500"><EditableContent contentKey="finance-page-beregnet-netto-profit" fallback="Beregnet Netto-profit (" />{spanLabel})</p>
                    <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtDKK(netProfit)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stat grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label={`Brutto-omsætning (${spanLabel})`}
                  value={fmtDKK(stripe.summary.total_revenue / 100 + manualPayments + manualIncome)}
                  sub={`Stripe: ${fmt(stripe.summary.total_revenue)}`}
                  icon={DollarSign}
                  color="text-green-400"
                />
                <StatCard label="Refunderinger"      value={fmt(stripe.summary.total_refunds)}    icon={TrendingDown} color="text-red-400" />
                <StatCard
                  label="Transaktioner"
                  value={String(stripe.summary.transaction_count)}
                  sub={`Gns. ${fmt(stripe.summary.average_order)}/ordre`}
                  icon={ShoppingCart} color="text-primary"
                />
                <StatCard label="Nye kunder"         value={String(stripe.summary.new_customers)} icon={Users}        color="text-blue-400" />
                <StatCard
                  label={`Konverteringsrate (${spanLabel})`}
                  value={(() => {
                    const nettoOmsaetning = stripe.summary.net_revenue / 100 + manualPayments + manualIncome;
                    if (nettoOmsaetning === 0) return '0%';
                    return `${Math.round((netProfit / nettoOmsaetning) * 100)}%`;
                  })()}
                  sub="Netto-profit / Netto-omsætning"
                  icon={Percent}
                  color="text-purple-400"
                />
                <StatCard label={`Egne udgifter (${spanLabel})`}   value={fmtDKK(manualExpenses)}              icon={CreditCard} color="text-red-300" />
                <StatCard label={`Manuel indkomst (${spanLabel})`} value={fmtDKK(manualIncome + manualPayments)} icon={Banknote}   color="text-yellow-300" />
                <StatCard
                  label={`Netto-profit (${spanLabel})`}
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
                    <Calendar size={14} /> <EditableContent contentKey="finance-page-maanedlig-omsaetning" fallback="Månedlig omsætning" />
                  </p>
                  <MiniBarChart data={stripe.monthly} />
                </div>
              )}

              {/* Top Stripe payments */}
              {stripe.top_payments.length > 0 && (
                <div className="bg-neutral-700/30 border border-neutral-600 rounded-xl overflow-hidden">
                  <p className="text-sm font-medium text-neutral-300 px-5 py-4 flex items-center gap-2 border-b border-neutral-600">
                    <CreditCard size={14} /> <EditableContent contentKey="finance-page-top-betalinger-stripe" fallback="Top betalinger (Stripe)" />
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-neutral-500 border-b border-neutral-700">
                          <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-dato-5" fallback="Dato" /></th>
                          <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-beskrivelse-3" fallback="Beskrivelse" /></th>
                          <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-kunde-2" fallback="Kunde" /></th>
                          <th className="text-right px-5 py-2 font-medium"><EditableContent contentKey="finance-page-beloeb" fallback="Beløb" /></th>
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

          {/* ── Manual payments ───────────────────────────────────────────────── */}
          <div className="bg-neutral-700/30 border border-neutral-600 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-600">
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  <Banknote size={14} className="text-yellow-400" /> <EditableContent contentKey="finance-page-manuel-betalinger" fallback="Manuel betalinger" />
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  <EditableContent contentKey="finance-page-kontant-mobilepay-bankoverfoersel-og-andre" fallback="Kontant, MobilePay, bankoverførsel og andre betalinger uden for Stripe." />
                </p>
              </div>
              <button
                onClick={startNewPayment}
                disabled={editingId !== null}
                className="flex items-center gap-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} /> <EditableContent contentKey="finance-page-tilfoej-betaling" fallback="Tilføj betaling" />
              </button>
            </div>

            {editingId === 'new-payment' && (
              <div className="px-5 py-4 bg-neutral-600/20 border-b border-neutral-600">
                <PaymentForm
                  draft={draft} onChange={setDraft}
                  onSave={saveRow} onCancel={cancelEdit} saving={saving}
                />
              </div>
            )}

            {rowsLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-7 h-7 border-2 border-neutral-500 border-t-primary rounded-full animate-spin" />
              </div>
            ) : paymentRows.length === 0 && editingId !== 'new-payment' ? (
              <p className="text-center text-neutral-500 text-sm py-10">
                <EditableContent contentKey="finance-page-ingen-manuelle-betalinger-endnu-klik" fallback="Ingen manuelle betalinger endnu. Klik &quot;Tilføj betaling&quot; for at registrere en." />
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-neutral-500 border-b border-neutral-700">
                      <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-dato-4" fallback="Dato" /></th>
                      <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-beskrivelse-2" fallback="Beskrivelse" /></th>
                      <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-betalingsmetode-2" fallback="Betalingsmetode" /></th>
                      <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-kunde" fallback="Kunde" /></th>
                      <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-note-4" fallback="Note" /></th>
                      <th className="text-right px-5 py-2 font-medium"><EditableContent contentKey="finance-page-beloeb-dkk-4" fallback="Beløb (DKK)" /></th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map(r =>
                      editingId === r.id ? (
                        <tr key={r.id} className="border-b border-neutral-700 bg-neutral-600/20">
                          <td colSpan={7} className="px-5 py-3">
                            <PaymentForm
                              draft={draft} onChange={setDraft}
                              onSave={saveRow} onCancel={cancelEdit} saving={saving}
                            />
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.id} className="border-b border-neutral-700/50 hover:bg-neutral-700/20 group">
                          <td className="px-5 py-3 text-neutral-400 whitespace-nowrap">
                            {r.month ? dateLabel(r.month) : <span className="text-neutral-600">—</span>}
                          </td>
                          <td className="px-5 py-3 text-neutral-200 font-medium">{r.label}</td>
                          <td className="px-5 py-3">
                            {r.payment_method
                              ? <PaymentMethodBadge method={r.payment_method} />
                              : <span className="text-neutral-600 text-xs">—</span>}
                          </td>
                          <td className="px-5 py-3 text-neutral-400">
                            <div>{r.customer_name || <span className="text-neutral-600">—</span>}</div>
                            {r.customer_email && (
                              <div className="text-xs text-neutral-500">{r.customer_email}</div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-neutral-400 max-w-xs truncate">
                            {r.notes || <span className="text-neutral-600">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right text-green-400 font-semibold whitespace-nowrap">
                            +{fmtDKK(r.amount)}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => startEdit(r)} className="p-1 text-neutral-400 hover:text-white" title="Rediger">
                                <Edit2 size={13} />
                              </button>
                              <button onClick={() => deleteRow(r.id)} className="p-1 text-neutral-400 hover:text-red-400" title="Slet">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Expenses & other rows ─────────────────────────────────────────── */}
          <div className="bg-neutral-700/30 border border-neutral-600 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-600">
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  <BarChart2 size={14} className="text-primary" /> <EditableContent contentKey="finance-page-data-udgifter-tilpasninger" fallback="Data — Udgifter & Tilpasninger" />
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  <EditableContent contentKey="finance-page-alle-poster-vises-statistik-beregnes" fallback="Alle poster vises. Statistik beregnes kun for" /> <span className="text-neutral-300">{spanLabel}</span>.
                </p>
              </div>
              <button
                onClick={startNew}
                disabled={editingId !== null}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/80 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} /> <EditableContent contentKey="finance-page-tilfoej-udgift" fallback="Tilføj udgift" />
              </button>
            </div>

            {editingId === 'new' && (
              <div className="px-5 py-4 bg-neutral-600/20 border-b border-neutral-600">
                <DataRowForm
                  draft={draft} onChange={setDraft}
                  onSave={saveRow} onCancel={cancelEdit} saving={saving}
                />
              </div>
            )}

            {rowsLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-7 h-7 border-2 border-neutral-500 border-t-primary rounded-full animate-spin" />
              </div>
            ) : otherRows.length === 0 && editingId !== 'new' ? (
              <p className="text-center text-neutral-500 text-sm py-10">
                <EditableContent contentKey="finance-page-ingen-poster-endnu-klik-tilfoej" fallback="Ingen poster endnu. Klik &quot;Tilføj udgift&quot; for at starte." />
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-neutral-500 border-b border-neutral-700">
                      <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-betegnelse-2" fallback="Betegnelse" /></th>
                      <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-kategori-2" fallback="Kategori" /></th>
                      <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-dato-3" fallback="Dato" /></th>
                      <th className="text-left px-5 py-2 font-medium"><EditableContent contentKey="finance-page-noter" fallback="Noter" /></th>
                      <th className="text-right px-5 py-2 font-medium"><EditableContent contentKey="finance-page-beloeb-dkk-3" fallback="Beløb (DKK)" /></th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {otherRows.map(r =>
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
                          <td className="px-5 py-3"><CategoryBadge category={r.category} /></td>
                          <td className="px-5 py-3 text-neutral-400">
                            {r.month ? dateLabel(r.month) : <span className="text-neutral-600">—</span>}
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
                              <button onClick={() => startEdit(r)} className="p-1 text-neutral-400 hover:text-white" title="Rediger">
                                <Edit2 size={13} />
                              </button>
                              <button onClick={() => deleteRow(r.id)} className="p-1 text-neutral-400 hover:text-red-400" title="Slet">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Expense / income / note form ─────────────────────────────────────────────

const EXPENSE_PRESETS = [
  'Husleje', 'Software-abonnement', 'Forsikring', 'Løn', 'Transport',
  'Reklame', 'Udstyr', 'Regnskab', 'Telefon', 'Internet',
];

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

  const [amountRaw, setAmountRaw] = React.useState(draft.amount === 0 ? '' : String(draft.amount));
  const handleAmountChange = (val: string) => {
    setAmountRaw(val);
    const parsed = parseFloat(val.replace(',', '.'));
    set('amount', isNaN(parsed) ? 0 : parsed);
  };

  return (
    <div className="space-y-3">
      {draft.category === 'expense' && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-neutral-500 self-center mr-1"><EditableContent contentKey="finance-page-hurtig" fallback="Hurtig:" /></span>
          {EXPENSE_PRESETS.map(p => (
            <button key={p} type="button" onClick={() => set('label', p)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                draft.label === p
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-neutral-700 border-neutral-600 text-neutral-300 hover:border-neutral-400'
              }`}
            >{p}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
        <div className="lg:col-span-2">
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-betegnelse" fallback="Betegnelse *" /></label>
          <input value={draft.label} onChange={e => set('label', e.target.value)}
            placeholder="F.eks. Husleje, Software-abonnement…"
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-kategori" fallback="Kategori" /></label>
          <select value={draft.category} onChange={e => set('category', e.target.value as EditDraft['category'])}
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white">
            <option value="expense"><EditableContent contentKey="finance-page-udgift" fallback="Udgift" /></option>
            <option value="income"><EditableContent contentKey="finance-page-indkomst" fallback="Indkomst" /></option>
            <option value="note"><EditableContent contentKey="finance-page-note-3" fallback="Note" /></option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-beloeb-dkk-2" fallback="Beløb (DKK)" /></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 pointer-events-none"><EditableContent contentKey="finance-page-kr-2" fallback="kr." /></span>
            <input type="text" inputMode="decimal" value={amountRaw} onChange={e => handleAmountChange(e.target.value)}
              placeholder="0"
              className="w-full bg-neutral-700 border border-neutral-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-dato-2" fallback="Dato" /></label>
          <input type="date" value={draft.month || ''} onChange={e => set('month', e.target.value || null)}
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-note-2" fallback="Note" /></label>
          <input value={draft.notes || ''} onChange={e => set('notes', e.target.value || null)}
            placeholder="Valgfri kommentar"
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-end gap-2">
          <button onClick={onSave} disabled={saving || !draft.label.trim() || draft.amount <= 0}
            className="flex items-center gap-1 bg-primary hover:bg-primary/80 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            <Check size={14} /> {saving ? 'Gemmer…' : 'Gem'}
          </button>
          <button onClick={onCancel}
            className="flex items-center gap-1 bg-neutral-600 hover:bg-neutral-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manual payment form ──────────────────────────────────────────────────────

function PaymentForm({
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

  const [amountRaw, setAmountRaw] = React.useState(draft.amount === 0 ? '' : String(draft.amount));
  const handleAmountChange = (val: string) => {
    setAmountRaw(val);
    const parsed = parseFloat(val.replace(',', '.'));
    set('amount', isNaN(parsed) ? 0 : parsed);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Banknote size={14} className="text-yellow-400" />
        <span className="text-sm font-medium text-yellow-300"><EditableContent contentKey="finance-page-registrer-manuel-betaling" fallback="Registrer manuel betaling" /></span>
      </div>

      {/* Row 1: description + method + amount + date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-beskrivelse" fallback="Beskrivelse *" /></label>
          <input value={draft.label} onChange={e => set('label', e.target.value)}
            placeholder="F.eks. Droneflyvning, Kursus…"
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-betalingsmetode" fallback="Betalingsmetode" /></label>
          <select
            value={draft.payment_method ?? 'cash'}
            onChange={e => set('payment_method', e.target.value as PaymentMethod)}
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
          >
            <option value="cash"><EditableContent contentKey="finance-page-kontant" fallback="💵 Kontant" /></option>
            <option value="mobilepay"><EditableContent contentKey="finance-page-mobilepay" fallback="📱 MobilePay" /></option>
            <option value="bank_transfer"><EditableContent contentKey="finance-page-bankoverfoersel" fallback="🏦 Bankoverførsel" /></option>
            <option value="invoice"><EditableContent contentKey="finance-page-faktura" fallback="📄 Faktura" /></option>
            <option value="other"><EditableContent contentKey="finance-page-andet" fallback="🔖 Andet" /></option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-beloeb-dkk" fallback="Beløb (DKK) *" /></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 pointer-events-none"><EditableContent contentKey="finance-page-kr" fallback="kr." /></span>
            <input type="text" inputMode="decimal" value={amountRaw}
              onChange={e => handleAmountChange(e.target.value)}
              placeholder="0"
              className="w-full bg-neutral-700 border border-neutral-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-dato" fallback="Dato *" /></label>
          <input type="date" value={draft.month || ''} onChange={e => set('month', e.target.value || null)}
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 [color-scheme:dark]"
          />
        </div>
      </div>

      {/* Row 2: customer name + email + note + actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-kundenavn" fallback="Kundenavn" /></label>
          <input
            value={draft.customer_name || ''}
            onChange={e => set('customer_name', e.target.value || null)}
            placeholder="Fulde navn"
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-kunde-e-mail" fallback="Kunde e-mail" /></label>
          <input type="email"
            value={draft.customer_email || ''}
            onChange={e => set('customer_email', e.target.value || null)}
            placeholder="kunde@email.dk"
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1"><EditableContent contentKey="finance-page-note" fallback="Note" /></label>
          <input
            value={draft.notes || ''}
            onChange={e => set('notes', e.target.value || null)}
            placeholder="Valgfri kommentar"
            className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            onClick={onSave}
            disabled={saving || !draft.label.trim() || draft.amount <= 0 || !draft.month}
            className="flex items-center gap-1 bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Check size={14} /> {saving ? 'Gemmer…' : 'Gem betaling'}
          </button>
          <button onClick={onCancel}
            className="flex items-center gap-1 bg-neutral-600 hover:bg-neutral-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
