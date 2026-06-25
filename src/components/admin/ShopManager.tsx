import EditableContent from '../EditableContent';
import React, { useState } from 'react';
import { ShoppingBag, ClipboardList } from 'lucide-react';
import ShopOrdersManager from './ShopOrdersManager';
import ShopProductsManager from './ShopProductsManager';

type Tab = 'orders' | 'products';

const ShopManager: React.FC = () => {
  const [tab, setTab] = useState<Tab>('orders');

  return (
    <div>
      {/* Sub-tabs */}
      <div
        className="flex gap-1 rounded-xl p-1 mb-6 inline-flex"
        style={{ background: 'var(--neutral-700)' }}
      >
        <button
          onClick={() => setTab('orders')}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: tab === 'orders' ? 'var(--primary)' : 'transparent',
            color: tab === 'orders' ? 'white' : 'var(--neutral-400)',
          }}
        >
          <ClipboardList size={15} />
          <EditableContent contentKey="shop-manager-ordrer" fallback="Ordrer" />
        </button>
        <button
          onClick={() => setTab('products')}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: tab === 'products' ? 'var(--primary)' : 'transparent',
            color: tab === 'products' ? 'white' : 'var(--neutral-400)',
          }}
        >
          <ShoppingBag size={15} />
          <EditableContent contentKey="shop-manager-produkter" fallback="Produkter" />
        </button>
      </div>

      {tab === 'orders' ? <ShopOrdersManager /> : <ShopProductsManager />}
    </div>
  );
};

export default ShopManager;
