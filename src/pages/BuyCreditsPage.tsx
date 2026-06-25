import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Coins, Plus, Minus } from 'lucide-react';
import EditableContent from '../components/EditableContent';
import SEO from '../components/SEO';
import toast from 'react-hot-toast';

const BuyCreditsPage: React.FC = () => {
  const { user, credits } = useAuth();
  const navigate = useNavigate();
  const [customCreditsAmount, setCustomCreditsAmount] = useState<number>(100);
  const [loading, setLoading] = useState(false);

  // Since 1 credit = 1 DKK, the price equals the credit amount
  const customPrice = customCreditsAmount;

  const handleCreditsChange = (value: number) => {
    if (value >= 1 && value <= 10000) {
      setCustomCreditsAmount(value);
    }
  };

  const handleBuyCredits = async () => {
    if (!user) {
      toast.error('Du skal være logget ind for at købe credits');
      navigate('/login');
      return;
    }

    if (customCreditsAmount < 1) {
      toast.error('Du skal købe mindst 1 credit');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/buy-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          credits: customCreditsAmount,
          price: customPrice,
          userId: user.id,
          email: user.email,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error: any) {
      console.error('Error buying credits:', error);
      toast.error('Der opstod en fejl ved køb af credits');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-20 pb-16">
      <SEO canonical="/credits" title="Køb Credits" description="Køb credits og brug dem til at betale for Flais dronefoto- og videotjenester." />
      <div className="bg-primary/10 py-12 mb-12">
        <div className="container">
          <EditableContent
            contentKey="credits_buy_page_title"
            as="h1"
            className="text-3xl md:text-4xl font-bold text-center mb-4"
            fallback="Køb Credits"
          />
          <EditableContent
            contentKey="credits_buy_page_subtitle"
            as="p"
            className="text-center text-lg text-neutral-300 max-w-2xl mx-auto"
            fallback="Køb credits og brug dem til at betale for vores tjenester"
          />
        </div>
      </div>
      <div className="container">
        <div className="max-w-2xl mx-auto">
          {user && (
            <div className="flex justify-center mb-12">
              <div className="inline-flex items-center bg-neutral-800 rounded-lg px-6 py-3 border border-neutral-700">
                <Coins size={24} className="text-primary mr-3" />
                <span className="text-lg">
                  <EditableContent
                    contentKey="credits_profile_balance_label"
                    fallback="Credit Balance"
                  />
                  <span className="font-bold text-primary ml-2">{credits} <EditableContent contentKey="buy-credits-page-credits-3" fallback="credits" /></span>
                </span>
              </div>
            </div>
          )}

          <div className="bg-neutral-800 rounded-xl p-8 border border-neutral-700 mb-8">
            <EditableContent
              contentKey="credits_buy_custom_amount_title"
              as="h2"
              className="text-2xl font-bold mb-6 text-center"
              fallback="Vælg Antal Credits"
            />
            
            <div className="text-center mb-8">
              <div className="inline-flex items-center bg-neutral-700 rounded-lg p-2 mb-4">
                <button
                  onClick={() => handleCreditsChange(customCreditsAmount - 10)}
                  className="p-2 hover:bg-neutral-600 rounded-lg transition-colors"
                  disabled={customCreditsAmount <= 10}
                >
                  <Minus size={20} />
                </button>
                <button
                  onClick={() => handleCreditsChange(customCreditsAmount - 1)}
                  className="p-2 hover:bg-neutral-600 rounded-lg transition-colors mx-2"
                  disabled={customCreditsAmount <= 1}
                >
                  <Minus size={16} />
                </button>
                
                <div className="mx-6">
                  <input
                    type="number"
                    value={customCreditsAmount}
                    onChange={(e) => handleCreditsChange(parseInt(e.target.value) || 0)}
                    className="w-24 text-center text-2xl font-bold bg-transparent border-none outline-none text-primary"
                    min="1"
                    max="10000"
                  />
                  <div className="text-sm text-neutral-400"><EditableContent contentKey="buy-credits-page-credits-2" fallback="credits" /></div>
                </div>
                
                <button
                  onClick={() => handleCreditsChange(customCreditsAmount + 1)}
                  className="p-2 hover:bg-neutral-600 rounded-lg transition-colors mx-2"
                  disabled={customCreditsAmount >= 10000}
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => handleCreditsChange(customCreditsAmount + 10)}
                  className="p-2 hover:bg-neutral-600 rounded-lg transition-colors"
                  disabled={customCreditsAmount >= 9990}
                >
                  <Plus size={20} />
                </button>
              </div>
              
              <div className="text-3xl font-bold text-white mb-2">
                {customPrice} <EditableContent contentKey="buy-credits-page-kr" fallback="kr" />
              </div>
              <EditableContent
                contentKey="credits_buy_price_info"
                as="p"
                className="text-neutral-400"
                fallback="1 credit = 1 kr"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {[50, 100, 250, 500].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setCustomCreditsAmount(amount)}
                  className={`p-3 rounded-lg border transition-all duration-300 ${
                    customCreditsAmount === amount
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-neutral-600 hover:border-neutral-500 text-neutral-300'
                  }`}
                >
                  {amount} <EditableContent contentKey="buy-credits-page-credits" fallback="credits" />
                </button>
              ))}
            </div>

            <button
              onClick={handleBuyCredits}
              disabled={loading || customCreditsAmount < 1}
              className="w-full py-4 px-6 bg-primary text-neutral-900 rounded-lg font-medium transition-all duration-300 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
              ) : (
                <>
                  <CreditCard size={20} className="mr-2" />
                  <EditableContent
                    contentKey="credits_buy_button_text"
                    fallback={`Køb ${customCreditsAmount} Credits for ${customPrice} kr`}
                  />
                </>
              )}
            </button>
          </div>

          <div className="bg-neutral-800 rounded-xl p-8 border border-neutral-700">
            <EditableContent
              contentKey="credits_buy_how_it_works_title"
              as="h2"
              className="text-2xl font-bold mb-6 text-center"
              fallback="Sådan Fungerer Credits"
            />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-primary font-bold text-xl">1</span>
                </div>
                <EditableContent
                  contentKey="credits_buy_step_1_title"
                  as="h3"
                  className="font-semibold mb-2"
                  fallback="Køb Credits"
                />
                <EditableContent
                  contentKey="credits_buy_step_1_description"
                  as="p"
                  className="text-neutral-400"
                  fallback="Vælg det antal credits du ønsker og gennemfør betalingen sikkert via Stripe"
                />
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-primary font-bold text-xl">2</span>
                </div>
                <EditableContent
                  contentKey="credits_buy_step_2_title"
                  as="h3"
                  className="font-semibold mb-2"
                  fallback="Brug Credits"
                />
                <EditableContent
                  contentKey="credits_buy_step_2_description"
                  as="p"
                  className="text-neutral-400"
                  fallback="Brug dine credits til at betale for vores tjenester ved booking"
                />
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-primary font-bold text-xl">3</span>
                </div>
                <EditableContent
                  contentKey="credits_buy_step_3_title"
                  as="h3"
                  className="font-semibold mb-2"
                  fallback="Fleksibel Betaling"
                />
                <EditableContent
                  contentKey="credits_buy_step_3_description"
                  as="p"
                  className="text-neutral-400"
                  fallback="Brug alle dine credits eller vælg et brugerdefineret beløb"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuyCreditsPage;
