import { useState, useEffect } from 'react';
import { getDistance } from 'geolib';
import { supabase } from '../utils/supabase';

interface CoverageState {
  loading: boolean;
  covered: boolean;
  cityName: string | null;
  error: Error | null;
}

interface IpLocation {
  lat: number;
  lon: number;
  city: string;
}

const fetchWithTimeout = async (url: string, timeoutMs = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

async function isCoordinateWithinRange(lat: number, lon: number): Promise<boolean> {
  try {
    const { data: zones, error } = await supabase
      .from('address_zones')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    if (!zones || zones.length === 0) return false;

    const targetLocation = { latitude: lat, longitude: lon };

    for (const zone of zones) {
      const zoneResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(zone.center_address)}`
      );
      const zoneData = await zoneResponse.json();
      if (!zoneData || zoneData.length === 0) continue;

      const zoneCenter = {
        latitude: parseFloat(zoneData[0].lat),
        longitude: parseFloat(zoneData[0].lon),
      };

      const distance = getDistance(zoneCenter, targetLocation);
      if (distance <= zone.radius_km * 1000) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error('Error checking coordinate range:', err);
    return false;
  }
}

async function fetchIpLocation(): Promise<IpLocation> {
  // 1. Check Session Storage first to minimize API calls
  const cachedLocation = sessionStorage.getItem('user_ip_location');
  if (cachedLocation) {
    try {
      const parsed = JSON.parse(cachedLocation);
      if (parsed.lat && parsed.lon && parsed.city) {
        return parsed;
      }
    } catch (e) {
      sessionStorage.removeItem('user_ip_location');
    }
  }

  const saveAndReturn = (loc: IpLocation) => {
    sessionStorage.setItem('user_ip_location', JSON.stringify(loc));
    return loc;
  };

  try {
    // IMPORTANT: Free tier only supports HTTP. 
    // If your site uses HTTPS, replace this URL with your HTTPS Pro endpoint.
    // e.g., 'https://pro.ip-api.com/json/?key=YOUR_API_KEY&fields=status,message,city,lat,lon'
    const endpoint = 'http://ip-api.com/json/?fields=status,message,city,lat,lon';
    
    // Increased timeout slightly to ensure it completes
    const res = await fetchWithTimeout(endpoint, 5000); 
    
    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status}`);
    }

    const d = await res.json();

    if (d.status === 'success' && d.city && d.lat != null && d.lon != null) {
      return saveAndReturn({ lat: d.lat, lon: d.lon, city: d.city });
    } else {
      // The API returns a "message" field if status is "fail" (e.g., rate limited, private IP)
      throw new Error(`ip-api error: ${d.message || 'Invalid data returned'}`);
    }
  } catch (err) {
    console.error('IP Geolocation failed:', err);
    throw new Error('Failed to determine location via IP');
  }
}

export function useIpCoverage() {
  const [state, setState] = useState<CoverageState>({
    loading: true,
    covered: false,
    cityName: null,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    async function checkCoverage() {
      try {
        const { lat, lon, city } = await fetchIpLocation();
        const isCovered = await isCoordinateWithinRange(lat, lon);

        if (mounted) {
          setState({
            loading: false,
            covered: isCovered,
            cityName: city,
            error: null,
          });
        }
      } catch (error) {
        if (mounted) {
          setState({
            loading: false,
            covered: false,
            cityName: null,
            error: error instanceof Error ? error : new Error('Unknown error'),
          });
        }
      }
    }

    checkCoverage();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
