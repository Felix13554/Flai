import React, { useState } from 'react';
import { Tag, Check, X, Loader } from 'lucide-react';
import { supabase } from '../utils/supabase';
import toast from 'react-hot-toast';

interface DiscountCodeInputProps {
  orderAmount: number;
  onDiscountApplied: (discountAmount: number, discountCodeId: string) => void;
  onDiscountRemoved: () => void;
  appliedDiscount?: {
    amount: number;
    codeId: string;
    code: string;
  } | null;
  guestEmail?: string;
}

const DiscountCodeInput: React.FC<DiscountCodeInputProps> = ({
  orderAmount,
  onDiscountApplied,
  onDiscountRemoved,
  appliedDiscount,
  guestEmail
}) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const validateDiscountCode = async () => {
    if (!code.trim()) {
      toast.error('Indtast venligst en rabatkode');
      return;
    }

    setLoading(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const userIdParam = user?.id || null;

      const { data, error } = await supabase.rpc('validate_discount_code', {
        code_text: code.trim().toUpperCase(),
        order_amount: orderAmount,
        user_id_param: userIdParam
      });

      if (error) throw error;

      const result = data[0];
      if (result.is_valid) {
        onDiscountApplied(result.discount_amount, result.discount_code_id);
        toast.success(`Rabatkode anvendt! Du sparer ${result.discount_amount} kr`);
        setCode('');
      } else {
        toast.error(result.error_message);
      }
    } catch (err: any) {
      console.error('Error validating discount code:', err);
      toast.error('Kunne ikke validere rabatkode');
    } finally {
      setLoading(false);
    }
  };

  const removeDiscount = () => {
    onDiscountRemoved();
    toast.success('Rabatkode fjernet');
  };

  if (appliedDiscount) {
    return (
      <div className="bg-success/10 border border-success rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Check size={20} className="text-success mr-2" />
            <div>
              <p className="font-medium text-success">Rabatkode anvendt</p>
              <p className="text-sm text-success/80">
                Du sparer {appliedDiscount.amount} kr
              </p>
            </div>
          </div>
          <button
            onClick={removeDiscount}
            className="p-1 text-success hover:text-success/80 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center">
        <Tag size={18} className="text-neutral-400 mr-2" />
        <span className="text-sm font-medium text-neutral-300">Har du en rabatkode?</span>
      </div>
      
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Indtast rabatkode"
            className="form-input"
            onKeyDown={(e) => e.key === 'Enter' && validateDiscountCode()}
            disabled={loading}
          />
        </div>
        <button
          onClick={validateDiscountCode}
          disabled={loading || !code.trim()}
          className="btn-secondary flex items-center justify-center min-w-[100px]"
        >
          {loading ? (
            <Loader size={16} className="animate-spin" />
          ) : (
            'Anvend'
          )}
        </button>
      </div>
    </div>
  );
};

export default DiscountCodeInput;