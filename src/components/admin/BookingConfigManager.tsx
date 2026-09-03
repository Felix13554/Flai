import React, { useState, useEffect } from 'react';
import { Clock, Save, RotateCcw, Calendar, Plus, Edit2, Trash2, X, AlertCircle } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { BookingConfig, BookingDay } from '../../types';
import { toast } from 'react-hot-toast';
import { format, addMinutes } from 'date-fns';
import EditableContent from '../EditableContent';

const BookingConfigManager: React.FC = () => {
  const [weeklyConfig, setWeeklyConfig] = useState<BookingConfig[]>([]);
  const [specificSchedules, setSpecificSchedules] = useState<BookingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'weekly' | 'specific'>('weekly');
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddWeeklyForm, setShowAddWeeklyForm] = useState<BookingDay | null>(null);
  const [editingWeeklySchedule, setEditingWeeklySchedule] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: '',
    startTime: '14:00',
    endTime: '18:00',
    is_enabled: false,
    reason: '',
    priority: 1
  });
  const [weeklyFormData, setWeeklyFormData] = useState({
    startTime: '14:00',
    endTime: '18:00',
    is_enabled: true
  });

  const dayLabels: Record<BookingDay, string> = {
    monday: 'Mandag',
    tuesday: 'Tirsdag',
    wednesday: 'Onsdag',
    thursday: 'Torsdag',
    friday: 'Fredag',
    saturday: 'Lørdag',
    sunday: 'Søndag'
  };

  const allDays: BookingDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('booking_schedules')
        .select('*')
        .order('type')
        .order('day_name')
        .order('start_time')
        .order('date_override')
        .order('priority', { ascending: false });

      if (error) throw error;

      const weekly = (data || []).filter(item => item.type === 'weekly');
      const specific = (data || []).filter(item => item.type === 'specific_date');

      setWeeklyConfig(weekly);
      setSpecificSchedules(specific);
    } catch (error) {
      console.error('Error fetching booking schedules:', error);
      toast.error('Fejl ved indlæsning af booking konfiguration');
    } finally {
      setLoading(false);
    }
  };

  const getWeeklyConfigForDay = (day: BookingDay): BookingConfig[] => {
    return weeklyConfig.filter(config => config.day_name === day);
  };

  const handleAddWeeklyPeriod = async (day: BookingDay) => {
    if (!weeklyFormData.startTime || !weeklyFormData.endTime) {
      toast.error('Start tid og slut tid er påkrævet');
      return;
    }

    // Validate that end time is after start time
    const [startHour, startMinute] = weeklyFormData.startTime.split(':').map(Number);
    const [endHour, endMinute] = weeklyFormData.endTime.split(':').map(Number);
    
    if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
      toast.error('Slut tid skal være efter start tid');
      return;
    }

    try {
      const { error } = await supabase
        .from('booking_schedules')
        .insert({
          type: 'weekly',
          day_name: day,
          is_enabled: weeklyFormData.is_enabled,
          start_time: weeklyFormData.startTime + ':00',
          end_time: weeklyFormData.endTime + ':00',
          priority: 0
        });

      if (error) throw error;

      toast.success('Tidsperiode tilføjet');
      setShowAddWeeklyForm(null);
      setWeeklyFormData({ startTime: '14:00', endTime: '18:00', is_enabled: true });
      fetchSchedules();
    } catch (error) {
      console.error('Error adding weekly period:', error);
      toast.error('Fejl ved tilføjelse af tidsperiode');
    }
  };

  const handleUpdateWeeklyPeriod = async (id: string, updates: Partial<BookingConfig>) => {
    try {
      const { error } = await supabase
        .from('booking_schedules')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast.success('Tidsperiode opdateret');
      setEditingWeeklySchedule(null);
      fetchSchedules();
    } catch (error) {
      console.error('Error updating weekly period:', error);
      toast.error('Fejl ved opdatering af tidsperiode');
    }
  };

  const handleDeleteWeeklyPeriod = async (id: string) => {
    if (!confirm('Er du sikker på, at du vil slette denne tidsperiode?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('booking_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Tidsperiode slettet');
      fetchSchedules();
    } catch (error) {
      console.error('Error deleting weekly period:', error);
      toast.error('Fejl ved sletning af tidsperiode');
    }
  };

  const handleSubmitSpecific = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.date || !formData.startTime || !formData.endTime) {
      toast.error('Dato, start tid og slut tid er påkrævet');
      return;
    }

    // Validate that end time is after start time
    const [startHour, startMinute] = formData.startTime.split(':').map(Number);
    const [endHour, endMinute] = formData.endTime.split(':').map(Number);
    
    if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
      toast.error('Slut tid skal være efter start tid');
      return;
    }

    try {
      const { error } = await supabase
        .from('booking_schedules')
        .insert([{
          type: 'specific_date',
          date_override: formData.date,
          is_enabled: formData.is_enabled,
          start_time: formData.startTime,
          end_time: formData.endTime,
          reason: formData.reason || null,
          priority: formData.priority
        }]);

      if (error) {
        if (error.code === '23505') {
          toast.error('Der findes allerede en specifik indstilling for denne dato');
        } else {
          throw error;
        }
        return;
      }

      toast.success(formData.is_enabled ? 'Specifik tid tilføjet' : 'Tidsinterval blokeret');
      setFormData({ date: '', startTime: '14:00', endTime: '18:00', is_enabled: false, reason: '', priority: 1 });
      setShowAddForm(false);
      fetchSchedules();
    } catch (error) {
      console.error('Error adding specific schedule:', error);
      toast.error('Fejl ved tilføjelse af specifik tid');
    }
  };

  const handleUpdateSpecific = async (id: string, updates: Partial<BookingConfig>) => {
    try {
      const { error } = await supabase
        .from('booking_schedules')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast.success('Specifik tid opdateret');
      setEditingSchedule(null);
      fetchSchedules();
    } catch (error) {
      console.error('Error updating specific schedule:', error);
      toast.error('Fejl ved opdatering af specifik tid');
    }
  };

  const handleDeleteSpecific = async (id: string) => {
    if (!confirm('Er du sikker på, at du vil slette denne specifikke tid?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('booking_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Specifik tid slettet');
      fetchSchedules();
    } catch (error) {
      console.error('Error deleting specific schedule:', error);
      toast.error('Fejl ved sletning af specifik tid');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('da-DK', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timeString: string) => {
    return timeString.substring(0, 5); // Remove seconds if present
  };

  const handleReset = () => {
    if (confirm('Er du sikker på, at du vil nulstille til standardindstillinger?')) {
      fetchSchedules();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <EditableContent
            contentKey="booking-config-manager-title"
            as="h2"
            className="text-2xl font-bold mb-2"
            fallback="Booking Tidsplaner"
          />
          <EditableContent
            contentKey="booking-config-manager-description"
            as="p"
            className="text-neutral-400"
            fallback="Administrer ugentlige tidsplaner og specifikke dato-overrides for booking tilgængelighed."
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-neutral-700/20 p-1 rounded-lg border border-neutral-600">
        <button
          onClick={() => setActiveTab('weekly')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'weekly'
              ? 'bg-primary text-white'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-600/50'
          }`}
        >
          <Clock size={16} />
          <span><EditableContent contentKey="booking-config-manager-ugentlig-tidsplan" fallback="Ugentlig Tidsplan" /></span>
        </button>
        <button
          onClick={() => setActiveTab('specific')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-colors ${
            activeTab === 'specific'
              ? 'bg-primary text-white'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-600/50'
          }`}
        >
          <Calendar size={16} />
          <span><EditableContent contentKey="booking-config-manager-specifikke-datoer" fallback="Specifikke Datoer" /></span>
        </button>
      </div>

      {/* Weekly Configuration Tab */}
      {activeTab === 'weekly' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1"><EditableContent contentKey="booking-config-manager-ugentlig-tidsplan-2" fallback="Ugentlig Tidsplan" /></h3>
              <p className="text-neutral-400 text-sm">
                <EditableContent contentKey="booking-config-manager-konfigurer-flere-tidsperioder-for-hver" fallback="Konfigurer flere tidsperioder for hver dag i ugen. Du kan tilføje morgentimer, eftermiddagstimer osv." /></p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleReset}
                className="flex items-center space-x-2 px-4 py-2 bg-neutral-600 text-white rounded-lg hover:bg-neutral-500 transition-colors"
              >
                <RotateCcw size={16} />
                <span><EditableContent contentKey="booking-config-manager-genindlaes" fallback="Genindlæs" /></span>
              </button>
            </div>
          </div>

          <div className="bg-neutral-700/20 rounded-lg border border-neutral-600">
            <div className="divide-y divide-neutral-600">
              {allDays.map((day) => {
                const dayPeriods = getWeeklyConfigForDay(day);
                return (
                  <div key={day} className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Clock size={20} className="text-primary" />
                        <h3 className="text-lg font-semibold">{dayLabels[day]}</h3>
                        <span className="text-sm text-neutral-400">
                          ({dayPeriods.length} <EditableContent contentKey="booking-config-manager-tidsperiode" fallback="tidsperiode" />{dayPeriods.length !== 1 ? 'r' : ''})
                        </span>
                      </div>
                      <button
                        onClick={() => setShowAddWeeklyForm(day)}
                        className="flex items-center space-x-2 px-3 py-1 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors text-sm"
                      >
                        <Plus size={14} />
                        <span><EditableContent contentKey="booking-config-manager-tilfoej-periode" fallback="Tilføj periode" /></span>
                      </button>
                    </div>

                    {/* Add Form for this day */}
                    {showAddWeeklyForm === day && (
                      <div className="mb-4 p-4 bg-neutral-600/20 rounded-lg border border-neutral-500">
                        <h4 className="text-sm font-medium mb-3"><EditableContent contentKey="booking-config-manager-tilfoej-ny-tidsperiode-for" fallback="Tilføj ny tidsperiode for" />{dayLabels[day]}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium mb-1"><EditableContent contentKey="booking-config-manager-start-tid" fallback="Start tid" /></label>
                            <input
                              type="time"
                              value={weeklyFormData.startTime}
                              onChange={(e) => setWeeklyFormData({ ...weeklyFormData, startTime: e.target.value })}
                              className="w-full px-2 py-1 text-sm bg-neutral-700 border border-neutral-600 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1"><EditableContent contentKey="booking-config-manager-slut-tid" fallback="Slut tid" /></label>
                            <input
                              type="time"
                              value={weeklyFormData.endTime}
                              onChange={(e) => setWeeklyFormData({ ...weeklyFormData, endTime: e.target.value })}
                              className="w-full px-2 py-1 text-sm bg-neutral-700 border border-neutral-600 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={weeklyFormData.is_enabled}
                                onChange={(e) => setWeeklyFormData({ ...weeklyFormData, is_enabled: e.target.checked })}
                                className="w-3 h-3 text-primary bg-neutral-700 border-neutral-600 rounded focus:ring-primary focus:ring-2"
                              />
                              <span className="text-xs"><EditableContent contentKey="booking-config-manager-aktiveret" fallback="Aktiveret" /></span>
                            </label>
                          </div>
                        </div>
                        <div className="flex space-x-2 mt-3">
                          <button
                            onClick={() => handleAddWeeklyPeriod(day)}
                            className="flex items-center space-x-1 px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary/90 transition-colors"
                          >
                            <Save size={12} />
                            <span><EditableContent contentKey="booking-config-manager-gem" fallback="Gem" /></span>
                          </button>
                          <button
                            onClick={() => {
                              setShowAddWeeklyForm(null);
                              setWeeklyFormData({ startTime: '14:00', endTime: '18:00', is_enabled: true });
                            }}
                            className="px-3 py-1 bg-neutral-600 text-white rounded text-sm hover:bg-neutral-500 transition-colors"
                          >
                            <EditableContent contentKey="booking-config-manager-annuller" fallback="Annuller" /></button>
                        </div>
                      </div>
                    )}

                    {/* Existing periods for this day */}
                    {dayPeriods.length === 0 ? (
                      <div className="text-center py-4 text-neutral-400 text-sm">
                        <EditableContent contentKey="booking-config-manager-ingen-tidsperioder-konfigureret-for-denne" fallback="Ingen tidsperioder konfigureret for denne dag" /></div>
                    ) : (
                      <div className="space-y-2">
                        {dayPeriods.map((period) => (
                          <div key={period.id} className="flex items-center justify-between p-3 bg-neutral-600/20 rounded-lg border border-neutral-500">
                            {editingWeeklySchedule === period.id ? (
                              <EditWeeklyPeriodForm
                                period={period}
                                onSave={(updates) => handleUpdateWeeklyPeriod(period.id, updates)}
                                onCancel={() => setEditingWeeklySchedule(null)}
                              />
                            ) : (
                              <>
                                <div className="flex items-center space-x-4">
                                  <div className="flex items-center space-x-2">
                                    <Clock size={14} className="text-neutral-400" />
                                    <span className="text-sm font-medium">
                                      {formatTime(period.start_time)} - {formatTime(period.end_time)}
                                    </span>
                                  </div>
                                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    period.is_enabled 
                                      ? 'bg-success/20 text-success' 
                                      : 'bg-neutral-500/20 text-neutral-400'
                                  }`}>
                                    {period.is_enabled ? 'Aktiveret' : 'Deaktiveret'}
                                  </div>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => setEditingWeeklySchedule(period.id)}
                                    className="p-1 text-neutral-400 hover:text-primary transition-colors"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteWeeklyPeriod(period.id)}
                                    className="p-1 text-neutral-400 hover:text-error transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Specific Dates Tab */}
      {activeTab === 'specific' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1"><EditableContent contentKey="booking-config-manager-specifikke-dato-overrides" fallback="Specifikke Dato Overrides" /></h3>
              <p className="text-neutral-400 text-sm">
                <EditableContent contentKey="booking-config-manager-tilsidesaet-ugentlig-tidsplan-for-specifikke" fallback="Tilsidesæt ugentlig tidsplan for specifikke datoer. Højere prioritet vinder ved konflikter." /></p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center space-x-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus size={20} />
              <span><EditableContent contentKey="booking-config-manager-tilfoej-override" fallback="Tilføj Override" /></span>
            </button>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <div className="bg-neutral-700/20 rounded-lg p-6 border border-neutral-600">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold"><EditableContent contentKey="booking-config-manager-tilfoej-specifik-dato-override" fallback="Tilføj Specifik Dato Override" /></h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitSpecific} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-dato" fallback="Dato" /></label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-prioritet" fallback="Prioritet" /></label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-status" fallback="Status" /></label>
                  <select
                    value={formData.is_enabled.toString()}
                    onChange={(e) => setFormData({ ...formData, is_enabled: e.target.value === 'true' })}
                    className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="false"><EditableContent contentKey="booking-config-manager-bloker-tidsinterval-ikke-tilgaengelig" fallback="Bloker tidsinterval (ikke tilgængelig)" /></option>
                    <option value="true"><EditableContent contentKey="booking-config-manager-tilgaengelig-tilsidesaet-ugentlig-plan-2" fallback="Tilgængelig (tilsidesæt ugentlig plan)" /></option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-start-tid-2" fallback="Start tid" /></label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-slut-tid-2" fallback="Slut tid" /></label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-begrundelse-valgfri" fallback="Begrundelse (valgfri)" /></label>
                  <input
                    type="text"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="f.eks. Ferie, Special event, Vedligeholdelse"
                    className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    type="submit"
                    className="flex items-center space-x-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Save size={16} />
                    <span><EditableContent contentKey="booking-config-manager-gem-2" fallback="Gem" /></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 bg-neutral-600 text-white rounded-lg hover:bg-neutral-500 transition-colors"
                  >
                    <EditableContent contentKey="booking-config-manager-annuller-2" fallback="Annuller" /></button>
                </div>
              </form>
            </div>
          )}

          {/* Specific Schedules List */}
          <div className="bg-neutral-700/20 rounded-lg border border-neutral-600">
            {specificSchedules.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar size={48} className="text-neutral-400 mx-auto mb-4" />
                <p className="text-neutral-400">
                  <EditableContent contentKey="booking-config-manager-ingen-specifikke-dato-overrides-konfigureret" fallback="Ingen specifikke dato overrides konfigureret endnu." /></p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-600">
                {specificSchedules.map((schedule) => (
                  <div key={schedule.id} className="p-4">
                    {editingSchedule === schedule.id ? (
                      <EditSpecificForm
                        schedule={schedule}
                        onSave={(updates) => handleUpdateSpecific(schedule.id, updates)}
                        onCancel={() => setEditingSchedule(null)}
                      />
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <Calendar size={16} className="text-neutral-400" />
                            <span className="font-medium">{formatDate(schedule.date_override!)}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Clock size={16} className="text-neutral-400" />
                            <span>{formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}</span>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                            schedule.is_enabled 
                              ? 'bg-success/20 text-success' 
                              : 'bg-error/20 text-error'
                          }`}>
                            {schedule.is_enabled ? 'Tilgængelig' : 'Blokeret'}
                          </div>
                          <div className="px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary">
                            <EditableContent contentKey="booking-config-manager-prioritet-2" fallback="Prioritet:" />{schedule.priority}
                          </div>
                          {schedule.reason && (
                            <div className="flex items-center space-x-1 text-neutral-400">
                              <AlertCircle size={14} />
                              <span className="text-sm">{schedule.reason}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setEditingSchedule(schedule.id)}
                            className="p-2 text-neutral-400 hover:text-primary transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteSpecific(schedule.id)}
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
            )}
          </div>
        </div>
      )}

      <div className="bg-neutral-700/20 rounded-lg p-4 border border-neutral-600">
        <div className="flex items-start space-x-3">
          <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
          <div className="text-sm text-neutral-400">
            <EditableContent
              contentKey="booking-config-help-text"
              as="p"
              fallback="Du kan nu tilføje flere tidsperioder per dag (f.eks. morgen og eftermiddag). Specifikke dato overrides har højere prioritet end ugentlige tidsplaner. Brug prioritet nummeret til at løse konflikter mellem overlappende specifikke overrides."
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface EditSpecificFormProps {
  schedule: BookingConfig;
  onSave: (updates: Partial<BookingConfig>) => void;
  onCancel: () => void;
}

const EditSpecificForm: React.FC<EditSpecificFormProps> = ({ schedule, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    date: schedule.date_override || '',
    startTime: schedule.start_time.substring(0, 5),
    endTime: schedule.end_time.substring(0, 5),
    is_enabled: schedule.is_enabled,
    reason: schedule.reason || '',
    priority: schedule.priority
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      date_override: formData.date,
      start_time: formData.startTime,
      end_time: formData.endTime,
      is_enabled: formData.is_enabled,
      reason: formData.reason || null,
      priority: formData.priority
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-dato-2" fallback="Dato" /></label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-start-tid-2" fallback="Start tid" /></label>
          <input
            type="time"
            value={formData.startTime}
            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-slut-tid-2" fallback="Slut tid" /></label>
          <input
            type="time"
            value={formData.endTime}
            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-status-2" fallback="Status" /></label>
          <select
            value={formData.is_enabled.toString()}
            onChange={(e) => setFormData({ ...formData, is_enabled: e.target.value === 'true' })}
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="true"><EditableContent contentKey="booking-config-manager-tilgaengelig-tilsidesaet-ugentlig-plan" fallback="Tilgængelig (tilsidesæt ugentlig plan)" /></option>
            <option value="false"><EditableContent contentKey="booking-config-manager-ikke-tilgaengelig-bloker-tid" fallback="Ikke tilgængelig (bloker tid)" /></option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-prioritet-3" fallback="Prioritet" /></label>
          <input
            type="number"
            min="1"
            max="100"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2"><EditableContent contentKey="booking-config-manager-begrundelse-valgfri-2" fallback="Begrundelse (valgfri)" /></label>
        <input
          type="text"
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          placeholder="f.eks. Ferie, Special event, Vedligeholdelse"
          className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      <div className="flex space-x-3">
        <button
          type="submit"
          className="flex items-center space-x-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Save size={16} />
          <span><EditableContent contentKey="booking-config-manager-gem-2" fallback="Gem" /></span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-neutral-600 text-white rounded-lg hover:bg-neutral-500 transition-colors"
        >
          <EditableContent contentKey="booking-config-manager-annuller-2" fallback="Annuller" />
        </button>
      </div>
    </form>
  );
};

interface EditWeeklyPeriodFormProps {
  period: BookingConfig;
  onSave: (updates: Partial<BookingConfig>) => void;
  onCancel: () => void;
}

const EditWeeklyPeriodForm: React.FC<EditWeeklyPeriodFormProps> = ({ period, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    startTime: period.start_time.substring(0, 5),
    endTime: period.end_time.substring(0, 5),
    is_enabled: period.is_enabled
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that end time is after start time
    const [startHour, startMinute] = formData.startTime.split(':').map(Number);
    const [endHour, endMinute] = formData.endTime.split(':').map(Number);
    
    if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
      toast.error('Slut tid skal være efter start tid');
      return;
    }

    onSave({
      start_time: formData.startTime + ':00',
      end_time: formData.endTime + ':00',
      is_enabled: formData.is_enabled
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1"><EditableContent contentKey="booking-config-manager-start-tid" fallback="Start tid" /></label>
          <input
            type="time"
            value={formData.startTime}
            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
            className="w-full px-2 py-1 text-sm bg-neutral-700 border border-neutral-600 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1"><EditableContent contentKey="booking-config-manager-slut-tid" fallback="Slut tid" /></label>
          <input
            type="time"
            value={formData.endTime}
            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
            className="w-full px-2 py-1 text-sm bg-neutral-700 border border-neutral-600 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
            required
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.is_enabled}
              onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked })}
              className="w-3 h-3 text-primary bg-neutral-700 border-neutral-600 rounded focus:ring-primary focus:ring-2"
            />
            <span className="text-xs"><EditableContent contentKey="booking-config-manager-aktiveret-2" fallback="Aktiveret" /></span>
          </label>
        </div>
        <div className="flex items-end space-x-1">
          <button
            type="submit"
            className="flex items-center space-x-1 px-2 py-1 bg-primary text-white rounded text-xs hover:bg-primary/90 transition-colors"
          >
            <Save size={10} />
            <span><EditableContent contentKey="booking-config-manager-gem" fallback="Gem" /></span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 bg-neutral-600 text-white rounded text-xs hover:bg-neutral-500 transition-colors"
          >
            <EditableContent contentKey="booking-config-manager-annuller" fallback="Annuller" />
          </button>
        </div>
      </div>
    </form>
  );
};

export default BookingConfigManager;