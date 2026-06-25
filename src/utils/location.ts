import { getDistance } from 'geolib';
import { supabase } from './supabase';

export const isAddressWithinRange = async (address: string): Promise<boolean> => {
  try {
    // Get all active zones
    const { data: zones, error } = await supabase
      .from('address_zones')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    if (!zones || zones.length === 0) return false;

    // Geocode the target address
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
    );
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      throw new Error('Address not found');
    }

    const targetLocation = {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon)
    };

    // Check if the address is within any active zone
    for (const zone of zones) {
      // Geocode the zone's center address
      const zoneResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(zone.center_address)}`
      );
      
      const zoneData = await zoneResponse.json();
      
      if (!zoneData || zoneData.length === 0) continue;

      const zoneCenter = {
        latitude: parseFloat(zoneData[0].lat),
        longitude: parseFloat(zoneData[0].lon)
      };

      const distance = getDistance(zoneCenter, targetLocation);

      if (distance <= zone.radius_km * 1000) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking address range:', error);
    return false;
  }
};

export const getFormattedDistance = async (address: string): Promise<string> => {
  try {
    // Get the first active zone
    const { data: zones, error } = await supabase
      .from('address_zones')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error) throw error;
    if (!zones) return 'N/A';

    // Geocode both addresses
    const [addressResponse, zoneResponse] = await Promise.all([
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`),
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(zones.center_address)}`)
    ]);
    
    const [addressData, zoneData] = await Promise.all([
      addressResponse.json(),
      zoneResponse.json()
    ]);
    
    if (!addressData?.[0] || !zoneData?.[0]) {
      throw new Error('Could not geocode addresses');
    }

    const targetLocation = {
      latitude: parseFloat(addressData[0].lat),
      longitude: parseFloat(addressData[0].lon)
    };

    const zoneCenter = {
      latitude: parseFloat(zoneData[0].lat),
      longitude: parseFloat(zoneData[0].lon)
    };

    const distance = getDistance(zoneCenter, targetLocation);

    return `${(distance / 1000).toFixed(1)} km`;
  } catch (error) {
    console.error('Error calculating distance:', error);
    return 'N/A';
  }
};