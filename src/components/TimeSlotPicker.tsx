import React, { useState, useEffect } from 'react';
import { TimeSlot } from '../types';
import { formatDate, formatTime, generateTimeSlots } from '../utils/booking';
import EditableContent from './EditableContent';
import { supabase } from '../utils/supabase';

// Image placeholders: replace these URLs with real example images to show users how each option looks
const DAGSLYS_IMAGE_PLACEHOLDER = 'https://placehold.co/400x250?text=Dagslys+eksempel';
const SOLNEDGANG_IMAGE_PLACEHOLDER = 'https://placehold.co/400x250?text=Solnedgang+eksempel';

interface TimeSlotPickerProps {
  onSelectTimeSlot: (slot: TimeSlot) => void;
  selectedSlot: TimeSlot | null;
}

const categoryConfig = {
  night: { borderColor: 'border-blue-500', label: 'Nat', color: 'text-blue-400' },
  sunrise: { borderColor: 'border-yellow-500', label: 'Solopgang', color: 'text-orange-400' },
  daytime: { borderColor: 'border-green-500', label: 'Dagstid', color: 'text-green-400' },
  sunset: { borderColor: 'border-orange-500', label: 'Solnedgang', color: 'text-orange-400' }
};

// ---- Bucketing helpers ----------------------------------------------------

const timeToMinutes = (time24: string): number => {
  const [h, m] = time24.split(':').map(Number);
  return h * 60 + m;
};

const minutesToLabel = (mins: number): string => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return m === 0 ? `${h}` : `${h}:${m.toString().padStart(2, '0')}`;
};

const BUCKET_THRESHOLD = 7;

// Jo flere tider, jo flere halve timer pr. gruppe (målet er ca. 5-7 knapper)
const getBucketSize = (count: number): number => {
  return Math.max(2, Math.ceil(count / 6));
};

type BucketItem =
  | { type: 'single'; slot: TimeSlot }
  | { type: 'bucket'; key: string; slots: TimeSlot[]; rangeLabel: string };

const bucketSlots = (
  slots: TimeSlot[],
  formatFn: (time: string) => string
): BucketItem[] => {
  if (slots.length <= BUCKET_THRESHOLD) {
    return slots.map(slot => ({ type: 'single', slot }));
  }

  const size = getBucketSize(slots.length);
  const groups: BucketItem[] = [];

  for (let i = 0; i < slots.length; i += size) {
    const group = slots.slice(i, i + size);
    const firstMin = timeToMinutes(formatFn(group[0].time));
    // Slut-etiketten er starten af sidste slot + 30 min
    const lastMin = timeToMinutes(formatFn(group[group.length - 1].time)) + 30;
    const rangeLabel = `${minutesToLabel(firstMin)}-${minutesToLabel(lastMin)}`;

    groups.push({
      type: 'bucket',
      key: `${group[0].id}-${group[group.length - 1].id}`,
      slots: group,
      rangeLabel,
    });
  }

  return groups;
};

// ----------------------------------------------------------------------------

const TimeSlotPicker: React.FC<TimeSlotPickerProps> = ({ onSelectTimeSlot, selectedSlot }) => {
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupedSlots, setGroupedSlots] = useState<Record<string, TimeSlot[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set());
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchBookedDates = async () => {
      try {
        const { data: bookings, error } = await supabase
          .from('bookings')
          .select('booking_date')
          .is('deleted_at', null)
          .in('payment_status', ['pending', 'paid', 'completed']);

        if (error) {
          console.error('Error fetching bookings:', error);
          return;
        }

        const bookedDatesSet = new Set(
          bookings.map(booking => booking.booking_date)
        );

        setBookedDates(bookedDatesSet);
      } catch (error) {
        console.error('Error fetching booked dates:', error);
      }
    };

    fetchBookedDates();
  }, []);

  useEffect(() => {
    const fetchTimeSlots = async () => {
      try {
        const slots = await generateTimeSlots();

        const availableSlots = slots.map(slot => {
          if (bookedDates.has(slot.date)) {
            return { ...slot, available: false };
          }
          return slot;
        });

        setTimeSlots(availableSlots);

        const grouped = availableSlots.reduce((acc, slot) => {
          if (!acc[slot.date]) {
            acc[slot.date] = [];
          }
          acc[slot.date].push(slot);
          return acc;
        }, {} as Record<string, TimeSlot[]>);

        setGroupedSlots(grouped);

        const firstAvailableDate = Object.keys(grouped).find(date =>
          grouped[date].some(slot => slot.available)
        );

        if (firstAvailableDate) {
          setSelectedDate(firstAvailableDate);
        }
      } catch (error) {
        console.error('Error fetching time slots:', error);
      } finally {
        setLoading(false);
      }
    };

    if (bookedDates.size >= 0) {
      fetchTimeSlots();
    }
  }, [bookedDates]);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
  };

  const handleTimeSelect = (slot: TimeSlot) => {
    if (slot.available) {
      onSelectTimeSlot(slot);
    }
  };

  const toggleBucket = (key: string) => {
    setExpandedBuckets(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formatTimeTo24Hour = (time: string): string => {
    if (/^\d{2}:\d{2}$/.test(time)) {
      return time;
    }

    const [timePart, period] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);

    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <EditableContent
          contentKey="timeslot_picker_loading_text"
          fallback="Indlæser tilgængelige tider..."
        />
      </div>
    );
  }

  const availableDates = Object.keys(groupedSlots).filter(date =>
    groupedSlots[date].some(slot => slot.available)
  );

  if (availableDates.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-400">
        <EditableContent
          contentKey="timeslot_picker_no_slots_text"
          fallback="Ingen ledige tider tilgængelige. Prøv venligst igen senere."
        />
      </div>
    );
  }

  const groupSlotsByCategory = (slots: TimeSlot[]) => {
    return {
      night: slots.filter(s => s.category === 'night'),
      sunrise: slots.filter(s => s.category === 'sunrise'),
      daytime: slots.filter(s => s.category === 'daytime'),
      sunset: slots.filter(s => s.category === 'sunset')
    };
  };

  const slotsForSelectedDate = selectedDate ? groupedSlots[selectedDate]?.filter(slot => slot.available) || [] : [];
  const categorizedSlots = groupSlotsByCategory(slotsForSelectedDate);

  // Only zones that actually have slots get rendered, and the grid
  // column count adapts to how many zones survive the filter.
  const visibleCategories = [
    { key: 'night', slots: categorizedSlots.night, config: categoryConfig.night, labelKey: 'timeslot_picker_category_night' },
    { key: 'sunrise', slots: categorizedSlots.sunrise, config: categoryConfig.sunrise, labelKey: 'timeslot_picker_category_sunrise' },
    { key: 'daytime', slots: categorizedSlots.daytime, config: categoryConfig.daytime, labelKey: 'timeslot_picker_category_daytime' },
    { key: 'sunset', slots: categorizedSlots.sunset, config: categoryConfig.sunset, labelKey: 'timeslot_picker_category_sunset' },
  ].filter(cat => cat.slots.length > 0);

  const gridColsClass: Record<number, string> = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  };

  return (
    <div className="mt-4">
      <EditableContent
        contentKey="timeslot_picker_select_date_heading"
        fallback="Vælg en dato"
        as="h3"
        className="text-lg font-medium mb-3"
      />
      <div className="flex overflow-x-auto pb-4 -mx-4 px-4 space-x-2">
        {availableDates.map(date => {
          const dateObj = new Date(date);
          const danishDate = dateObj.toLocaleDateString('da-DK', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
          });
          return (
            <button
              key={date}
              onClick={() => handleDateSelect(date)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                date === selectedDate
                  ? 'bg-neutral-800 text-white'
                  : 'bg-neutral-700 text-white hover:bg-neutral-600'
              }`}
            >
              {danishDate}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <>
          {/* Comparison schema for Dagslys vs Solnedgang */}
          <div className="my-6 relative overflow-hidden rounded-lg">
            <div className="p-3 sm:p-4 rounded-lg border border-neutral-700/30 shadow-md bg-neutral-900">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div className="flex gap-3">
                  <img src={DAGSLYS_IMAGE_PLACEHOLDER} alt="Dagslys eksempel" className="w-28 h-20 object-cover rounded-md flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-white">Dagslys</h4>
                    <p className="text-[13px] text-neutral-300 mt-1">Giver et skarpt, rent og meget lyst resultat med korte skygger. Det er ideelt, hvis alt skal fremstå tydeligt og naturtro. Det har et lidt mindre dramatisk og filmisk udtryk, men er utroligt flot og detaljerigt.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <img src={SOLNEDGANG_IMAGE_PLACEHOLDER} alt="Solnedgang eksempel" className="w-28 h-20 object-cover rounded-md flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-white">Solnedgang (Golden Hour)</h4>
                    <p className="text-[13px] text-neutral-300 mt-1">Giver et langt mere farverigt og meget filmisk look. Det varme lys skaber dybde og stemning, men det betyder også, at vi får længere skygger, og at visse områder i billedet naturligt vil fremstå mørkere og mere kontrastfyldte.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <EditableContent
            contentKey="timeslot_picker_select_time_heading"
            fallback="Vælg et tidspunkt"
            as="h3"
            className="text-lg font-medium mb-3 mt-6"
          />

          <div className={`grid grid-cols-1 ${gridColsClass[visibleCategories.length] || 'md:grid-cols-4'} gap-6`}>
            {visibleCategories.map(({ key, slots, config, labelKey }) => (
              <div
                key={key}
                className={`border-l-4 ${config.borderColor} rounded-lg p-4 bg-neutral-900 flex flex-col`}
              >
                <EditableContent
                  contentKey={labelKey}
                  fallback={config.label}
                  as="h4"
                  className={`font-semibold mb-3 ${config.color} text-sm uppercase`}
                />
                <div className="space-y-2">
                  {bucketSlots(slots, (t) => formatTimeTo24Hour(formatTime(t))).map(item => {
                    if (item.type === 'single') {
                      const slot = item.slot;
                      return (
                        <button
                          key={slot.id}
                          onClick={() => handleTimeSelect(slot)}
                          className={`w-full px-3 py-2 rounded-lg text-center text-sm transition-all font-medium ${
                            selectedSlot?.id === slot.id
                              ? 'bg-neutral-700 text-white border border-neutral-500'
                              : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                          }`}
                        >
                          {formatTimeTo24Hour(formatTime(slot.time))}
                        </button>
                      );
                    }

                    const isExpanded = expandedBuckets.has(item.key);

                    if (!isExpanded) {
                      return (
                        <button
                          key={item.key}
                          onClick={() => toggleBucket(item.key)}
                          className="w-full px-3 py-2 rounded-lg text-center text-sm transition-all font-medium bg-neutral-800 text-neutral-200 hover:bg-neutral-700 flex items-center justify-between"
                        >
                          <span>{item.rangeLabel}</span>
                          <span className="text-xs text-neutral-400">{item.slots.length} tider ▾</span>
                        </button>
                      );
                    }

                    return (
                      <div key={item.key} className="rounded-lg border border-neutral-700 overflow-hidden">
                        <button
                          onClick={() => toggleBucket(item.key)}
                          className="w-full px-3 py-1.5 text-center text-xs text-neutral-400 bg-neutral-800/50 hover:bg-neutral-700"
                        >
                          {item.rangeLabel} ▴
                        </button>
                        <div className="p-2 space-y-2">
                          {item.slots.map(slot => (
                            <button
                              key={slot.id}
                              onClick={() => handleTimeSelect(slot)}
                              className={`w-full px-3 py-2 rounded-lg text-center text-sm transition-all font-medium ${
                                selectedSlot?.id === slot.id
                                  ? 'bg-neutral-700 text-white border border-neutral-500'
                                  : 'bg-neutral-900 text-neutral-200 hover:bg-neutral-700'
                              }`}
                            >
                              {formatTimeTo24Hour(formatTime(slot.time))}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default TimeSlotPicker;
