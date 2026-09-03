
import { format, addDays, getDay, isBefore, startOfToday, addMinutes, parseISO } from 'date-fns';
import { da } from 'date-fns/locale';
import { supabase } from './supabase';
import { BookingTimeRange, TimeSlot, BookingDay, BookingConfig } from '../types';
import { getSunTimesForDate, categorizTimeSlot } from './sunTimes';

// Helper functions for formatting dates and times
export const formatDate = (date: string): string => {
  return format(parseISO(date), 'EEEE, MMMM d, yyyy');
};

export const formatTime = (time: string): string => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

// Map day names to day numbers
const dayMap: Record<BookingDay, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

// Get booking configuration from database
export const getBookingConfig = async (): Promise<BookingTimeRange[]> => {
  try {
    const { data: config, error } = await supabase
      .from('booking_schedules')
      .select('*')
      .eq('type', 'weekly')
      .order('day_name');

    if (error) throw error;

    return (config || []).map((item: BookingConfig) => ({
      day: item.day_name as BookingDay,
      start: item.start_time,
      end: item.end_time,
      enabled: item.is_enabled
    }));
  } catch (error) {
    console.error('Error fetching booking config:', error);
    // Fallback to default configuration
    return [
      { day: 'monday', start: '14:00', end: '18:00', enabled: true },
      { day: 'tuesday', start: '14:00', end: '18:00', enabled: false },
      { day: 'wednesday', start: '14:00', end: '18:00', enabled: true },
      { day: 'thursday', start: '14:00', end: '18:00', enabled: false },
      { day: 'friday', start: '14:00', end: '18:00', enabled: true },
      { day: 'saturday', start: '14:00', end: '18:00', enabled: false },
      { day: 'sunday', start: '10:00', end: '18:00', enabled: true },
    ];
  }
};

// Get the next occurrence of a specific day
export const getNextDayOccurrence = (dayNumber: number): Date => {
  const today = new Date();
  const currentDayNumber = getDay(today);
  
  // Calculate days to add
  const daysToAdd = (dayNumber + 7 - currentDayNumber) % 7;
  
  // If today is the target day and it's early enough, use today
  if (dayNumber === currentDayNumber && today.getHours() < 12) {
    return today;
  }
  
  // Otherwise, get the next occurrence
  return addDays(today, daysToAdd === 0 ? 7 : daysToAdd);
};
// Generate time slots for a booking
export const generateTimeSlots = async (): Promise<TimeSlot[]> => {
  const slots: TimeSlot[] = [];
  const today = startOfToday();
  
  // Get all booking schedules (both weekly and specific date overrides)
  const endDate = format(addDays(today, 28), 'yyyy-MM-dd');
  const { data: allSchedules, error } = await supabase
    .from('booking_schedules')
    .select('*')
    .or(`type.eq.weekly,and(type.eq.specific_date,date_override.gte.${format(today, 'yyyy-MM-dd')},date_override.lte.${endDate})`)
    .order('priority', { ascending: false }); // Higher priority first

  if (error) {
    console.error('Error fetching booking schedules:', error);
    return [];
  }

  const weeklySchedules = (allSchedules || []).filter(s => s.type === 'weekly');
  const specificSchedules = (allSchedules || []).filter(s => s.type === 'specific_date');
  
  // Group weekly schedules by day for easier lookup
  const weeklySchedulesByDay = new Map<BookingDay, BookingConfig[]>();
  weeklySchedules.forEach(schedule => {
    const dayName = schedule.day_name as BookingDay;
    if (!weeklySchedulesByDay.has(dayName)) {
      weeklySchedulesByDay.set(dayName, []);
    }
    weeklySchedulesByDay.get(dayName)!.push(schedule);
  });

  // Create a map for quick lookup of specific date overrides
  const specificScheduleMap = new Map<string, BookingConfig[]>();
  specificSchedules.forEach(schedule => {
    const dateKey = schedule.date_override!;
    if (!specificScheduleMap.has(dateKey)) {
      specificScheduleMap.set(dateKey, []);
    }
    specificScheduleMap.get(dateKey)!.push(schedule);
  });

  // Generate slots for the next 4 weeks, day by day chronologically
  for (let dayOffset = 0; dayOffset < 28; dayOffset++) {
    const currentDate = addDays(today, dayOffset);
    
    // Skip if date is in the past
    if (isBefore(currentDate, today)) {
      continue;
    }
    
    const dayOfWeek = getDay(currentDate);
    const formattedDate = format(currentDate, 'yyyy-MM-dd');
    const dayNames: BookingDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];
    
    // Get all weekly schedules for this day
    const dayWeeklySchedules = weeklySchedulesByDay.get(dayName) || [];
    
    // Create a map to track slot availability for this day
    const daySlots = new Map<string, boolean>();
    
    // First, generate all possible 30-minute slots for the day (00:00 to 23:30)
    // Initially mark all as unavailable
    for (let totalMinutes = 0; totalMinutes < 24 * 60; totalMinutes += 30) {
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      daySlots.set(timeString, false);
    }
    
    // Apply all enabled weekly schedules for this day
    for (const weeklySchedule of dayWeeklySchedules) {
      if (weeklySchedule.is_enabled) {
        const startHour = parseInt(weeklySchedule.start_time.split(':')[0]);
        const startMinute = parseInt(weeklySchedule.start_time.split(':')[1]);
        const endHour = parseInt(weeklySchedule.end_time.split(':')[0]);
        const endMinute = parseInt(weeklySchedule.end_time.split(':')[1]);
        
        const startTotalMinutes = startHour * 60 + startMinute;
        const endTotalMinutes = endHour * 60 + endMinute;
        
        // Mark slots within this weekly schedule as available
        for (let totalMinutes = startTotalMinutes; totalMinutes < endTotalMinutes; totalMinutes += 30) {
          const hour = Math.floor(totalMinutes / 60);
          const minute = totalMinutes % 60;
          const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          daySlots.set(timeString, true);
        }
      }
    }
    
    // Apply specific date overrides (sorted by priority, highest first)
    const specificOverrides = specificScheduleMap.get(formattedDate) || [];
    const sortedOverrides = specificOverrides.sort((a, b) => b.priority - a.priority);
    
    for (const override of sortedOverrides) {
      const startHour = parseInt(override.start_time.split(':')[0]);
      const startMinute = parseInt(override.start_time.split(':')[1]);
      const endHour = parseInt(override.end_time.split(':')[0]);
      const endMinute = parseInt(override.end_time.split(':')[1]);
      
      const startTotalMinutes = startHour * 60 + startMinute;
      const endTotalMinutes = endHour * 60 + endMinute;
      
      // Apply override to slots within its time range
      for (let totalMinutes = startTotalMinutes; totalMinutes < endTotalMinutes; totalMinutes += 30) {
        const hour = Math.floor(totalMinutes / 60);
        const minute = totalMinutes % 60;
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        // Set availability based on override's is_enabled status
        daySlots.set(timeString, override.is_enabled);
      }
    }
    
    // Add available slots to the final slots array
    const sunTimes = getSunTimesForDate(currentDate);
    for (const [timeString, isAvailable] of daySlots.entries()) {
      if (isAvailable) {
        const slotKey = `${formattedDate}-${timeString}`;
        const category = categorizTimeSlot(timeString, sunTimes);
        slots.push({
          id: slotKey,
          date: formattedDate,
          time: timeString,
          available: true,
          category
        });
      }
    }
  }
  
  // Check for existing bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('booking_date, booking_time')
    .is('deleted_at', null);
  
  if (bookings) {
    // Mark booked slots as unavailable
    for (const booking of bookings) {
      const bookedSlotIndex = slots.findIndex(
        slot => slot.date === booking.booking_date && slot.time === booking.booking_time
      );
      
      if (bookedSlotIndex !== -1) {
        slots[bookedSlotIndex].available = false;
      }
    }
  }
  
  // Sort slots chronologically and only return available slots
  slots.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.time.localeCompare(b.time);
  });
  
  // Only return available slots
  return slots.filter(slot => slot.available);
};

// Check if a specific date and time is available
export const checkSlotAvailability = async (date: string, time: string): Promise<boolean> => {
  try {
    // Get all relevant schedules for this date and time
    const targetDate = parseISO(date);
    const dayOfWeek = getDay(targetDate);
    const dayNames: BookingDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];

    const { data: schedules, error } = await supabase
      .from('booking_schedules')
      .select('*')
      .or(`and(type.eq.weekly,day_name.eq.${dayName}),and(type.eq.specific_date,date_override.eq.${date})`)
      .order('priority', { ascending: false }); // Higher priority first

    if (error) {
      console.error('Error checking booking schedules:', error);
      return false;
    }

    if (!schedules || schedules.length === 0) {
      return false; // No schedule found
    }

    // Start with unavailable by default
    let isAvailable = false;
    
    // Parse the target time
    const [timeHour, timeMinute] = time.split(':').map(Number);
    const timeInMinutes = timeHour * 60 + timeMinute;

    // First, check all weekly schedules for this day
    const weeklySchedules = schedules.filter(s => s.type === 'weekly');
    for (const weeklySchedule of weeklySchedules) {
      if (weeklySchedule.is_enabled) {
        const [startHour, startMinute] = weeklySchedule.start_time.split(':').map(Number);
        const [endHour, endMinute] = weeklySchedule.end_time.split(':').map(Number);
        
        const startInMinutes = startHour * 60 + startMinute;
        const endInMinutes = endHour * 60 + endMinute;
        
        // Check if time falls within any enabled weekly schedule range
        if (timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes) {
          isAvailable = true;
          break; // Found an available time range, no need to check others
        }
      }
    }

    // Then, apply specific date overrides (sorted by priority, highest first)
    const specificOverrides = schedules.filter(s => s.type === 'specific_date');
    const sortedOverrides = specificOverrides.sort((a, b) => b.priority - a.priority);
    
    for (const override of sortedOverrides) {
      const [startHour, startMinute] = override.start_time.split(':').map(Number);
      const [endHour, endMinute] = override.end_time.split(':').map(Number);
      
      const startInMinutes = startHour * 60 + startMinute;
      const endInMinutes = endHour * 60 + endMinute;
      
      // Check if time falls within this override's range
      if (timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes) {
        // Override takes precedence - set availability based on override's is_enabled
        isAvailable = override.is_enabled;
        break; // Higher priority override found, stop checking
      }
    }

    // If not available based on schedules, return false
    if (!isAvailable) {
      return false;
    }

    // Check for existing confirmed bookings
    const { data: existingBooking, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_date', date)
      .eq('booking_time', time)
      .is('deleted_at', null);

    if (bookingError) {
      console.error('Error checking existing bookings:', bookingError);
      return false;
    }

    // If there's an existing booking, slot is not available
    if (existingBooking && existingBooking.length > 0) {
      return false;
    }

    // All checks passed, slot is available
    return true;
  } catch (error) {
    console.error('Error in checkSlotAvailability:', error);
    return false;
  }
};