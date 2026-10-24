import 'server-only';

/**
 * Météo via Open-Meteo.
 * ⚠️ L'accès gratuit est réservé aux usages NON commerciaux. Pour Sillon (service
 * payant), renseignez OPEN_METEO_API_KEY : on passe alors par le serveur client
 * « customer-api » d'Open-Meteo. Voir README.
 */

export type DayForecast = {
  date: string;
  tMax: number;
  tMin: number;
  rainMm: number;
  windMaxKmh: number;
  code: number;
  /** Conditions favorables à un traitement : pas de pluie et vent ≤ 19 km/h (3 Beaufort). */
  sprayOk: boolean;
  frost: boolean;
};

export type Forecast = {
  current: { temperature: number; humidity: number; windKmh: number; code: number };
  days: DayForecast[];
};

/** Limite réglementaire : pas de traitement par vent supérieur à 3 Beaufort (19 km/h). */
export const SPRAY_MAX_WIND_KMH = 19;

export async function getForecast(lat: number, lon: number): Promise<Forecast | null> {
  const key = process.env.OPEN_METEO_API_KEY;
  const base = key ? 'https://customer-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast';
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code',
    timezone: 'Europe/Paris',
    forecast_days: '6',
  });
  if (key) params.set('apikey', key);

  try {
    // Mise en cache 30 min : la météo n'a pas besoin d'être plus fraîche.
    const res = await fetch(`${base}?${params}`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const j = await res.json();
    const days: DayForecast[] = j.daily.time.map((date: string, i: number) => {
      const rain = j.daily.precipitation_sum[i] ?? 0;
      const wind = j.daily.wind_speed_10m_max[i] ?? 0;
      const tMin = j.daily.temperature_2m_min[i];
      return {
        date,
        tMax: j.daily.temperature_2m_max[i],
        tMin,
        rainMm: rain,
        windMaxKmh: wind,
        code: j.daily.weather_code[i],
        sprayOk: rain < 0.5 && wind <= SPRAY_MAX_WIND_KMH,
        frost: tMin <= 0,
      };
    });
    return {
      current: {
        temperature: j.current.temperature_2m,
        humidity: j.current.relative_humidity_2m,
        windKmh: j.current.wind_speed_10m,
        code: j.current.weather_code,
      },
      days,
    };
  } catch {
    return null;
  }
}

/** Libellé simple à partir du code météo WMO. */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Ensoleillé';
  if (code <= 2) return 'Éclaircies';
  if (code === 3) return 'Couvert';
  if (code <= 48) return 'Brouillard';
  if (code <= 57) return 'Bruine';
  if (code <= 67) return 'Pluie';
  if (code <= 77) return 'Neige';
  if (code <= 82) return 'Averses';
  if (code <= 86) return 'Averses de neige';
  return 'Orage';
}
