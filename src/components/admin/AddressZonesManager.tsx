import React, { useState } from 'react';
import { Plus, Edit, Trash2, Save, X, MapPin, Circle } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useData } from '../../contexts/DataContext';
import EditableContent from '../EditableContent';
import toast from 'react-hot-toast';

const AddressZonesManager: React.FC = () => {
  const { addressZones, refreshAddressZones } = useData();
  const [editingZone, setEditingZone] = useState<any>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newZone, setNewZone] = useState({
    name: '',
    center_address: '',
    radius_km: 10,
    is_active: true
  });

  const handleAddZone = async () => {
    if (!newZone.name.trim() || !newZone.center_address.trim() || newZone.radius_km <= 0) {
      toast.error('Udfyld alle felter korrekt');
      return;
    }

    try {
      const { error } = await supabase
        .from('address_zones')
        .insert([newZone]);

      if (error) throw error;

      toast.success('Adressezone tilføjet');
      setNewZone({ name: '', center_address: '', radius_km: 10, is_active: true });
      setShowAddForm(false);
      await refreshAddressZones();
    } catch (err) {
      console.error('Error adding zone:', err);
      toast.error('Kunne ikke tilføje zone');
    }
  };

  const handleUpdateZone = async () => {
    if (!editingZone || !editingZone.name.trim() || !editingZone.center_address.trim()) {
      toast.error('Udfyld alle påkrævede felter');
      return;
    }

    try {
      const { error } = await supabase
        .from('address_zones')
        .update({
          name: editingZone.name,
          center_address: editingZone.center_address,
          radius_km: editingZone.radius_km,
          is_active: editingZone.is_active
        })
        .eq('id', editingZone.id);

      if (error) throw error;

      toast.success('Adressezone opdateret');
      setEditingZone(null);
      await refreshAddressZones();
    } catch (err) {
      console.error('Error updating zone:', err);
      toast.error('Kunne ikke opdatere zone');
    }
  };

  const handleDeleteZone = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette denne zone?')) return;

    try {
      const { error } = await supabase
        .from('address_zones')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Adressezone slettet');
      await refreshAddressZones();
    } catch (err) {
      console.error('Error deleting zone:', err);
      toast.error('Kunne ikke slette zone');
    }
  };

  const toggleZoneStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('address_zones')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Zone ${!currentStatus ? 'aktiveret' : 'deaktiveret'}`);
      await refreshAddressZones();
    } catch (err) {
      console.error('Error toggling zone status:', err);
      toast.error('Kunne ikke ændre zone status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <EditableContent
          contentKey="admin-zones-title"
          as="h2"
          className="text-2xl font-bold"
          fallback="Adressezone Administration"
        />
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-primary flex items-center"
        >
          <Plus size={20} className="mr-2" />
          <EditableContent
            contentKey="admin-zones-add-button"
            fallback="Tilføj Zone"
          />
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-neutral-700/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-zones-total-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Total Zoner"
              />
              <p className="text-xl font-bold">{addressZones.length}</p>
            </div>
            <MapPin className="text-primary" size={20} />
          </div>
        </div>

        <div className="bg-neutral-700/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-zones-active-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Aktive Zoner"
              />
              <p className="text-xl font-bold text-success">
                {addressZones.filter(z => z.is_active).length}
              </p>
            </div>
            <Circle className="text-success" size={20} />
          </div>
        </div>

        <div className="bg-neutral-700/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <EditableContent
                contentKey="admin-zones-coverage-label"
                as="p"
                className="text-neutral-400 text-sm"
                fallback="Gennemsnitlig Radius"
              />
              <p className="text-xl font-bold">
                {addressZones.length > 0
                  ? Math.round(addressZones.reduce((sum, z) => sum + z.radius_km, 0) / addressZones.length)
                  : 0} <EditableContent contentKey="address-zones-manager-km" fallback="km" /></p>
            </div>
            <Circle className="text-primary" size={20} />
          </div>
        </div>
      </div>

      {/* Add Zone Form */}
      {showAddForm && (
        <div className="bg-neutral-700/20 rounded-lg p-6">
          <EditableContent
            contentKey="admin-zones-add-form-title"
            as="h3"
            className="text-xl font-semibold mb-4"
            fallback="Tilføj Ny Adressezone"
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <EditableContent
                  contentKey="admin-zones-name-label"
                  as="label"
                  className="form-label"
                  fallback="Zone Navn"
                />
                <input
                  type="text"
                  value={newZone.name}
                  onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
                  className="form-input"
                  placeholder="F.eks. Kolding Zone"
                />
              </div>
              <div>
                <EditableContent
                  contentKey="admin-zones-radius-label"
                  as="label"
                  className="form-label"
                  fallback="Radius (km)"
                />
                <input
                  type="number"
                  value={newZone.radius_km}
                  onChange={(e) => setNewZone({ ...newZone, radius_km: parseInt(e.target.value) || 0 })}
                  className="form-input"
                  min="1"
                  max="100"
                />
              </div>
            </div>

            <div>
              <EditableContent
                contentKey="admin-zones-address-label"
                as="label"
                className="form-label"
                fallback="Center Adresse"
              />
              <input
                type="text"
                value={newZone.center_address}
                onChange={(e) => setNewZone({ ...newZone, center_address: e.target.value })}
                className="form-input"
                placeholder="F.eks. Kringsager 36, 6000 Kolding"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="new-zone-active"
                checked={newZone.is_active}
                onChange={(e) => setNewZone({ ...newZone, is_active: e.target.checked })}
                className="mr-2"
              />
              <EditableContent
                contentKey="admin-zones-active-checkbox"
                as="label"
                htmlFor="new-zone-active"
                className="text-neutral-300"
                fallback="Aktiv zone"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewZone({ name: '', center_address: '', radius_km: 10, is_active: true });
                }}
                className="btn-secondary"
              >
                <EditableContent contentKey="admin-zones-cancel-button" fallback="Annuller" />
              </button>
              <button onClick={handleAddZone} className="btn-primary">
                <EditableContent contentKey="admin-zones-save-button" fallback="Gem Zone" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zones List */}
      <div className="space-y-4">
        {addressZones.map((zone) => (
          <div key={zone.id} className="bg-neutral-700/20 rounded-lg p-6">
            {editingZone?.id === zone.id ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <EditableContent
                      contentKey="admin-zones-edit-name-label"
                      as="label"
                      className="form-label"
                      fallback="Zone Navn"
                    />
                    <input
                      type="text"
                      value={editingZone.name}
                      onChange={(e) => setEditingZone({ ...editingZone, name: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <EditableContent
                      contentKey="admin-zones-edit-radius-label"
                      as="label"
                      className="form-label"
                      fallback="Radius (km)"
                    />
                    <input
                      type="number"
                      value={editingZone.radius_km}
                      onChange={(e) => setEditingZone({ ...editingZone, radius_km: parseInt(e.target.value) || 0 })}
                      className="form-input"
                      min="1"
                      max="100"
                    />
                  </div>
                </div>

                <div>
                  <EditableContent
                    contentKey="admin-zones-edit-address-label"
                    as="label"
                    className="form-label"
                    fallback="Center Adresse"
                  />
                  <input
                    type="text"
                    value={editingZone.center_address}
                    onChange={(e) => setEditingZone({ ...editingZone, center_address: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={`edit-zone-active-${zone.id}`}
                    checked={editingZone.is_active}
                    onChange={(e) => setEditingZone({ ...editingZone, is_active: e.target.checked })}
                    className="mr-2"
                  />
                  <EditableContent
                    contentKey="admin-zones-edit-active-checkbox"
                    as="label"
                    htmlFor={`edit-zone-active-${zone.id}`}
                    className="text-neutral-300"
                    fallback="Aktiv zone"
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setEditingZone(null)}
                    className="btn-secondary flex items-center"
                  >
                    <X size={16} className="mr-2" />
                    <EditableContent contentKey="admin-zones-edit-cancel-button" fallback="Annuller" />
                  </button>
                  <button onClick={handleUpdateZone} className="btn-primary flex items-center">
                    <Save size={16} className="mr-2" />
                    <EditableContent contentKey="admin-zones-edit-save-button" fallback="Gem" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className={`p-3 rounded-lg ${zone.is_active ? 'bg-success/10 text-success' : 'bg-neutral-600/20 text-neutral-400'}`}>
                    <MapPin size={24} />
                  </div>
                  <div>
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold">{zone.name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        zone.is_active
                          ? 'bg-success/10 text-success'
                          : 'bg-neutral-600/20 text-neutral-400'
                      }`}>
                        {zone.is_active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </div>
                    <p className="text-neutral-300 mb-1">{zone.center_address}</p>
                    <p className="text-sm text-neutral-400"><EditableContent contentKey="address-zones-manager-radius" fallback="Radius:" />{zone.radius_km} <EditableContent contentKey="address-zones-manager-km-2" fallback="km" /></p>
                    <p className="text-xs text-neutral-500 mt-2">
                      <EditableContent contentKey="admin-zones-created-label" fallback="Oprettet:" />{' '}
                      {new Date(zone.created_at).toLocaleDateString('da-DK')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleZoneStatus(zone.id, zone.is_active)}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      zone.is_active
                        ? 'bg-warning/10 text-warning hover:bg-warning/20'
                        : 'bg-success/10 text-success hover:bg-success/20'
                    }`}
                  >
                    {zone.is_active ? 'Deaktiver' : 'Aktiver'}
                  </button>
                  <button
                    onClick={() => setEditingZone(zone)}
                    className="p-2 text-neutral-400 hover:text-white transition-colors"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteZone(zone.id)}
                    className="p-2 text-neutral-400 hover:text-error transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {addressZones.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <MapPin size={48} className="mx-auto mb-4 opacity-50" />
          <EditableContent
            contentKey="admin-zones-no-zones"
            as="p"
            fallback="Ingen adressezoner fundet. Tilføj den første zone for at komme i gang."
          />
        </div>
      )}
    </div>
  );
};

export default AddressZonesManager;