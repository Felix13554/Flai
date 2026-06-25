import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Search, CheckCircle, XCircle, Building2 } from 'lucide-react';
import { isAddressWithinRange, getFormattedDistance } from '../utils/location';
import EditableContent from '../components/EditableContent';
import SEO from '../components/SEO';
import DenmarkCoverageMap from '../components/DenmarkCoverageMap';
import { useData } from '../contexts/DataContext';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Danish cities — sourced from public/dk.csv (simplemaps dataset)
// 173 cities with precise coordinates and real population figures
// ---------------------------------------------------------------------------
const DANISH_CITIES: Array<{ name: string; lat: number; lon: number; population: number }> = [
  { name: 'Copenhagen', lat: 55.6761, lon: 12.5683, population: 1366301 },
  { name: 'Aarhus', lat: 56.1572, lon: 10.2107, population: 290598 },
  { name: 'Odense', lat: 55.3958, lon: 10.3886, population: 182387 },
  { name: 'Aalborg', lat: 57.0500, lon: 9.9167, population: 143598 },
  { name: 'Esbjerg', lat: 55.4833, lon: 8.4500, population: 71921 },
  { name: 'Randers', lat: 56.4570, lon: 10.0390, population: 64057 },
  { name: 'Horsens', lat: 55.8583, lon: 9.8500, population: 63162 },
  { name: 'Kolding', lat: 55.4917, lon: 9.5000, population: 62338 },
  { name: 'Vejle', lat: 55.7167, lon: 9.5333, population: 61310 },
  { name: 'Roskilde', lat: 55.6500, lon: 12.0833, population: 52580 },
  { name: 'Herning', lat: 56.1333, lon: 8.9833, population: 51193 },
  { name: 'Silkeborg', lat: 56.1833, lon: 9.5517, population: 50866 },
  { name: 'Hørsholm', lat: 55.8803, lon: 12.5081, population: 47836 },
  { name: 'Helsingør', lat: 56.0361, lon: 12.6083, population: 47563 },
  { name: 'Næstved', lat: 55.2250, lon: 11.7583, population: 44996 },
  { name: 'Viborg', lat: 56.4333, lon: 9.4000, population: 42234 },
  { name: 'Fredericia', lat: 55.5667, lon: 9.7500, population: 41243 },
  { name: 'Køge', lat: 55.4561, lon: 12.1797, population: 38588 },
  { name: 'Holstebro', lat: 56.3572, lon: 8.6153, population: 37022 },
  { name: 'Taastrup', lat: 55.6500, lon: 12.3000, population: 36193 },
  { name: 'Hillerød', lat: 55.9333, lon: 12.3167, population: 36043 },
  { name: 'Slagelse', lat: 55.4049, lon: 11.3531, population: 34648 },
  { name: 'Holbæk', lat: 55.7156, lon: 11.7225, population: 29960 },
  { name: 'Sønderborg', lat: 54.9138, lon: 9.7922, population: 28137 },
  { name: 'Svendborg', lat: 55.0594, lon: 10.6083, population: 27594 },
  { name: 'Hjørring', lat: 57.4636, lon: 9.9814, population: 25917 },
  { name: 'Nørresundby', lat: 57.0667, lon: 9.9167, population: 23718 },
  { name: 'Ringsted', lat: 55.4425, lon: 11.7900, population: 23498 },
  { name: 'Frederikshavn', lat: 57.4410, lon: 10.5340, population: 22961 },
  { name: 'Haderslev', lat: 55.2428, lon: 9.5250, population: 22182 },
  { name: 'Birkerød', lat: 55.8333, lon: 12.4333, population: 20853 },
  { name: 'Farum', lat: 55.8083, lon: 12.3581, population: 20317 },
  { name: 'Skive', lat: 56.5667, lon: 9.0333, population: 20176 },
  { name: 'Nykøbing Falster', lat: 54.7654, lon: 11.8755, population: 20105 },
  { name: 'Skanderborg', lat: 56.0381, lon: 9.9253, population: 20079 },
  { name: 'Smørumnedre', lat: 55.7333, lon: 12.3000, population: 19780 },
  { name: 'Nyborg', lat: 55.3122, lon: 10.7897, population: 17900 },
  { name: 'Vordingborg', lat: 55.0000, lon: 11.9000, population: 17868 },
  { name: 'Solrød Strand', lat: 55.5167, lon: 12.2167, population: 17382 },
  { name: 'Frederikssund', lat: 55.8333, lon: 12.0666, population: 17135 },
  { name: 'Lillerød', lat: 55.8681, lon: 12.3417, population: 16836 },
  { name: 'Middelfart', lat: 55.4986, lon: 9.7444, population: 16546 },
  { name: 'Kalundborg', lat: 55.6814, lon: 11.0850, population: 16486 },
  { name: 'Ikast', lat: 56.1333, lon: 9.1500, population: 16215 },
  { name: 'Aabenraa', lat: 55.0444, lon: 9.4181, population: 15685 },
  { name: 'Hedehusene', lat: 55.6547, lon: 12.1953, population: 14868 },
  { name: 'Korsør', lat: 55.3336, lon: 11.1397, population: 14418 },
  { name: 'Grenaa', lat: 56.4161, lon: 10.8923, population: 14179 },
  { name: 'Varde', lat: 55.6200, lon: 8.4806, population: 14108 },
  { name: 'Rønne', lat: 55.0986, lon: 14.7014, population: 13798 },
  { name: 'Thisted', lat: 56.9569, lon: 8.6944, population: 13534 },
  { name: 'Værløse', lat: 55.7819, lon: 12.3731, population: 13203 },
  { name: 'Odder', lat: 55.9725, lon: 10.1497, population: 12914 },
  { name: 'Brønderslev', lat: 57.2694, lon: 9.9472, population: 12884 },
  { name: 'Frederiksværk', lat: 55.9667, lon: 12.0167, population: 12815 },
  { name: 'Hedensted', lat: 55.7725, lon: 9.7017, population: 12680 },
  { name: 'Nakskov', lat: 54.8333, lon: 11.1500, population: 12456 },
  { name: 'Dragør', lat: 55.5833, lon: 12.6667, population: 12327 },
  { name: 'Haslev', lat: 55.3333, lon: 11.9667, population: 12280 },
  { name: 'Hobro', lat: 56.6333, lon: 9.8000, population: 12191 },
  { name: 'Jyllinge', lat: 55.7511, lon: 12.1064, population: 10701 },
  { name: 'Lystrup', lat: 56.2353, lon: 10.2375, population: 10213 },
  { name: 'Vejen', lat: 55.4774, lon: 9.1379, population: 10206 },
  { name: 'Struer', lat: 56.4856, lon: 8.5897, population: 10112 },
  { name: 'Ringkøbing', lat: 56.0897, lon: 8.2383, population: 9975 },
  { name: 'Humlebæk', lat: 55.9611, lon: 12.5250, population: 9855 },
  { name: 'Støvring', lat: 56.8867, lon: 9.8286, population: 9190 },
  { name: 'Galten', lat: 56.1533, lon: 9.9069, population: 9177 },
  { name: 'Nykøbing Mors', lat: 56.7953, lon: 8.8592, population: 9068 },
  { name: 'Fredensborg', lat: 55.9750, lon: 12.4056, population: 8960 },
  { name: 'Helsinge', lat: 56.0222, lon: 12.1972, population: 8906 },
  { name: 'Sæby', lat: 57.3294, lon: 10.5322, population: 8836 },
  { name: 'Måløv', lat: 55.7500, lon: 12.3333, population: 8693 },
  { name: 'Aars', lat: 56.8032, lon: 9.5177, population: 8657 },
  { name: 'Løgten', lat: 56.1643, lon: 10.1857, population: 8651 },
  { name: 'Hundested', lat: 55.9667, lon: 11.8500, population: 8520 },
  { name: 'Hørning', lat: 56.0850, lon: 10.0364, population: 8474 },
  { name: 'Ribe', lat: 55.3283, lon: 8.7622, population: 8365 },
  { name: 'Hinnerup', lat: 56.2644, lon: 10.0633, population: 8351 },
  { name: 'Hadsten', lat: 56.3333, lon: 10.0500, population: 8345 },
  { name: 'Nivå', lat: 55.9336, lon: 12.5064, population: 8325 },
  { name: 'Sorø', lat: 55.4333, lon: 11.5667, population: 8271 },
  { name: 'Svenstrup', lat: 56.9767, lon: 9.8419, population: 7754 },
  { name: 'Tønder', lat: 54.9428, lon: 8.8639, population: 7574 },
  { name: 'Bjerringbro', lat: 56.3761, lon: 9.6565, population: 7524 },
  { name: 'Vojens', lat: 55.2483, lon: 9.3047, population: 7480 },
  { name: 'Ry', lat: 56.0922, lon: 9.7581, population: 7382 },
  { name: 'Ebeltoft', lat: 56.1936, lon: 10.6781, population: 7289 },
  { name: 'Bramming', lat: 55.4649, lon: 8.7068, population: 7171 },
  { name: 'Hammel', lat: 56.2567, lon: 9.8617, population: 7019 },
  { name: 'Fåborg', lat: 55.1000, lon: 10.2333, population: 6898 },
  { name: 'Lemvig', lat: 56.5500, lon: 8.3167, population: 6827 },
  { name: 'Slangerup', lat: 55.8467, lon: 12.1761, population: 6824 },
  { name: 'Gilleleje', lat: 56.1167, lon: 12.3167, population: 6778 },
  { name: 'Ringe', lat: 55.2375, lon: 10.4803, population: 6607 },
  { name: 'Aabybro', lat: 57.1500, lon: 9.7500, population: 6559 },
  { name: 'Skælskør', lat: 55.2539, lon: 11.2903, population: 6394 },
  { name: 'Børkop', lat: 55.6419, lon: 9.6519, population: 6353 },
  { name: 'Hornslet', lat: 56.3158, lon: 10.3167, population: 6328 },
  { name: 'Assens', lat: 55.2667, lon: 9.9000, population: 6061 },
  { name: 'Kerteminde', lat: 55.4500, lon: 10.6667, population: 6034 },
  { name: 'Bellinge', lat: 55.3350, lon: 10.3133, population: 5826 },
  { name: 'Hellebæk', lat: 56.0694, lon: 12.5556, population: 5816 },
  { name: 'Maribo', lat: 54.7747, lon: 11.5011, population: 5734 },
  { name: 'Nibe', lat: 56.9819, lon: 9.6397, population: 5539 },
  { name: 'Hirtshals', lat: 57.5833, lon: 9.9500, population: 5538 },
  { name: 'Munkebo', lat: 55.4602, lon: 10.5560, population: 5535 },
  { name: 'Tune', lat: 55.5936, lon: 12.1700, population: 5347 },
  { name: 'Otterup', lat: 55.5153, lon: 10.3986, population: 5258 },
  { name: 'Kjellerup', lat: 56.2847, lon: 9.4333, population: 5223 },
  { name: 'Fensmark', lat: 55.2778, lon: 11.8050, population: 5217 },
  { name: 'Mårslet', lat: 56.0681, lon: 10.1611, population: 5162 },
  { name: 'Klarup', lat: 57.0125, lon: 10.0597, population: 5158 },
  { name: 'Nykøbing Sjælland', lat: 55.9250, lon: 11.6667, population: 5049 },
  { name: 'Strøby Egede', lat: 55.4172, lon: 12.2431, population: 4984 },
  { name: 'Hadsund', lat: 56.7167, lon: 10.1167, population: 4983 },
  { name: 'Strib', lat: 55.5375, lon: 9.7725, population: 4858 },
  { name: 'Vodskov', lat: 57.1084, lon: 10.0272, population: 4821 },
  { name: 'Viby', lat: 55.5511, lon: 12.0228, population: 4814 },
  { name: 'Rudkøbing', lat: 54.9368, lon: 10.7097, population: 4622 },
  { name: 'Sakskøbing', lat: 54.8000, lon: 11.6333, population: 4590 },
  { name: 'Havdrup', lat: 55.5451, lon: 12.1165, population: 4392 },
  { name: 'Gråsten', lat: 54.9197, lon: 9.5919, population: 4365 },
  { name: 'Høng', lat: 55.5044, lon: 11.2919, population: 4359 },
  { name: 'Kirke Hvalsø', lat: 55.5942, lon: 11.8594, population: 4340 },
  { name: 'Jyderup', lat: 55.6600, lon: 11.3986, population: 4315 },
  { name: 'Svogerslev', lat: 55.6342, lon: 12.0136, population: 4313 },
  { name: 'Langeskov', lat: 55.3578, lon: 10.5856, population: 4293 },
  { name: 'Videbæk', lat: 56.0931, lon: 8.6325, population: 4256 },
  { name: 'Tarm', lat: 55.9067, lon: 8.5206, population: 4104 },
  { name: 'Bogense', lat: 55.5667, lon: 10.1000, population: 4074 },
  { name: 'Dianalund', lat: 55.5272, lon: 11.4981, population: 4057 },
  { name: 'Juelsminde', lat: 55.7081, lon: 10.0008, population: 4023 },
  { name: 'Brædstrup', lat: 55.9715, lon: 9.6113, population: 4005 },
  { name: 'Løgstør', lat: 56.9667, lon: 9.2583, population: 3972 },
  { name: 'Præstø', lat: 55.1206, lon: 12.0436, population: 3893 },
  { name: 'Assentoft', lat: 56.4407, lon: 10.1487, population: 3822 },
  { name: 'Virklund', lat: 56.1306, lon: 9.5592, population: 3683 },
  { name: 'Nexø', lat: 55.0625, lon: 15.1319, population: 3674 },
  { name: 'Store Heddinge', lat: 55.3089, lon: 12.3873, population: 3649 },
  { name: 'Gistrup', lat: 56.9978, lon: 9.9933, population: 3630 },
  { name: 'Hjortshøj', lat: 56.2478, lon: 10.2647, population: 3619 },
  { name: 'Taulov', lat: 55.5406, lon: 9.6111, population: 3513 },
  { name: 'Storvorde', lat: 57.0000, lon: 10.0833, population: 3431 },
  { name: 'Sabro', lat: 56.2117, lon: 10.0367, population: 3308 },
  { name: 'Rønde', lat: 56.3000, lon: 10.4833, population: 3295 },
  { name: 'Thurø By', lat: 55.0425, lon: 10.6822, population: 3232 },
  { name: 'Nørre Åby', lat: 55.4578, lon: 9.8775, population: 3224 },
  { name: 'Trige', lat: 56.2530, lon: 10.1480, population: 3224 },
  { name: 'Vallensbæk Strand', lat: 55.6361, lon: 12.3642, population: 456 },
  { name: 'Frederiksberg', lat: 55.6785, lon: 12.5221, population: 0 },
  { name: 'Søborg', lat: 55.7302, lon: 12.5098, population: 0 },
  { name: 'Hvidovre', lat: 55.6503, lon: 12.4758, population: 0 },
  { name: 'Rødovre', lat: 55.6827, lon: 12.4644, population: 0 },
  { name: 'Charlottenlund', lat: 55.7537, lon: 12.5918, population: 0 },
  { name: 'Herlev', lat: 55.7235, lon: 12.4404, population: 0 },
  { name: 'Kongens Lyngby', lat: 55.7718, lon: 12.5060, population: 0 },
  { name: 'Ballerup', lat: 55.7198, lon: 12.3520, population: 0 },
  { name: 'Glostrup', lat: 55.6666, lon: 12.4038, population: 0 },
  { name: 'Brøndby', lat: 55.6541, lon: 12.4215, population: 0 },
  { name: 'Albertslund', lat: 55.6623, lon: 12.3351, population: 0 },
  { name: 'Ishøj', lat: 55.6184, lon: 12.3281, population: 0 },
  { name: 'Allerød', lat: 55.8703, lon: 12.3574, population: 0 },
  { name: 'Holte', lat: 55.8167, lon: 12.4667, population: 0 },
  { name: 'Greve', lat: 55.5966, lon: 12.2492, population: 0 },
  { name: 'Kokkedal', lat: 55.9098, lon: 12.5152, population: 0 },
  { name: 'Kastrup', lat: 55.6352, lon: 12.6489, population: 0 },
  { name: 'Stenløse', lat: 55.7677, lon: 12.1960, population: 0 },
  { name: 'Ærøskøbing', lat: 54.8912, lon: 10.4083, population: 0 },
  { name: 'Grindsted', lat: 55.7540, lon: 8.9123, population: 0 },
  { name: 'Højby', lat: 55.9115, lon: 11.5976, population: 0 },
  { name: 'Tranebjerg', lat: 55.8326, lon: 10.5972, population: 0 },
  { name: 'Byrum', lat: 57.2568, lon: 10.9974, population: 0 },
];

// Haversine distance in km
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const CoverageAreasPage: React.FC = () => {
  const { addressZones, getContent } = useData();
  const [address, setAddress] = useState('');
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    distance?: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [selectedZone, setSelectedZone] = useState<any>(null);
  const [zoneCoordinates, setZoneCoordinates] = useState<{ [key: string]: { lat: number; lon: number } }>({});

  const TOMTOM_API_KEY = import.meta.env.VITE_TOMTOM_API_KEY;

  // Auto-resolve zone coordinates on load using built-in known coords
  // so the map shows coverage circles immediately without needing a click.
  React.useEffect(() => {
    if (addressZones.length === 0) return;
    const KNOWN: Record<string, { lat: number; lon: number }> = {
      'kolding':    { lat: 55.4904, lon: 9.4720 },
      'vejle':      { lat: 55.7113, lon: 9.5360 },
      'fredericia': { lat: 55.5658, lon: 9.7527 },
      'horsens':    { lat: 55.8606, lon: 9.8502 },
      'odense':     { lat: 55.3959, lon: 10.3884 },
      'esbjerg':    { lat: 55.4765, lon: 8.4594 },
      'aarhus':     { lat: 56.1629, lon: 10.2039 },
      'copenhagen': { lat: 55.6761, lon: 12.5683 },
      'københavn':  { lat: 55.6761, lon: 12.5683 },
      'aalborg':    { lat: 57.0488, lon: 9.9217 },
      'sønderborg': { lat: 54.9138, lon: 9.7922 },
      'haderslev':  { lat: 55.2428, lon: 9.4953 },
      'aabenraa':   { lat: 55.0444, lon: 9.4181 },
      'tønder':     { lat: 54.9428, lon: 8.8639 },
      'middelfart': { lat: 55.4986, lon: 9.7444 },
      'hedensted':  { lat: 55.7725, lon: 9.7017 },
      'vejen':      { lat: 55.4774, lon: 9.1379 },
      'vojens':     { lat: 55.2483, lon: 9.3047 },
      'børkop':     { lat: 55.6419, lon: 9.6519 },
      'strib':      { lat: 55.5375, lon: 9.7725 },
      'bogense':    { lat: 55.5667, lon: 10.1000 },
      'juelsminde': { lat: 55.7081, lon: 10.0008 },
      'taulov':     { lat: 55.5406, lon: 9.6111 },
      'nørre åby':  { lat: 55.4578, lon: 9.8775 },
      'silkeborg':  { lat: 56.1833, lon: 9.5517 },
      'herning':    { lat: 56.1333, lon: 8.9833 },
      'viborg':     { lat: 56.4333, lon: 9.4000 },
      'randers':    { lat: 56.4570, lon: 10.0390 },
      'sdr vilstrupvej': { lat: 55.5658, lon: 9.7527 },
    };
    const resolved: Record<string, { lat: number; lon: number }> = {};
    addressZones.forEach(zone => {
      const lower = zone.center_address.toLowerCase();
      for (const [key, coords] of Object.entries(KNOWN)) {
        if (lower.includes(key)) { resolved[zone.id] = coords; break; }
      }
    });
    if (Object.keys(resolved).length > 0) {
      setZoneCoordinates(prev => ({ ...resolved, ...prev }));
    }
  }, [addressZones]);

  // Pure local computation — zero API calls, instant, always complete
  const allCities = useMemo(() => {
    if (addressZones.length === 0 || Object.keys(zoneCoordinates).length === 0) return [];

    const seen = new Map<string, number>();

    addressZones.forEach(zone => {
      const coords = zoneCoordinates[zone.id];
      if (!coords) return;

      DANISH_CITIES.forEach(city => {
        const dist = calculateDistance(coords.lat, coords.lon, city.lat, city.lon);
        if (dist <= zone.radius_km) {
          const existing = seen.get(city.name);
          if (!existing || city.population > existing) {
            seen.set(city.name, city.population);
          }
        }
      });
    });

    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [addressZones, zoneCoordinates]);

  const handleAddressCheck = async () => {
    if (!address.trim()) {
      toast.error('Indtast venligst en adresse');
      return;
    }

    setChecking(true);
    setValidationResult(null);

    try {
      const isValid = await isAddressWithinRange(address);
      const distance = await getFormattedDistance(address);
      setValidationResult({ isValid, distance });
      if (!isValid) toast.error(`Adressen er ${distance} fra vores base`);
    } catch (err) {
      console.error('Error validating address:', err);
      toast.error('Kunne ikke validere adressen');
    } finally {
      setChecking(false);
    }
  };

  const handleZoneClick = async (zone: any) => {
    setSelectedZone(zone);
    if (!zoneCoordinates[zone.id]) {
      try {
        const response = await fetch(
          `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(zone.center_address)}.json?key=${TOMTOM_API_KEY}&language=da-DK`
        );
        const data = await response.json();
        if (data.results?.length > 0) {
          const { lat, lon } = data.results[0].position;
          setZoneCoordinates(prev => ({ ...prev, [zone.id]: { lat, lon } }));
        }
      } catch (error) {
        console.error('Error geocoding address:', error);
        toast.error('Kunne ikke finde adressen');
      }
    }
  };

  // Geocode zone centers in parallel — only used for map display, not city lookup
  useEffect(() => {
    if (addressZones.length === 0 || !TOMTOM_API_KEY) return;

    const geocodeAllZones = async () => {
      const results = await Promise.all(
        addressZones.map(async zone => {
          try {
            const response = await fetch(
              `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(zone.center_address)}.json?key=${TOMTOM_API_KEY}&language=da-DK`
            );
            const data = await response.json();
            if (data.results?.length > 0) {
              const { lat, lon } = data.results[0].position;
              return { id: zone.id, lat, lon };
            }
          } catch (error) {
            console.error(`Error geocoding zone ${zone.id}:`, error);
          }
          return null;
        })
      );

      const newCoords: { [key: string]: { lat: number; lon: number } } = {};
      results.forEach(r => { if (r) newCoords[r.id] = { lat: r.lat, lon: r.lon }; });
      setZoneCoordinates(newCoords);
    };

    geocodeAllZones();
  }, [addressZones, TOMTOM_API_KEY]);

  const getMapUrl = (zone: any) => {
    const coords = zoneCoordinates[zone.id];
    if (!coords) return null;
    let zoom = 11;
    if (zone.radius_km > 20) zoom = 9;
    else if (zone.radius_km > 10) zoom = 10;
    else if (zone.radius_km > 5) zoom = 11;
    else zoom = 12;
    return `https://api.tomtom.com/map/1/staticimage?key=${TOMTOM_API_KEY}&zoom=${zoom}&center=${coords.lon},${coords.lat}&width=1024&height=576&format=png&layer=basic&style=main&view=Unified&language=da-DK`;
  };

  const getCircleRadius = (zone: any) => {
    if (!zoneCoordinates[zone.id]) return 0;
    let zoom = 11;
    if (zone.radius_km > 20) zoom = 9;
    else if (zone.radius_km > 10) zoom = 10;
    else if (zone.radius_km > 5) zoom = 11;
    else zoom = 12;
    const metersPerPixel = 156543.03392 * Math.cos(zoneCoordinates[zone.id].lat * Math.PI / 180) / Math.pow(2, zoom);
    const radiusInPixels = (zone.radius_km * 1000) / metersPerPixel;
    return (radiusInPixels / 576) * 100;
  };

  return (
    <div className="pt-20 pb-16">
      <SEO
        title={getContent('coverage-page-title', "Dækningsområder")}
        description="Se om Flai dækker dit område. Vi flyver dronefoto og dronefilm i hele Danmark. Tjek din adresse og book din drone-session online."
        canonical="/coverage"
      />
      <div className="bg-primary/10 py-12 mb-12">
        <div className="container">
          <EditableContent
            contentKey="coverage-page-title"
            as="h1"
            className="text-3xl md:text-4xl font-bold text-center mb-4"
            fallback="Dækningsområder"
          />
          <EditableContent
            contentKey="coverage-page-subtitle"
            as="p"
            className="text-center text-lg text-neutral-300 max-w-2xl mx-auto"
            fallback="Vi tilbyder droneoptagelser i følgende områder. Kontakt os hvis du har spørgsmål om dækning i dit område."
          />
        </div>
      </div>
      <div className="container">
        <div className="max-w-4xl mx-auto">

          {/* Address Checker */}
          <div className="bg-neutral-800 rounded-xl p-6 mb-8 border border-neutral-700">
            <EditableContent
              contentKey="coverage-check-title"
              as="h2"
              className="text-xl font-semibold mb-4"
              fallback="Check din adresse"
            />
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400" size={20} />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Indtast din adresse"
                    className="form-input pl-10"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddressCheck()}
                  />
                </div>
              </div>
              <button
                onClick={handleAddressCheck}
                disabled={checking || !address.trim()}
                className="btn-primary flex items-center justify-center min-w-[150px]"
              >
                {checking ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    <EditableContent contentKey="coverage-checking-text" fallback="Checker..." />
                  </>
                ) : (
                  <>
                    <Search size={20} className="mr-2" />
                    <EditableContent contentKey="coverage-check-button" fallback="Check dækning" />
                  </>
                )}
              </button>
            </div>

            {validationResult && (
              <div className={`mt-4 p-4 rounded-lg flex items-start ${
                validationResult.isValid ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
              }`}>
                {validationResult.isValid
                  ? <CheckCircle size={20} className="mr-2 flex-shrink-0 mt-1" />
                  : <XCircle size={20} className="mr-2 flex-shrink-0 mt-1" />
                }
                <div>
                  {validationResult.isValid ? (
                    <>
                      <EditableContent contentKey="coverage-valid-title" as="p" className="font-medium" fallback="Vi dækker denne adresse" />
                      <EditableContent contentKey="coverage-valid-subtitle" as="p" className="text-sm mt-1 opacity-80" fallback="Du kan nu gå videre til at booke din droneoptagelse" />
                    </>
                  ) : (
                    <>
                      <EditableContent contentKey="coverage-invalid-title" as="p" className="font-medium" fallback="Vi dækker ikke denne adresse" />
                      <p className="text-sm mt-1 opacity-80"><EditableContent contentKey="coverage-areas-page-adressen-er" fallback="Adressen er" /> {validationResult.distance} <EditableContent contentKey="coverage-areas-page-fra-vores-base" fallback="fra vores base" /></p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cities Section */}
          {addressZones.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3 ml-1">
                <Building2 size={16} className="text-neutral-500" />
                <EditableContent
                  contentKey="coverage-cities-title"
                  as="h3"
                  className="text-sm uppercase tracking-wider text-neutral-500 font-semibold"
                  fallback="Vi dækker"
                />
              </div>
              <div className="bg-neutral-800 border border-neutral-700 p-6 rounded-xl">
                {allCities.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allCities.map((city, index) => (
                      <span
                        key={index}
                        className="bg-neutral-700/50 text-neutral-300 px-3 py-1.5 rounded-md text-sm border border-neutral-600 hover:border-neutral-500 hover:text-white transition-colors cursor-default"
                      >
                        {city}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-neutral-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-neutral-500"></div>
                    <p className="italic text-sm"><EditableContent contentKey="coverage-areas-page-henter-omraadedata" fallback="Henter områdedata..." /></p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Denmark Coverage Map Section */}
          <div className="bg-neutral-800 rounded-xl p-6 mb-8 border border-neutral-700">
            <div className="flex items-center justify-between mb-4">
              <EditableContent
                contentKey="coverage-map-title"
                as="h2"
                className="text-xl font-semibold"
                fallback="Dækningskort"
              />
              {addressZones.length > 0 && (
                <span className="text-xs text-neutral-400 bg-neutral-700 px-3 py-1 rounded-full">
                  {addressZones.length} <EditableContent contentKey="coverage-areas-page-zone" fallback="zone" />{addressZones.length !== 1 ? 'r' : ''}
                </span>
              )}
            </div>
            <div className="flex justify-center">
              <div className="w-full max-w-sm">
                <DenmarkCoverageMap
                  zones={addressZones}
                  zoneCoordinates={zoneCoordinates}
                  variant="page"
                  primaryColor="var(--primary, #9b1c2e)"
                />
              </div>
            </div>
            {addressZones.length === 0 && (
              <p className="text-center text-neutral-500 text-sm mt-3 italic">
                <EditableContent contentKey="coverage-areas-page-ingen-aktive-daekningszoner-endnu" fallback="Ingen aktive dækningszoner endnu" />
              </p>
            )}
          </div>

          {/* Zone List Section */}
          <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700">
            <EditableContent
              contentKey="coverage-zones-title"
              as="h2"
              className="text-xl font-semibold mb-4"
              fallback="Aktive Dækningsområder"
            />
            {addressZones.length === 0 ? (
              <EditableContent
                contentKey="coverage-no-zones"
                as="p"
                className="text-center text-neutral-400 py-8"
                fallback="Ingen aktive dækningsområder fundet"
              />
            ) : (
              <div className="space-y-4">
                {addressZones.map(zone => (
                  <div
                    key={zone.id}
                    className={`flex items-start space-x-3 p-4 rounded-lg cursor-pointer transition-colors ${
                      selectedZone?.id === zone.id
                        ? 'bg-primary/10 border border-primary'
                        : 'bg-neutral-700/20 border border-transparent hover:border-neutral-600'
                    }`}
                    onClick={() => handleZoneClick(zone)}
                  >
                    <MapPin className="text-primary mt-1" size={20} />
                    <div className="flex-1">
                      <h3 className="font-medium">{zone.name}</h3>
                      <p className="text-neutral-400 mt-1"><EditableContent contentKey="coverage-areas-page-centrum" fallback="Centrum:" /> {zone.center_address}</p>
                      <p className="text-neutral-400"><EditableContent contentKey="coverage-areas-page-radius" fallback="Radius:" /> {zone.radius_km} <EditableContent contentKey="coverage-areas-page-km" fallback="km" /></p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoverageAreasPage;
