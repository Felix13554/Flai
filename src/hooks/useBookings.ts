import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Booking } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import toast from 'react-hot-toast';

export const useBookings = (userId?: string) => {
  const { loading: authLoading, isAdmin } = useAuth();
  const { bookings, bookingsLoading, bookingsError, refreshBookings } = useData();

  console.log('useBookings: Hook called with userId:', userId);
  console.log('useBookings: Current state - bookings:', bookings.length, 'loading:', bookingsLoading, 'error:', bookingsError);

  const sendAdminNotification = async (booking: Booking, productName: string) => {
    try {
      console.log('useBookings: Sending admin notification for booking:', booking.id);
      
      const notificationData = {
        bookingId: booking.id,
        productName: productName,
        bookingDate: booking.booking_date,
        bookingTime: booking.booking_time,
        address: booking.address,
        totalPrice: booking.price || 0,
        userEmail: booking.user_id, // This will be resolved in the edge function
        includeEditing: booking.include_editing || false,
        creditsUsed: booking.credits_used || 0
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-admin-booking-notification`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notificationData),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('useBookings: Failed to send admin notification:', errorText);
        // Don't throw here - we don't want to fail the booking creation
        toast.error('Booking created but admin notification failed');
        return;
      }

      const result = await response.json();
      console.log('useBookings: Admin notification sent successfully:', result);
      
      if (result.results?.sent > 0) {
        toast.success(`Booking created! ${result.results.sent} admin(s) notified.`);
      } else {
        toast.success('Booking created successfully!');
      }
    } catch (error) {
      console.error('useBookings: Error sending admin notification:', error);
      // Don't throw here - we don't want to fail the booking creation
      toast.error('Booking created but admin notification failed');
    }
  };

  const createBooking = async (newBooking: Omit<Booking, 'id' | 'created_at' | 'is_completed'>) => {
    try {
      console.log('useBookings: Creating new booking:', newBooking);
      const { data, error: insertError } = await supabase
        .from('bookings')
        .insert([{
          ...newBooking,
          is_completed: false
        }])
        .select()
        .single();

      if (insertError) {
        console.error('useBookings: Error creating booking:', insertError);
        throw insertError;
      }

      console.log('useBookings: Booking created successfully:', data);
      
      // Get product name for the notification
      const { data: product } = await supabase
        .from('products')
        .select('name')
        .eq('id', newBooking.product_id)
        .single();

      // Send admin notification (non-blocking)
      if (product) {
        sendAdminNotification(data, product.name);
      }

      await refreshBookings();
      return data;
    } catch (err: any) {
      console.error('useBookings: Error in createBooking:', err);
      throw err;
    }
  };

  const updateBooking = async (id: number, updates: Partial<Booking>) => {
    try {
      console.log('useBookings: Updating booking:', id, updates);
      const { error: updateError } = await supabase
        .from('bookings')
        .update(updates)
        .eq('id', id);

      if (updateError) {
        console.error('useBookings: Error updating booking:', updateError);
        throw updateError;
      }

      console.log('useBookings: Booking updated successfully');
      await refreshBookings();
    } catch (err: any) {
      console.error('useBookings: Error in updateBooking:', err);
      throw err;
    }
  };

  const markBookingComplete = async (id: number) => {
    console.log('useBookings: Marking booking complete:', id);
    return updateBooking(id, { is_completed: true });
  };

  const deleteBooking = async (id: number) => {
    try {
      console.log('useBookings: Deleting booking:', id);
      const { error: deleteError } = await supabase
        .from('bookings')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('useBookings: Error deleting booking:', deleteError);
        throw deleteError;
      }

      console.log('useBookings: Booking deleted successfully');
      await refreshBookings();
    } catch (err: any) {
      console.error('useBookings: Error in deleteBooking:', err);
      throw err;
    }
  };

  const updatePaymentStatus = async (id: number, paymentStatus: string, paymentMethod?: string, paymentIntentId?: string) => {
    const updates: Partial<Booking> = { payment_status: paymentStatus };
    
    if (paymentMethod) {
      updates.payment_method = paymentMethod;
    }
    
    if (paymentIntentId) {
      updates.payment_intent_id = paymentIntentId;
    }

    console.log('useBookings: Updating payment status:', id, updates);
    return updateBooking(id, updates);
  };

  // Filter bookings based on userId parameter
  const filteredBookings = userId 
    ? bookings.filter(booking => booking.user_id === userId)
    : bookings;

  console.log('useBookings: Filtered bookings:', filteredBookings.length, 'for userId:', userId);

  // Set up real-time subscription for bookings changes
  useEffect(() => {
    if (authLoading) return;

    console.log('useBookings: Setting up real-time subscription...');
    
    const channel = supabase
      .channel('bookings_changes_hook')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'bookings',
        filter: userId ? `user_id=eq.${userId}` : undefined
      }, (payload) => {
        console.log('useBookings: Real-time change detected:', payload);
        refreshBookings();
      })
      .subscribe();

    return () => {
      console.log('useBookings: Cleaning up real-time subscription...');
      supabase.removeChannel(channel);
    };
  }, [userId, authLoading, isAdmin, refreshBookings]);

  return {
    bookings: filteredBookings,
    loading: bookingsLoading,
    error: bookingsError,
    fetchBookings: refreshBookings,
    createBooking,
    updateBooking,
    markBookingComplete,
    deleteBooking,
    updatePaymentStatus
  };
};