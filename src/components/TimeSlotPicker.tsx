import React, { useState, useEffect } from 'react';
import { TimeSlot } from '../types';
import { formatDate, formatTime, generateTimeSlots } from '../utils/booking';
import EditableContent from './EditableContent';
import { supabase } from '../utils/supabase';

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

const TimeSlotPicker: React.FC<TimeSlotPickerProps> = ({ onSelectTimeSlot, selectedSlot }) => {
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupedSlots, setGroupedSlots] = useState<Record<string, TimeSlot[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchBookedDates = async () => {
      try {
        // Fetch all bookings that are not deleted and have not failed payment
        const { data: bookings, error } = await supabase
          .from('bookings')
          .select('booking_date')
          .is('deleted_at', null)
          .in('payment_status', ['pending', 'paid', 'completed']);

        if (error) {
          console.error('Error fetching bookings:', error);
          return;
        }

        // Create a Set of booked dates in YYYY-MM-DD format
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
        
        // Filter out slots for dates that are already booked
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

    // Only fetch time slots after booked dates have been loaded
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

  // Format time to 24-hour Danish format
  const formatTimeTo24Hour = (time: string): string => {
    // If time is already in 24-hour format (HH:MM), return as is
    if (/^\d{2}:\d{2}$/.test(time)) {
      return time;
    }
    
    // Otherwise, convert from 12-hour format
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
    {/* Compact sunset recommendation banner */}
<div className="my-6 relative overflow-hidden rounded-lg">
  <div className="bg-gradient-to-r from-red-600/90 to-orange-600/90 backdrop-blur-sm p-3 sm:p-4 rounded-lg border border-red-400/30 shadow-md">
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="flex-shrink-0">
        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-red-200" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <EditableContent
          contentKey="booking-sunset-recommendation-title"
          as="h3"
          className="text-sm sm:text-base font-bold text-white leading-tight"
          fallback="Solnedgang & Solopgang Anbefalet"
        />
        <EditableContent
          contentKey="booking-sunset-recommendation-description"
          as="p"
          className="text-[12px] sm:text-xs text-red-50/90 mt-0.5" 
          fallback="For højeste kvalitet"
        />
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* ── Night ── */}
            <div className={`border-l-4 ${categoryConfig.night.borderColor} rounded-lg p-4 bg-neutral-900 min-h-64 flex flex-col`}>
              {categorizedSlots.night.length > 0 && (
                <EditableContent
                  contentKey="timeslot_picker_category_night"
                  fallback="Nat"
                  as="h4"
                  className={`font-semibold mb-3 ${categoryConfig.night.color} text-sm uppercase`}
                />
              )}
              <div className="space-y-2 flex-grow">
                {categorizedSlots.night.map(slot => (
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
                ))}
              </div>
            </div>

            {/* ── Sunrise ── */}
            <div className={`border-l-4 ${categoryConfig.sunrise.borderColor} rounded-lg p-4 bg-neutral-900 min-h-64 flex flex-col`}>
              {categorizedSlots.sunrise.length > 0 && (
                <EditableContent
                  contentKey="timeslot_picker_category_sunrise"
                  fallback="Solopgang"
                  as="h4"
                  className={`font-semibold mb-3 ${categoryConfig.sunrise.color} text-sm uppercase`}
                />
              )}
              <div className="space-y-2 flex-grow">
                {categorizedSlots.sunrise.map(slot => (
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
                ))}
              </div>
            </div>

            {/* ── Daytime ── */}
            <div className={`border-l-4 ${categoryConfig.daytime.borderColor} rounded-lg p-4 bg-neutral-900 min-h-64 flex flex-col`}>
              {categorizedSlots.daytime.length > 0 && (
                <EditableContent
                  contentKey="timeslot_picker_category_daytime"
                  fallback="Dagstid"
                  as="h4"
                  className={`font-semibold mb-3 ${categoryConfig.daytime.color} text-sm uppercase`}
                />
              )}
              <div className="space-y-2 flex-grow">
                {categorizedSlots.daytime.map(slot => (
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
                ))}
              </div>
            </div>

            {/* ── Sunset ── */}
            <div className={`border-l-4 ${categoryConfig.sunset.borderColor} rounded-lg p-4 bg-neutral-900 min-h-64 flex flex-col`}>
              {categorizedSlots.sunset.length > 0 && (
                <EditableContent
                  contentKey="timeslot_picker_category_sunset"
                  fallback="Solnedgang"
                  as="h4"
                  className={`font-semibold mb-3 ${categoryConfig.sunset.color} text-sm uppercase`}
                />
              )}
              <div className="space-y-2 flex-grow">
                {categorizedSlots.sunset.map(slot => (
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
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TimeSlotPicker;
