import React, { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import {
  ShoppingCart,
  X,
  Plus,
  Minus,
  ChevronDown,
  ArrowRight,
  CreditCard,
  Truck,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useData, ShopProduct } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import EditableContent from './EditableContent';
import MerchStripePaymentForm from './MerchStripePaymentForm';

// ─── Shared Helpers ────────────────────────────────────────────────────────────
export const stripHex = (colorStr: string): string => colorStr.replace(/\s*\(#[0-9a-fA-F]{3,6}\)$/, '').trim();

export const extractHex = (colorStr: string): string | null => {
  const m = colorStr.match(/\(#([0-9a-fA-F]{3,6})\)$/);
  return m ? `#${m[1]}` : null;
};

export const getCartImage = (product: ShopProduct, colorLabel?: string): string => {
  const images = product.images ||[];
  if (colorLabel) {
    const tagged = images.find(u => u.startsWith(`${colorLabel}::`));
    if (tagged) return tagged.slice(colorLabel.length + 2);
  }
  const untagged = images.find(u => !u.includes('::'));
  if (untagged) return untagged;
  return product.image_url || '';
};

export const buildImagesForColor = (product: ShopProduct, colorKey: string): string[] => {
  const all = product.images ||[];
  if (colorKey !== '') {
    const tagged = all
      .filter(u => u.startsWith(`${colorKey}::`))
      .map(u => u.slice(colorKey.length + 2));
    if (tagged.length > 0) return tagged;
    return product.image_url ? [product.image_url] :[];
  }
  const seen = new Set<string>();
  const result: string[] =[];
  if (product.image_url) {
    seen.add(product.image_url);
    result.push(product.image_url);
  }
  for (const u of all) {
    if (!u.includes('::') && !seen.has(u)) {
      seen.add(u);
      result.push(u);
    }
  }
  return result;
};

// ─── Shared Types ──────────────────────────────────────────────────────────────
export type PaymentMethod = 'delivery' | 'online';

export interface OrderForm {
  name: string;
  email: string;
  address: string;
  phone: string;
}

export interface CartItem {
  product: ShopProduct;
  quantity: number;
  size?: string;
  color?: string;
}

// ─── Sub-Components ────────────────────────────────────────────────────────────
export const ColorCircle: React.FC<{
  color: string;
  active: boolean;
  onClick: () => void;
}> = ({ color, active, onClick }) => {
  const hex = extractHex(color);
  const label = stripHex(color);
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="transition-all"
      style={{
        width: '32px', height: '32px', borderRadius: '50%',
        background: hex ?? 'var(--neutral-500)',
        border: active ? `3px solid white` : `2px solid rgba(255,255,255,0.2)`,
        outline: active ? `2px solid ${hex ?? 'var(--primary)'}` : 'none',
        outlineOffset: '2px', cursor: 'pointer', flexShrink: 0,
        boxShadow: active ? `0 0 0 1px ${hex ?? 'var(--primary)'}` : 'none', padding: 0,
      }}
    />
  );
};

const PaymentToggle: React.FC<{
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
}> = ({ value, onChange }) => (
  <div className="space-y-3">
    <p className="text-sm font-medium text-neutral-300"><EditableContent contentKey="merch-cart-betalingsmetode" fallback="Betalingsmetode" /></p>
    <div className="space-y-3">
      <div
        onClick={() => onChange('online')}
        className={`flex items-center space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${
          value === 'online' ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/50'
        }`}
      >
        <input type="radio" checked={value === 'online'} onChange={() => onChange('online')} className="mt-0.5" />
        <div className="flex-1 flex items-center justify-between">
          <div>
            <label className="font-medium cursor-pointer text-white"><EditableContent contentKey="merch-cart-betal-nu" fallback="Betal Nu" /></label>
            <p className="text-neutral-400 text-sm mt-0.5"><EditableContent contentKey="merch-cart-kort-eller-mobilepay-via-sikker" fallback="Kort eller MobilePay via sikker forbindelse." /></p>
          </div>
          <CreditCard size={20} className={value === 'online' ? 'text-blue-400' : 'text-neutral-500'} />
        </div>
      </div>
      <div
        onClick={() => onChange('delivery')}
        className={`flex items-center space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${
          value === 'delivery' ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 bg-neutral-800/50'
        }`}
      >
        <input type="radio" checked={value === 'delivery'} onChange={() => onChange('delivery')} className="mt-0.5" />
        <div className="flex-1 flex items-center justify-between">
          <div>
            <label className="font-medium cursor-pointer text-white"><EditableContent contentKey="merch-cart-betal-ved-levering" fallback="Betal ved levering" /></label>
            <p className="text-neutral-400 text-sm mt-0.5"><EditableContent contentKey="merch-cart-vi-leverer-personligt-betal-naar" fallback="Vi leverer personligt, betal når du modtager." /></p>
          </div>
          <Truck size={20} className={value === 'delivery' ? 'text-blue-400' : 'text-neutral-500'} />
        </div>
      </div>
    </div>
  </div>
);

// ─── Order Logic ───────────────────────────────────────────────────────────────
async function submitDeliveryOrder(form: OrderForm, cart: CartItem[], cartTotal: number, userId: string | null | undefined) {
  const items = cart.map(i => ({
    product_id: i.product.id, product_name: i.product.name, quantity: i.quantity,
    size: i.size || null, color: i.color || null, price: i.product.price,
  }));
  const { data: order, error } = await supabase.from('shop_orders').insert({
    customer_name: form.name, customer_email: form.email, delivery_type: 'delivery',
    delivery_address: form.address, customer_phone: form.phone || null, items,
    total: cartTotal, status: 'pending', payment_method: 'delivery', payment_status: 'pending', user_id: userId || null,
  }).select().single();
  if (error) throw error;
  fetch('https://pbqeljimuerxatrtmgsn.supabase.co/functions/v1/notify-shop-order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id }),
  }).catch(() => {});
  return order;
}

async function submitOnlineOrder(form: OrderForm, cart: CartItem[], cartTotal: number, userId: string | null | undefined, paymentIntentId: string) {
  const items = cart.map(i => ({
    product_id: i.product.id, product_name: i.product.name, quantity: i.quantity,
    size: i.size || null, color: i.color || null, price: i.product.price,
  }));
  const { data: order, error } = await supabase.from('shop_orders').insert({
    customer_name: form.name, customer_email: form.email, delivery_type: 'delivery',
    delivery_address: form.address, customer_phone: form.phone || null, items,
    total: cartTotal, status: 'paid', payment_method: 'online', payment_status: 'paid', payment_intent_id: paymentIntentId, user_id: userId || null,
  }).select().single();
  if (error) throw error;
  fetch('https://pbqeljimuerxatrtmgsn.supabase.co/functions/v1/notify-shop-order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id }),
  }).catch(() => {});
  return order;
}

async function createPaymentIntentForCart(cartTotal: number, form: OrderForm): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { amount: Math.round(cartTotal * 100), currency: 'dkk', metadata: { customer_name: form.name, customer_email: form.email } },
  });
  if (error) throw error;
  return { clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId };
}

const ORDER_FIELDS: [keyof OrderForm, string, string, string][] = [
  ['email', 'Email *', 'email', 'din@email.dk'],['name', 'Navn *', 'text', 'Dit fulde navn'],['address', 'Adresse *', 'text', 'Vejnavn 1, 1234 By'],['phone', 'Telefon (valgfrit)', 'tel', '+45 12 34 56 78'],
];

// ─── Checkout Sub-Components ───────────────────────────────────────────────────
const OrderItemsList: React.FC<any> = ({ cart, removeFromCart, updateCartQuantity, cartTotal, krKey, totalKey }) => (
  <div className="bg-neutral-800 rounded-xl shadow-md border border-neutral-700 overflow-hidden mb-6">
    <div className="px-4 py-3 bg-neutral-800 border-b border-neutral-700">
      <p className="text-xs font-semibold text-neutral-400"><EditableContent contentKey="merchandise-page-produktoversigt" fallback="PRODUKTOVERSIGT" /></p>
    </div>
    {cart.map((item: any, idx: number) => (
      <div key={`${item.product.id}-${item.size}-${item.color}-${idx}`} className={`flex items-center gap-3 px-4 py-3 bg-neutral-800 ${idx > 0 ? 'border-t border-neutral-700' : ''}`}>
        {(getCartImage(item.product, item.color) || item.product.image_url) && (
          <img src={getCartImage(item.product, item.color) || item.product.image_url} alt={item.product.name} className="w-12 h-12 rounded-lg object-contain flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">{item.product.name}</p>
          <p className="text-xs mt-0.5 text-neutral-400">
            {[item.size, item.color].filter(Boolean).join(' · ')}
            {item.quantity > 1 ? ` × ${item.quantity}` : ''}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <button onClick={() => updateCartQuantity(item.product.id, item.size, item.color, item.quantity - 1)} className="w-5 h-5 rounded flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 transition-colors"><Minus size={10} className="text-white" /></button>
            <span className="text-xs text-white w-4 text-center">{item.quantity}</span>
            <button onClick={() => updateCartQuantity(item.product.id, item.size, item.color, item.quantity + 1)} className="w-5 h-5 rounded flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 transition-colors"><Plus size={10} className="text-white" /></button>
            <button onClick={() => removeFromCart(item.product.id, item.size, item.color)} className="ml-1 p-0.5 rounded text-red-500 hover:text-red-400 transition-colors"><X size={12} /></button>
          </div>
        </div>
        <span className="text-sm font-bold text-white flex-shrink-0">{item.product.price * item.quantity} <EditableContent contentKey={krKey} fallback="kr." /></span>
      </div>
    ))}
    <div className="flex justify-between px-4 py-3 bg-neutral-700/50">
      <span className="font-bold text-white text-sm"><EditableContent contentKey={totalKey} fallback="Total" /></span>
      <span className="font-bold text-white">{cartTotal} <EditableContent contentKey={krKey} fallback="kr." /></span>
    </div>
  </div>
);

const OrderSuccess: React.FC<any> = ({ email, onClose, takKey, modtagetKey, bekraeftelseKey, lukKey }) => (
  <div className="flex flex-col items-center justify-center h-full text-center px-4 py-16">
    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: 'var(--success)22' }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
    <h3 className="text-2xl font-bold text-white mb-3"><EditableContent contentKey={takKey} fallback="Tak for din ordre! 🎉" /></h3>
    <p className="text-base mb-1 text-neutral-300"><EditableContent contentKey={modtagetKey} fallback="Din ordre er modtaget og vi kontakter dig snart." /></p>
    <p className="text-sm mb-8 text-neutral-500"><EditableContent contentKey={bekraeftelseKey} fallback="Bekræftelse sendes til" /> {email || 'din email'}</p>
    <button onClick={onClose} className="btn-primary px-8 py-3"><EditableContent contentKey={lukKey} fallback="Luk" /></button>
  </div>
);

const CheckoutFormBody: React.FC<any> = ({ cart, cartTotal, removeFromCart, updateCartQuantity, form, setForm, paymentMethod, setPaymentMethod, onDeliverySubmit, submitting, userId, onSuccess, krKey, totalKey }) => {
  const [paymentLoading, setPaymentLoading] = useState(false);
  const[paymentError, setPaymentError] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null);
  const detailsValid = form.name.trim() !== '' && form.email.trim() !== '' && form.address.trim() !== '';

  useEffect(() => {
    const initializeStripe = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-stripe-config`, { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` } });
        const data = await response.json();
        if (data.error) return setPaymentError('Kunne ikke forbinde til betalingsserveren.');
        setStripePromise(loadStripe(data.publishableKey));
      } catch (error) { setPaymentError('Kunne ikke forbinde til betalingsserveren.'); }
    };
    if (paymentMethod === 'online' && !stripePromise) initializeStripe();
  }, [paymentMethod, stripePromise]);

  const handleOnlinePaymentComplete = async (paymentIntentId: string) => {
    if (!detailsValid) throw new Error('Udfyld alle påkrævede felter');
    await submitOnlineOrder(form, cart, cartTotal, userId, paymentIntentId);
  };

  return (
    <div className="space-y-6">
      <OrderItemsList cart={cart} removeFromCart={removeFromCart} updateCartQuantity={updateCartQuantity} cartTotal={cartTotal} krKey={krKey} totalKey={totalKey} />
      <div className="bg-neutral-800 rounded-xl shadow-md p-5 border border-neutral-700">
        <h2 className="text-xl font-semibold text-white mb-4"><EditableContent contentKey="merchandise-page-dine-oplysninger-2" fallback="Dine oplysninger" /></h2>
        <div className="space-y-4">
          {ORDER_FIELDS.map(([field, label, type, placeholder]) => (
            <div key={field}>
              <label className="text-sm font-medium text-neutral-300 block mb-2">{label}</label>
              <input type={type} className="w-full px-4 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary transition-all" value={form[field as keyof OrderForm]} onChange={e => setForm((f: any) => ({ ...f, [field]: e.target.value }))} placeholder={placeholder} />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-neutral-800 rounded-xl shadow-md p-5 border border-neutral-700">
        <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} />
        {paymentMethod === 'online' && (
          <div className="mt-6 border-t border-neutral-700 pt-6">
            {detailsValid ? (
              <div>
                {paymentError && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{paymentError}</div>}
                {stripePromise ? (
                  <Elements stripe={stripePromise} options={{ mode: 'payment', amount: Math.max(100, Math.round(cartTotal * 100)), currency: 'dkk', locale: 'da', appearance: { theme: 'night', variables: { colorPrimary: '#3b82f6', colorBackground: '#262626', colorText: '#ffffff', colorDanger: '#ef4444', fontFamily: 'system-ui, -apple-system, sans-serif', borderRadius: '8px' } } }}>
                    <MerchStripePaymentForm amount={cartTotal} customerName={form.name} customerEmail={form.email} onSuccess={onSuccess} createPaymentIntent={() => createPaymentIntentForCart(cartTotal, form)} onPaymentComplete={handleOnlinePaymentComplete} loading={paymentLoading} setLoading={setPaymentLoading} setError={setPaymentError} />
                  </Elements>
                ) : (
                  <div className="text-center p-6 text-neutral-400"><div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-neutral-300 mb-2"></div><p className="text-sm"><EditableContent contentKey="merch-cart-indlaeser-betalingssystem" fallback="Indlæser betalingssystem..." /></p></div>
                )}
              </div>
            ) : <div className="p-4 bg-neutral-700/50 border border-neutral-600 rounded-lg text-sm text-center text-neutral-400"><EditableContent contentKey="merch-cart-udfyld-navn-email-og-adresse" fallback="Udfyld navn, email og adresse ovenfor for at bekræfte bestillingen." /></div>}
          </div>
        )}
      </div>
      {paymentMethod === 'delivery' && (
        <button onClick={onDeliverySubmit} disabled={submitting} className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2 rounded-xl">
          {submitting ? <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div><span><EditableContent contentKey="merch-cart-behandler" fallback="Behandler..." /></span></> : <><ShoppingCart size={18} /><span><EditableContent contentKey="merch-cart-afgiv-bestilling" fallback="Afgiv bestilling" /></span></>}
        </button>
      )}
    </div>
  );
};

// ─── Exported UI Components ────────────────────────────────────────────────────
export const CartSidebar: React.FC = () => {
  const { cart, cartOpen, setCartOpen, removeFromCart, updateCartQuantity, cartTotal, clearCart } = useData();
  const { user } = useAuth();
  const [form, setForm] = useState<OrderForm>({ name: '', email: '', address: '', phone: '' });
  const[submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');

  useEffect(() => {
    if (user) setForm(f => ({ ...f, email: user.email || '', name: user.user_metadata?.full_name || user.user_metadata?.name || '' }));
  },[user]);

  useEffect(() => { if (!cartOpen) { setSuccess(false); setPaymentMethod('online'); } }, [cartOpen]);

  const handleDeliverySubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.address.trim()) { toast.error('Udfyld alle påkrævede felter'); return; }
    setSubmitting(true);
    try {
      await submitDeliveryOrder(form, cart, cartTotal, user?.id);
      setSuccess(true); clearCart(); setForm(f => ({ name: f.name, email: f.email, address: '', phone: '' }));
    } catch (err) { toast.error('Noget gik galt. Prøv igen.'); } finally { setSubmitting(false); }
  };

  if (!cartOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 transition-opacity bg-black/60" onClick={() => setCartOpen(false)} />
      <div className="fixed right-0 top-0 h-full z-50 flex flex-col overflow-hidden bg-neutral-900 border-l border-neutral-700 shadow-2xl transition-transform w-[min(520px,100vw)]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-700 bg-neutral-800/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><ShoppingCart size={20} className="text-primary" />{success ? 'Ordre modtaget' : 'Bestilling'}</h2>
          <button onClick={() => setCartOpen(false)} className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {success ? <OrderSuccess email={form.email} onClose={() => setCartOpen(false)} takKey="merchandise-page-tak-for-din-ordre-2" modtagetKey="merchandise-page-din-ordre-er-modtaget-og-2" bekraeftelseKey="merchandise-page-bekraeftelse-sendes-til-2" lukKey="merchandise-page-luk-2" />
          : cart.length === 0 ? <div className="text-center py-16 text-neutral-500"><ShoppingCart size={40} className="mx-auto mb-4 opacity-40" /><p><EditableContent contentKey="merchandise-page-kurven-er-tom" fallback="Kurven er tom" /></p></div>
          : <CheckoutFormBody cart={cart} cartTotal={cartTotal} removeFromCart={removeFromCart} updateCartQuantity={updateCartQuantity} form={form} setForm={setForm} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} onDeliverySubmit={handleDeliverySubmit} submitting={submitting} userId={user?.id} onSuccess={() => { setSuccess(true); clearCart(); setForm(f => ({ ...f, address: '', phone: '' })); }} krKey="merchandise-page-kr-6" totalKey="merchandise-page-total-3" />}
        </div>
      </div>
    </>
  );
};

export const CheckoutModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { cart, cartTotal, removeFromCart, updateCartQuantity, clearCart } = useData();
  const { user } = useAuth();
  const [form, setForm] = useState<OrderForm>({ name: '', email: '', address: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const[paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');

  useEffect(() => {
    if (user) setForm(f => ({ ...f, email: user.email || '', name: user.user_metadata?.full_name || user.user_metadata?.name || '' }));
  }, [user]);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; },[]);

  const handleDeliverySubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.address.trim()) { toast.error('Udfyld alle påkrævede felter'); return; }
    setSubmitting(true);
    try {
      await submitDeliveryOrder(form, cart, cartTotal, user?.id);
      setSuccess(true); clearCart(); setForm(f => ({ name: f.name, email: f.email, address: '', phone: '' }));
    } catch (err) { toast.error('Noget gik galt. Prøv igen.'); } finally { setSubmitting(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={!success ? onClose : undefined} />
      <div className="fixed left-0 right-0 bottom-0 z-50 flex flex-col rounded-t-2xl overflow-hidden bg-neutral-900 border border-neutral-700 shadow-2xl max-h-[92vh] animate-[slideUp_0.3s_ease-out]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-700 bg-neutral-800/50 flex-shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><ShoppingCart size={20} className="text-primary" />{success ? 'Ordre modtaget' : 'Gennemfør bestilling'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {success ? <OrderSuccess email={form.email} onClose={onClose} takKey="merchandise-page-tak-for-din-ordre" modtagetKey="merchandise-page-din-ordre-er-modtaget-og" bekraeftelseKey="merchandise-page-bekraeftelse-sendes-til" lukKey="merchandise-page-luk" />
          : <div className="max-w-lg mx-auto"><CheckoutFormBody cart={cart} cartTotal={cartTotal} removeFromCart={removeFromCart} updateCartQuantity={updateCartQuantity} form={form} setForm={setForm} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} onDeliverySubmit={handleDeliverySubmit} submitting={submitting} userId={user?.id} onSuccess={() => { setSuccess(true); clearCart(); setForm(f => ({ ...f, address: '', phone: '' })); }} krKey="merchandise-page-kr-4" totalKey="merchandise-page-total-2" /></div>}
        </div>
      </div>
    </>
  );
};

export const BottomCartSection: React.FC<{
  sectionRef: React.RefObject<HTMLElement>;
  checkoutOpen?: boolean;
  onCheckoutChange?: (open: boolean) => void;
}> = ({ sectionRef, checkoutOpen, onCheckoutChange }) => {
  const { cart, cartTotal, cartItemCount, removeFromCart, updateCartQuantity } = useData();
  const [showCheckout, setShowCheckout] = useState(checkoutOpen ?? false);

  // Sync with external state
  useEffect(() => {
    if (checkoutOpen !== undefined) setShowCheckout(checkoutOpen);
  }, [checkoutOpen]);

  const handleSetShowCheckout = (val: boolean) => {
    setShowCheckout(val);
    onCheckoutChange?.(val);
  };

  return (
    <section ref={sectionRef} className="py-16 border-t bg-neutral-900 border-neutral-700">
      <div className="container max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <ShoppingCart size={22} className="text-primary" /> <EditableContent contentKey="merchandise-page-din-bestilling" fallback="Din bestilling" />
          {cartItemCount > 0 && <span className="text-sm font-normal px-2 py-0.5 rounded-full ml-1 bg-primary text-white">{cartItemCount}</span>}
        </h2>
        <div className="rounded-2xl overflow-hidden mb-5 border border-neutral-700 shadow-md">
          {cartItemCount === 0 ? (
            <div className="p-8 text-center bg-neutral-800">
              <ShoppingCart size={32} className="mx-auto mb-2 opacity-30 text-white" />
              <p className="text-sm text-neutral-500"><EditableContent contentKey="merchandise-page-ingen-produkter-i-kurven-endnu" fallback="Ingen produkter i kurven endnu" /></p>
            </div>
          ) : (
            <>
              {cart.map((item, idx) => (
                <div key={`${item.product.id}-${item.size}-${item.color}-${idx}`} className={`flex items-center gap-4 p-4 bg-neutral-800 ${idx < cart.length - 1 ? 'border-b border-neutral-700' : ''}`}>
                  {(getCartImage(item.product, item.color) || item.product.image_url) && <img src={getCartImage(item.product, item.color) || item.product.image_url} alt={item.product.name} className="w-14 h-14 rounded-xl object-contain flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-white">{item.product.name}</p>
                    {(item.size || item.color) && <p className="text-sm mt-0.5 text-neutral-400">{[item.size, item.color].filter(Boolean).join(' · ')}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <button onClick={() => updateCartQuantity(item.product.id, item.size, item.color, item.quantity - 1)} className="w-5 h-5 rounded flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 transition-colors"><Minus size={10} className="text-white" /></button>
                      <span className="text-xs text-white">{item.quantity}</span>
                      <button onClick={() => updateCartQuantity(item.product.id, item.size, item.color, item.quantity + 1)} className="w-5 h-5 rounded flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 transition-colors"><Plus size={10} className="text-white" /></button>
                      <button onClick={() => removeFromCart(item.product.id, item.size, item.color)} className="ml-1 p-0.5 rounded text-red-500 hover:text-red-400 transition-colors"><X size={12} /></button>
                    </div>
                  </div>
                  <span className="text-base font-bold text-white flex-shrink-0">{item.product.price * item.quantity} <EditableContent contentKey="merchandise-page-kr-2" fallback="kr." /></span>
                </div>
              ))}
              <div className="flex justify-between items-center p-4 bg-neutral-700/50">
                <span className="text-base font-bold text-white"><EditableContent contentKey="merchandise-page-total" fallback="Total" /></span>
                <span className="text-xl font-bold text-white">{cartTotal} <EditableContent contentKey="merchandise-page-kr" fallback="kr." /></span>
              </div>
            </>
          )}
        </div>
        {cartItemCount > 0 && (
          <button onClick={() => handleSetShowCheckout(true)} className="btn-primary w-full py-4 text-base font-semibold flex items-center justify-center gap-2 rounded-xl">
            <EditableContent contentKey="merchandise-page-forsaet-til-bestilling" fallback="Forsæt til bestilling" /><ArrowRight size={18} />
          </button>
        )}
      </div>
      {showCheckout && <CheckoutModal onClose={() => handleSetShowCheckout(false)} />}
    </section>
  );
};

export const ScrollHintArrow: React.FC<{ cartSectionRef: React.RefObject<HTMLElement> }> = ({ cartSectionRef }) => {
  const [visible, setVisible] = useState(false);
  const { cartItemCount } = useData();

  useEffect(() => {
    if (cartItemCount === 0) { setVisible(false); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0.15 });
    if (cartSectionRef.current) observer.observe(cartSectionRef.current);
    return () => { if (cartSectionRef.current) observer.unobserve(cartSectionRef.current); };
  }, [cartItemCount, cartSectionRef]);

  return (
    <button
      onClick={() => cartSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
      className={`fixed bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-white text-sm font-semibold shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all duration-350 z-30 ${visible ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-5'}`}
    >
      <EditableContent contentKey="merchandise-page-scroll-ned-for-at-gennemfoere" fallback="Scroll ned for at gennemføre ordre" />
      <ChevronDown size={15} className="animate-[bounce_1.4s_ease-in-out_infinite]" />
    </button>
  );
};
