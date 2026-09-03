import SunCalc from 'suncalc';

interface SunTimes {
  sunrise: Date | undefined;
  sunriseEnd: Date | undefined;
  goldenHourEnd: Date | undefined;
  goldenHour: Date | undefined;
  sunset: Date | undefined;
  sunsetStart: Date | undefined;
}

const LOCATION = {
  lat: 55.6761,
  lng: 12.5883
};

export function getSunTimesForDate(date: Date): SunTimes {
  const times = SunCalc.getTimes(date, LOCATION.lat, LOCATION.lng) as unknown as SunTimes;

  return {
    sunrise: times.sunrise,
    sunriseEnd: times.sunriseEnd,
    goldenHourEnd: times.goldenHourEnd,
    goldenHour: times.goldenHour,
    sunset: times.sunset,
    sunsetStart: times.sunsetStart
  };
}

export function formatTime(date: Date | undefined): string {
  if (!date || isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toLocaleString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function timeRangeString(startDate: Date | undefined, endDate: Date | undefined): string {
  const start = formatTime(startDate);
  const end = formatTime(endDate);

  if (start === 'N/A' && end === 'N/A') {
    return 'Tid ikke tilgængelig i dag (f.eks. midnatssol)';
  }

  return `${start} til ${end}`;
}

export function addMinutes(date: Date | undefined, minutes: number): Date | undefined {
  if (!date || isNaN(date.getTime())) {
    return undefined;
  }
  return new Date(date.getTime() + minutes * 60000);
}

export function getTimeSlotsDividedByThree(start: Date | undefined, end: Date | undefined): [Date | undefined, Date | undefined, Date | undefined] {
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return [undefined, undefined, undefined];
  }

  const durationMs = end.getTime() - start.getTime();
  const thirdDurationMs = durationMs / 3;

  const firstDivision = new Date(start.getTime() + thirdDurationMs);
  const secondDivision = new Date(start.getTime() + 2 * thirdDurationMs);

  return [firstDivision, secondDivision, end];
}

export type TimeCategory = 'night' | 'sunrise' | 'daytime' | 'sunset';

interface TimeInfo {
  hour: number;
  minute: number;
  totalMinutes: number;
}

function parseTimeString(timeStr: string): TimeInfo {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return {
    hour: hours,
    minute: minutes,
    totalMinutes: hours * 60 + minutes
  };
}

function dateToMinutes(date: Date | undefined): number | undefined {
  if (!date || isNaN(date.getTime())) {
    return undefined;
  }
  return date.getHours() * 60 + date.getMinutes();
}

export function categorizTimeSlot(timeString: string, sunTimes: SunTimes): TimeCategory {
  const timeInfo = parseTimeString(timeString);

  const sunriseMinutes = dateToMinutes(sunTimes.sunrise);
  const sunriseEndMinutes = dateToMinutes(sunTimes.sunriseEnd);
  const goldenHourEndMinutes = dateToMinutes(sunTimes.goldenHourEnd);
  const goldenHourMinutes = dateToMinutes(sunTimes.goldenHour);
  const sunsetMinutes = dateToMinutes(sunTimes.sunset);
  const sunsetStartMinutes = dateToMinutes(sunTimes.sunsetStart);

  // If sun times are unavailable (e.g., midnight sun), categorize based on time
  if (!sunriseEndMinutes || !sunsetStartMinutes) {
    if (timeInfo.totalMinutes >= 6 * 60 && timeInfo.totalMinutes < 22 * 60) {
      return 'daytime';
    }
    return 'night';
  }

  // Sunrise: from sunrise to golden hour end
  if (sunriseMinutes !== undefined && goldenHourEndMinutes !== undefined &&
      timeInfo.totalMinutes >= sunriseMinutes && timeInfo.totalMinutes < goldenHourEndMinutes) {
    return 'sunrise';
  }

  // Daytime: from golden hour end to golden hour start
  if (goldenHourEndMinutes !== undefined && goldenHourMinutes !== undefined &&
      timeInfo.totalMinutes >= goldenHourEndMinutes && timeInfo.totalMinutes < goldenHourMinutes) {
    return 'daytime';
  }

  // Sunset: from golden hour start to sunset
  if (goldenHourMinutes !== undefined && sunsetMinutes !== undefined &&
      timeInfo.totalMinutes >= goldenHourMinutes && timeInfo.totalMinutes < sunsetMinutes) {
    return 'sunset';
  }

  // Night: everything else
  return 'night';
}
