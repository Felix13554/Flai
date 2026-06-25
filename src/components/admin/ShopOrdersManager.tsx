import EditableContent from '../EditableContent';
import React, { useEffect, useState } from 'react';
import { Package, RefreshCw, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  price: number;
}

interface ShopOrder {
  id: string;
  created_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  delivery_type: 'pickup' | 'delivery';
  delivery_address: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'paid' | 'ordered' | 'shipped' | 'cancelled';
  payment_intent_id?: string;
  payment_method?: 'online' | 'delivery' | null;
  payment_status?: 'pending' | 'paid' | 'failed' | null;
}

type SortKey = 'date' | 'total' | 'status' | 'name' | 'items';
type SortDir = 'asc' | 'desc';

const STATUS_LABELS: Record<string, string> = {
  pending:   'Afventer',
  paid:      'Betalt',
  ordered:   'Bestilt',
  shipped:   'Afsendt',
  cancelled: 'Annulleret',
};

const STATUS_COLORS: Record<string, string> = {
  pending:   'var(--warning)',
  paid:      'var(--success)',
  ordered:   '#a78bfa',   // soft purple — distinct from other states
  shipped:   'var(--primary)',
  cancelled: 'var(--error)',
};

const STATUS_ORDER: Record<string, number> = {
  pending:   0,
  paid:      1,
  ordered:   2,
  shipped:   3,
  cancelled: 4,
};

const ALL_STATUSES = ['pending', 'paid', 'ordered', 'shipped', 'cancelled'] as const;

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date',   label: 'Dato' },
  { key: 'total',  label: 'Beløb' },
  { key: 'name',   label: 'Navn' },
  { key: 'status', label: 'Status' },
  { key: 'items',  label: 'Antal varer' },
];

const ShopOrdersManager: React.FC = () => {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Status filter — all visible by default
  const [visibleStatuses, setVisibleStatuses] = useState<Set<string>>(
    new Set(ALL_STATUSES)
  );

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('shop_orders')
      .select('id, created_at, customer_name, customer_email, customer_phone, delivery_type, delivery_address, items, total, status, payment_method, payment_status')
      .order('created_at', { ascending: false });
    setOrders((data as ShopOrder[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    await supabase.from('shop_orders').update({ status }).eq('id', id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: status as ShopOrder['status'] } : o));
    setUpdatingId(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date' || key === 'total' || key === 'items' ? 'desc' : 'asc');
    }
  };

  const toggleStatus = (status: string) => {
    setVisibleStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        // Don't allow deselecting all
        if (next.size === 1) return prev;
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (visibleStatuses.size === ALL_STATUSES.length) {
      // Keep only first so we never have empty filter
      setVisibleStatuses(new Set([ALL_STATUSES[0]]));
    } else {
      setVisibleStatuses(new Set(ALL_STATUSES));
    }
  };

  const filteredAndSorted = [...orders]
    .filter(o => visibleStatuses.has(o.status))
    .sort((a, b) => {
      let va: string | number, vb: string | number;
      if      (sortKey === 'date')   { va = a.created_at; vb = b.created_at; }
      else if (sortKey === 'total')  { va = a.total; vb = b.total; }
      else if (sortKey === 'status') { va = STATUS_ORDER[a.status] ?? 99; vb = STATUS_ORDER[b.status] ?? 99; }
      else if (sortKey === 'items')  { va = a.items.reduce((s, i) => s + i.quantity, 0); vb = b.items.reduce((s, i) => s + i.quantity, 0); }
      else                           { va = a.customer_name.toLowerCase(); vb = b.customer_name.toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    return sortDir === 'asc'
      ? <ArrowUp size={12} />
      : <ArrowDown size={12} />;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Package size={20} style={{ color: 'var(--primary)' }} />
          <EditableContent contentKey="shop-orders-manager-shop-ordrer" fallback="Shop Ordrer" />
          {!loading && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium ml-1"
              style={{ background: 'var(--neutral-700)', color: 'var(--neutral-400)' }}
            >
              {filteredAndSorted.length} / {orders.length}
            </span>
          )}
        </h2>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
          style={{ background: 'var(--neutral-700)', color: 'var(--neutral-300)' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <EditableContent contentKey="shop-orders-manager-opdater" fallback="Opdater" />
        </button>
      </div>

      {/* Status filter */}
      <div className="mb-3">
        <p className="text-xs mb-2" style={{ color: 'var(--neutral-500)' }}><EditableContent contentKey="shop-orders-manager-vis-status" fallback="Vis status" /></p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={toggleAll}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
            style={{
              background: visibleStatuses.size === ALL_STATUSES.length ? 'var(--neutral-500)' : 'var(--neutral-700)',
              color: visibleStatuses.size === ALL_STATUSES.length ? 'white' : 'var(--neutral-400)',
            }}
          >
            <EditableContent contentKey="shop-orders-manager-alle" fallback="Alle" />
          </button>
          {ALL_STATUSES.map(s => {
            const active = visibleStatuses.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                style={{
                  background: active ? STATUS_COLORS[s] + '22' : 'var(--neutral-700)',
                  color: active ? STATUS_COLORS[s] : 'var(--neutral-500)',
                  border: `1px solid ${active ? STATUS_COLORS[s] + '55' : 'transparent'}`,
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sort toolbar */}
      <div className="mb-5">
        <p className="text-xs mb-2" style={{ color: 'var(--neutral-500)' }}><EditableContent contentKey="shop-orders-manager-sorter-efter" fallback="Sorter efter" /></p>
        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map(({ key, label }) => {
            const active = sortKey === key;
            return (
              <button
                key={key}
                onClick={() => handleSort(key)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                style={{
                  background: active ? 'var(--primary)' : 'var(--neutral-700)',
                  color: active ? 'white' : 'var(--neutral-300)',
                }}
              >
                {label}
                <SortIcon k={key} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl h-16 animate-pulse" style={{ background: 'var(--neutral-700)' }} />
          ))}
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--neutral-500)' }}>
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p><EditableContent contentKey="shop-orders-manager-ingen-ordrer-matcher-de-valgte" fallback="Ingen ordrer matcher de valgte filtre." /></p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredAndSorted.map(order => (
            <div
              key={order.id}
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--neutral-700)', border: '1px solid var(--neutral-600)' }}
            >
              {/* Order header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div>
                    <p className="text-sm font-medium text-white">{order.customer_name}</p>
                    <p className="text-xs" style={{ color: 'var(--neutral-400)' }}>{order.customer_email}</p>
                    {order.customer_phone && (
                      <p className="text-xs" style={{ color: 'var(--neutral-500)' }}>📞 {order.customer_phone}</p>
                    )}
                  </div>

                  <div className="hidden sm:flex flex-col gap-0.5">
                    {order.items.map((item, i) => (
                      <p key={i} className="text-xs" style={{ color: 'var(--neutral-400)' }}>
                        {item.product_name}
                        {item.size ? <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--neutral-600)', color: 'var(--neutral-200)' }}><EditableContent contentKey="shop-orders-manager-str-2" fallback="str." /> {item.size}</span> : null}
                        {item.color ? <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--neutral-600)', color: 'var(--neutral-200)' }}>{item.color}</span> : null}
                        {' '}× {item.quantity}
                      </p>
                    ))}
                  </div>

                  <div className="hidden sm:block">
                    <p className="text-xs" style={{ color: 'var(--neutral-400)' }}>
                      {new Date(order.created_at).toLocaleDateString('da-DK')}
                    </p>
                  </div>

                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ background: STATUS_COLORS[order.status] + '22', color: STATUS_COLORS[order.status] }}
                  >
                    {STATUS_LABELS[order.status] || order.status}
                  </span>

                  {/* Payment method badge */}
                  {order.payment_method && (
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium hidden sm:inline-flex items-center gap-1"
                      style={{
                        background: order.payment_method === 'online' ? '#3b82f622' : '#f59e0b22',
                        color: order.payment_method === 'online' ? '#60a5fa' : '#fbbf24',
                      }}
                    >
                      {order.payment_method === 'online' ? '💳 Online' : '🚚 Ved levering'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-bold text-white">{order.total} <EditableContent contentKey="shop-orders-manager-kr-3" fallback="kr." /></span>
                  {expandedId === order.id
                    ? <ChevronUp size={16} style={{ color: 'var(--neutral-400)' }} />
                    : <ChevronDown size={16} style={{ color: 'var(--neutral-400)' }} />}
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === order.id && (
                <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--neutral-600)' }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                    <div>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-orders-manager-produkter" fallback="PRODUKTER" /></p>
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm py-1">
                          <span style={{ color: 'var(--neutral-300)' }}>
                            {item.product_name}
                            {item.size ? <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--neutral-600)', color: 'var(--neutral-200)' }}><EditableContent contentKey="shop-orders-manager-str" fallback="str." /> {item.size}</span> : null}
                            {item.color ? <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--neutral-600)', color: 'var(--neutral-200)' }}>{item.color}</span> : null}
                            {' '}× {item.quantity}
                          </span>
                          <span style={{ color: 'var(--neutral-300)' }}>{item.price * item.quantity} <EditableContent contentKey="shop-orders-manager-kr-2" fallback="kr." /></span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm pt-2 mt-1" style={{ borderTop: '1px solid var(--neutral-600)' }}>
                        <span style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-orders-manager-total" fallback="Total" /></span>
                        <span className="font-bold text-white">{order.total} <EditableContent contentKey="shop-orders-manager-kr" fallback="kr." /></span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-orders-manager-levering" fallback="LEVERING" /></p>
                      <p className="text-sm" style={{ color: 'var(--neutral-300)' }}>
                        {order.delivery_type === 'pickup' ? '📦 Afhentning' : '🚚 Levering'}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--neutral-400)' }}>{order.delivery_address}</p>
                      {order.customer_phone && (
                        <p className="text-sm mt-1" style={{ color: 'var(--neutral-400)' }}>📞 {order.customer_phone}</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-orders-manager-betaling" fallback="BETALING" /></p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: 'var(--neutral-500)' }}><EditableContent contentKey="shop-orders-manager-metode" fallback="Metode" /></span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: order.payment_method === 'online' ? '#3b82f622' : order.payment_method === 'delivery' ? '#f59e0b22' : 'var(--neutral-700)',
                              color: order.payment_method === 'online' ? '#60a5fa' : order.payment_method === 'delivery' ? '#fbbf24' : 'var(--neutral-400)',
                            }}
                          >
                            {order.payment_method === 'online' ? '💳 Online (Kort/MobilePay)' : order.payment_method === 'delivery' ? '🚚 Betal ved levering' : '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: 'var(--neutral-500)' }}><EditableContent contentKey="shop-orders-manager-status" fallback="Status" /></span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: order.payment_status === 'paid' ? '#22c55e22' : order.payment_status === 'failed' ? '#ef444422' : '#f59e0b22',
                              color: order.payment_status === 'paid' ? '#4ade80' : order.payment_status === 'failed' ? '#f87171' : '#fbbf24',
                            }}
                          >
                            {order.payment_status === 'paid' ? '✓ Betalt' : order.payment_status === 'failed' ? '✗ Fejlet' : order.payment_status === 'pending' ? '⏳ Afventer' : '—'}
                          </span>
                        </div>
                        {order.payment_intent_id && (
                          <p className="text-xs font-mono truncate" style={{ color: 'var(--neutral-500)' }}>
                            <EditableContent contentKey="shop-orders-manager-id" fallback="ID:" /> {order.payment_intent_id}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status update */}
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    <span className="text-xs" style={{ color: 'var(--neutral-400)' }}><EditableContent contentKey="shop-orders-manager-opdater-status" fallback="Opdater status:" /></span>
                    {ALL_STATUSES.map(s => (
                      <button
                        key={s}
                        disabled={order.status === s || updatingId === order.id}
                        onClick={() => updateStatus(order.id, s)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                        style={{
                          background: order.status === s ? STATUS_COLORS[s] : 'var(--neutral-600)',
                          color: order.status === s ? 'white' : 'var(--neutral-300)',
                          opacity: updatingId === order.id ? 0.6 : 1,
                        }}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShopOrdersManager;
