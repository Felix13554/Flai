import React, { useState } from 'react';
import { Plus, Edit, Trash2, Save, X, Tag, Percent, DollarSign, Users, Calendar } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useData } from '../../contexts/DataContext';
import EditableContent from '../EditableContent';
import toast from 'react-hot-toast';

const DiscountCodesManager: React.FC = () => {
  const { discountCodes } = useData();
  const [codes, setCodes] = useState(discountCodes);
  const [editingCode, setEditingCode] = useState<any>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState({
    code: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 10,
    min_order_amount: 0,
    max_uses: null as number | null,
    is_active: true,
    valid_until: ''
  });

  React.useEffect(() => {
    setCodes(discountCodes);
  }, [discountCodes]);

  const fetchCodes = async () => {
    try {
      const { data, error } = await supabase
        .from('discount_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCodes(data || []);
    } catch (err) {
      console.error('Error fetching discount codes:', err);
    }
  };

  const handleAddCode = async () => {
    if (!newCode.code.trim() || !newCode.description.trim() || newCode.discount_value <= 0) {
      toast.error('Udfyld alle påkrævede felter korrekt');
      return;
    }

    try {
      const codeData = {
        ...newCode,
        code: newCode.code.toUpperCase(),
        valid_until: newCode.valid_until || null
      };

      const { error } = await supabase
        .from('discount_codes')
        .insert([codeData]);

      if (error) throw error;

      toast.success('Rabatkode tilføjet');
      setNewCode({
        code: '',
        description: '',
        discount_type: 'percentage',
        discount_value: 10,
        min_order_amount: 0,
        max_uses: null,
        is_active: true,
        valid_until: ''
      });
      setShowAddForm(false);
      await fetchCodes();
    } catch (err: any) {
      console.error('Error adding discount code:', err);
      if (err.code === '23505') {
        toast.error('Denne rabatkode findes allerede');
      } else {
        toast.error('Kunne ikke tilføje rabatkode');
      }
    }
  };

  const handleUpdateCode = async () => {
    if (!editingCode || !editingCode.code.trim() || !editingCode.description.trim()) {
      toast.error('Udfyld alle påkrævede felter');
      return;
    }

    try {
      const { error } = await supabase
        .from('discount_codes')
        .update({
          code: editingCode.code.toUpperCase(),
          description: editingCode.description,
          discount_type: editingCode.discount_type,
          discount_value: editingCode.discount_value,
          min_order_amount: editingCode.min_order_amount,
          max_uses: editingCode.max_uses,
          is_active: editingCode.is_active,
          valid_until: editingCode.valid_until || null
        })
        .eq('id', editingCode.id);

      if (error) throw error;

      toast.success('Rabatkode opdateret');
      setEditingCode(null);
      await fetchCodes();
    } catch (err) {
      console.error('Error updating discount code:', err);
      toast.error('Kunne ikke opdatere rabatkode');
    }
  };

  const handleDeleteCode = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette denne rabatkode?')) return;

    try {
      const { error } = await supabase
        .from('discount_codes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Rabatkode slettet');
      await fetchCodes();
    } catch (err) {
      console.error('Error deleting discount code:', err);
      toast.error('Kunne ikke slette rabatkode');
    }
  };

  const toggleCodeStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('discount_codes')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Rabatkode ${!currentStatus ? 'aktiveret' : 'deaktiveret'}`);
      await fetchCodes();
    } catch (err) {
      console.error('Error toggling code status:', err);
      toast.error('Kunne ikke ændre rabatkode status');
    }
  };

  const isCodeExpired = (validUntil: string | null) => {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  };

  const isCodeMaxedOut = (maxUses: number | null, currentUses: number) => {
    if (maxUses === null) return false;
    return currentUses >= maxUses;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <EditableContent
          contentKey="admin-discounts-title"
          as="h2"
          className="text-2xl font-bold"
          fallback="Rabatkode Administration"
        />
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-primary flex items-center"
        >
          <Plus size={20} className="mr-2" />
          <EditableContent
            contentKey="admin-discounts-add-button"
            fallback="Tilføj Rabatkode"
          />
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-neutral-700/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-discounts-total-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Total Koder"
              />
              <p className="text-xl font-bold">{codes.length}</p>
            </div>
            <Tag className="text-primary" size={20} />
          </div>
        </div>

        <div className="bg-neutral-700/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-discounts-active-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Aktive Koder"
              />
              <p className="text-xl font-bold text-success">
                {codes.filter(c => c.is_active && !isCodeExpired(c.valid_until)).length}
              </p>
            </div>
            <Calendar className="text-success" size={20} />
          </div>
        </div>

        <div className="bg-neutral-700/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-discounts-used-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Total Anvendelser"
              />
              <p className="text-xl font-bold">
                {codes.reduce((sum, c) => sum + c.current_uses, 0)}
              </p>
            </div>
            <Users className="text-primary" size={20} />
          </div>
        </div>

        <div className="bg-neutral-700/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-discounts-expired-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Udløbne Koder"
              />
              <p className="text-xl font-bold text-error">
                {codes.filter(c => isCodeExpired(c.valid_until)).length}
              </p>
            </div>
            <X className="text-error" size={20} />
          </div>
        </div>
      </div>

      {/* Add Code Form */}
      {showAddForm && (
        <div className="bg-neutral-700/20 rounded-lg p-6">
          <EditableContent
            contentKey="admin-discounts-add-form-title"
            as="h3"
            className="text-xl font-semibold mb-4"
            fallback="Tilføj Ny Rabatkode"
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <EditableContent
                  contentKey="admin-discounts-code-label"
                  as="label"
                  className="form-label"
                  fallback="Rabatkode"
                />
                <input
                  type="text"
                  value={newCode.code}
                  onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                  className="form-input"
                  placeholder="F.eks. WELCOME10"
                />
              </div>
              <div>
                <EditableContent
                  contentKey="admin-discounts-type-label"
                  as="label"
                  className="form-label"
                  fallback="Rabat Type"
                />
                <select
                  value={newCode.discount_type}
                  onChange={(e) => setNewCode({ ...newCode, discount_type: e.target.value as 'percentage' | 'fixed' })}
                  className="form-input"
                >
                  <option value="percentage">Procent</option>
                  <option value="fixed">Fast beløb</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <EditableContent
                  contentKey="admin-discounts-value-label"
                  as="label"
                  className="form-label"
                  fallback={`Rabat Værdi (${newCode.discount_type === 'percentage' ? '%' : 'DKK'})`}
                />
                <input
                  type="number"
                  value={newCode.discount_value}
                  onChange={(e) => setNewCode({ ...newCode, discount_value: parseInt(e.target.value) || 0 })}
                  className="form-input"
                  min="1"
                  max={newCode.discount_type === 'percentage' ? 100 : undefined}
                />
              </div>
              <div>
                <EditableContent
                  contentKey="admin-discounts-min-amount-label"
                  as="label"
                  className="form-label"
                  fallback="Minimum Ordrebeløb (DKK)"
                />
                <input
                  type="number"
                  value={newCode.min_order_amount}
                  onChange={(e) => setNewCode({ ...newCode, min_order_amount: parseInt(e.target.value) || 0 })}
                  className="form-input"
                  min="0"
                />
              </div>
            </div>

            <div>
              <EditableContent
                contentKey="admin-discounts-description-label"
                as="label"
                className="form-label"
                fallback="Beskrivelse"
              />
              <input
                type="text"
                value={newCode.description}
                onChange={(e) => setNewCode({ ...newCode, description: e.target.value })}
                className="form-input"
                placeholder="F.eks. 10% rabat for nye kunder"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <EditableContent
                  contentKey="admin-discounts-max-uses-label"
                  as="label"
                  className="form-label"
                  fallback="Maksimale Anvendelser (valgfrit)"
                />
                <input
                  type="number"
                  value={newCode.max_uses || ''}
                  onChange={(e) => setNewCode({ ...newCode, max_uses: e.target.value ? parseInt(e.target.value) : null })}
                  className="form-input"
                  placeholder="Ubegrænset"
                  min="1"
                />
              </div>
              <div>
                <EditableContent
                  contentKey="admin-discounts-valid-until-label"
                  as="label"
                  className="form-label"
                  fallback="Udløbsdato (valgfrit)"
                />
                <input
                  type="datetime-local"
                  value={newCode.valid_until}
                  onChange={(e) => setNewCode({ ...newCode, valid_until: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="new-code-active"
                checked={newCode.is_active}
                onChange={(e) => setNewCode({ ...newCode, is_active: e.target.checked })}
                className="mr-2"
              />
              <EditableContent
                contentKey="admin-discounts-active-checkbox"
                as="label"
                htmlFor="new-code-active"
                className="text-neutral-300"
                fallback="Aktiv rabatkode"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewCode({
                    code: '',
                    description: '',
                    discount_type: 'percentage',
                    discount_value: 10,
                    min_order_amount: 0,
                    max_uses: null,
                    is_active: true,
                    valid_until: ''
                  });
                }}
                className="btn-secondary"
              >
                <EditableContent
                  contentKey="admin-discounts-cancel-button"
                  fallback="Annuller"
                />
              </button>
              <button
                onClick={handleAddCode}
                className="btn-primary"
              >
                <EditableContent
                  contentKey="admin-discounts-save-button"
                  fallback="Gem Rabatkode"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Codes List */}
      <div className="space-y-4">
        {codes.map((code) => {
          const expired = isCodeExpired(code.valid_until);
          const maxedOut = isCodeMaxedOut(code.max_uses, code.current_uses);
          const isInactive = !code.is_active || expired || maxedOut;

          return (
            <div key={code.id} className={`bg-neutral-700/20 rounded-lg p-6 ${isInactive ? 'opacity-60' : ''}`}>
              {editingCode?.id === code.id ? (
                // Edit Form
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <EditableContent
                        contentKey="admin-discounts-edit-code-label"
                        as="label"
                        className="form-label"
                        fallback="Rabatkode"
                      />
                      <input
                        type="text"
                        value={editingCode.code}
                        onChange={(e) => setEditingCode({ ...editingCode, code: e.target.value.toUpperCase() })}
                        className="form-input"
                      />
                    </div>
                    <div>
                      <EditableContent
                        contentKey="admin-discounts-edit-type-label"
                        as="label"
                        className="form-label"
                        fallback="Rabat Type"
                      />
                      <select
                        value={editingCode.discount_type}
                        onChange={(e) => setEditingCode({ ...editingCode, discount_type: e.target.value })}
                        className="form-input"
                      >
                        <option value="percentage">Procent</option>
                        <option value="fixed">Fast beløb</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <EditableContent
                        contentKey="admin-discounts-edit-value-label"
                        as="label"
                        className="form-label"
                        fallback={`Rabat Værdi (${editingCode.discount_type === 'percentage' ? '%' : 'DKK'})`}
                      />
                      <input
                        type="number"
                        value={editingCode.discount_value}
                        onChange={(e) => setEditingCode({ ...editingCode, discount_value: parseInt(e.target.value) || 0 })}
                        className="form-input"
                        min="1"
                        max={editingCode.discount_type === 'percentage' ? 100 : undefined}
                      />
                    </div>
                    <div>
                      <EditableContent
                        contentKey="admin-discounts-edit-min-amount-label"
                        as="label"
                        className="form-label"
                        fallback="Minimum Ordrebeløb (DKK)"
                      />
                      <input
                        type="number"
                        value={editingCode.min_order_amount}
                        onChange={(e) => setEditingCode({ ...editingCode, min_order_amount: parseInt(e.target.value) || 0 })}
                        className="form-input"
                        min="0"
                      />
                    </div>
                  </div>

                  <div>
                    <EditableContent
                      contentKey="admin-discounts-edit-description-label"
                      as="label"
                      className="form-label"
                      fallback="Beskrivelse"
                    />
                    <input
                      type="text"
                      value={editingCode.description}
                      onChange={(e) => setEditingCode({ ...editingCode, description: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <EditableContent
                        contentKey="admin-discounts-edit-max-uses-label"
                        as="label"
                        className="form-label"
                        fallback="Maksimale Anvendelser"
                      />
                      <input
                        type="number"
                        value={editingCode.max_uses || ''}
                        onChange={(e) => setEditingCode({ ...editingCode, max_uses: e.target.value ? parseInt(e.target.value) : null })}
                        className="form-input"
                        placeholder="Ubegrænset"
                        min="1"
                      />
                    </div>
                    <div>
                      <EditableContent
                        contentKey="admin-discounts-edit-valid-until-label"
                        as="label"
                        className="form-label"
                        fallback="Udløbsdato"
                      />
                      <input
                        type="datetime-local"
                        value={editingCode.valid_until ? new Date(editingCode.valid_until).toISOString().slice(0, 16) : ''}
                        onChange={(e) => setEditingCode({ ...editingCode, valid_until: e.target.value })}
                        className="form-input"
                      />
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id={`edit-code-active-${code.id}`}
                      checked={editingCode.is_active}
                      onChange={(e) => setEditingCode({ ...editingCode, is_active: e.target.checked })}
                      className="mr-2"
                    />
                    <EditableContent
                      contentKey="admin-discounts-edit-active-checkbox"
                      as="label"
                      htmlFor={`edit-code-active-${code.id}`}
                      className="text-neutral-300"
                      fallback="Aktiv rabatkode"
                    />
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setEditingCode(null)}
                      className="btn-secondary flex items-center"
                    >
                      <X size={16} className="mr-2" />
                      <EditableContent
                        contentKey="admin-discounts-edit-cancel-button"
                        fallback="Annuller"
                      />
                    </button>
                    <button
                      onClick={handleUpdateCode}
                      className="btn-primary flex items-center"
                    >
                      <Save size={16} className="mr-2" />
                      <EditableContent
                        contentKey="admin-discounts-edit-save-button"
                        fallback="Gem"
                      />
                    </button>
                  </div>
                </div>
              ) : (
                // Display Mode
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className={`p-3 rounded-lg ${
                      code.discount_type === 'percentage' 
                        ? 'bg-blue-500/10 text-blue-400' 
                        : 'bg-green-500/10 text-green-400'
                    }`}>
                      {code.discount_type === 'percentage' ? <Percent size={24} /> : <DollarSign size={24} />}
                    </div>
                    
                    <div>
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold font-mono">{code.code}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          isInactive
                            ? 'bg-neutral-600/20 text-neutral-400'
                            : 'bg-success/10 text-success'
                        }`}>
                          {expired ? 'Udløbet' : maxedOut ? 'Udsolgt' : !code.is_active ? 'Inaktiv' : 'Aktiv'}
                        </span>
                      </div>
                      <p className="text-neutral-300 mb-2">{code.description}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-neutral-400">
                        <div>
                          <span className="font-medium"><EditableContent contentKey="discount-codes-manager-rabat" fallback="Rabat:" /></span> {code.discount_value}{code.discount_type === 'percentage' ? '%' : ' kr'}
                        </div>
                        <div>
                          <span className="font-medium"><EditableContent contentKey="discount-codes-manager-min-beloeb" fallback="Min. beløb:" /></span> {code.min_order_amount} <EditableContent contentKey="discount-codes-manager-kr" fallback="kr" /></div>
                        <div>
                          <span className="font-medium"><EditableContent contentKey="discount-codes-manager-anvendelser" fallback="Anvendelser:" /></span> {code.current_uses}{code.max_uses ? `/${code.max_uses}` : ''}
                        </div>
                        <div>
                          <span className="font-medium"><EditableContent contentKey="discount-codes-manager-udloeber" fallback="Udløber:" /></span> {code.valid_until ? new Date(code.valid_until).toLocaleDateString('da-DK') : 'Aldrig'}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleCodeStatus(code.id, code.is_active)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        code.is_active
                          ? 'bg-warning/10 text-warning hover:bg-warning/20'
                          : 'bg-success/10 text-success hover:bg-success/20'
                      }`}
                    >
                      {code.is_active ? 'Deaktiver' : 'Aktiver'}
                    </button>
                    
                    <button
                      onClick={() => setEditingCode(code)}
                      className="p-2 text-neutral-400 hover:text-white transition-colors"
                    >
                      <Edit size={16} />
                    </button>
                    
                    <button
                      onClick={() => handleDeleteCode(code.id)}
                      className="p-2 text-neutral-400 hover:text-error transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {codes.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <Tag size={48} className="mx-auto mb-4 opacity-50" />
          <EditableContent
            contentKey="admin-discounts-no-codes"
            as="p"
            fallback="Ingen rabatkoder fundet. Tilføj den første rabatkode for at komme i gang."
          />
        </div>
      )}
    </div>
  );
};

export default DiscountCodesManager;