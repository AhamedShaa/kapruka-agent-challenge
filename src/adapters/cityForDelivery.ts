import { resolveCityQuery } from '@/agent/cityResolver.js';
import type { CommercePort } from '@/core/ports/commerce.port.js';

export interface CityResolution {
  resolvedName: string | null;
  ambiguous: boolean;
  alternateNames: string[];
  reason: 'exact' | 'vernacular' | 'ambiguous-defaulted' | 'unknown';
  /** Populated only when reason === 'ambiguous-defaulted'. */
  suggestedDefault?: string;
}

function unknownResolution(): CityResolution {
  return { resolvedName: null, ambiguous: false, alternateNames: [], reason: 'unknown' };
}

export async function resolveCityForDelivery(
  userCity: string,
  adapter: CommercePort,
): Promise<CityResolution> {
  if (!userCity || userCity.trim() === '') {
    return unknownResolution();
  }

  const vernacularResolved = resolveCityQuery(userCity);
  const usedVernacular = vernacularResolved !== userCity;

  const cityList = await adapter.listDeliveryCities(vernacularResolved);
  const cities = cityList.cities;

  if (cities.length === 0) {
    return unknownResolution();
  }

  if (cities.length === 1) {
    return {
      resolvedName: cities[0].name,
      ambiguous: false,
      alternateNames: [],
      reason: usedVernacular ? 'vernacular' : 'exact',
    };
  }

  const allColombo = cities.every((city) => city.name.startsWith('Colombo '));
  const suggestedDefault = allColombo && cities.some((city) => city.name === 'Colombo 03')
    ? 'Colombo 03'
    : cities[0].name;

  return {
    resolvedName: null,
    ambiguous: true,
    alternateNames: cities.map((city) => city.name),
    reason: 'ambiguous-defaulted',
    suggestedDefault,
  };
}
