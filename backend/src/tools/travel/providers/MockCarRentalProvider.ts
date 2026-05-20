import { ToolResult } from '../../../types/tools';
import { CarRentalProvider, CarRentalSearchParams, CarRentalOffer } from './CarRentalProvider';

function seededRand(seed: string, offset = 0): number {
  let h = offset + 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296);
}

const RENTAL_COMPANIES = ['Hertz', 'Avis', 'Enterprise', 'Budget', 'Sixt', 'Europcar', 'National', 'Alamo'];

const CAR_CLASSES: Record<string, { models: string[]; seats: number; basePrice: number }> = {
  economy: { models: ['Toyota Yaris', 'Kia Rio', 'Hyundai i20', 'Ford Fiesta'], seats: 5, basePrice: 35 },
  compact: { models: ['Toyota Corolla', 'VW Golf', 'Honda Civic', 'Nissan Sentra'], seats: 5, basePrice: 50 },
  midsize: { models: ['Toyota Camry', 'Ford Fusion', 'Mazda 6', 'Hyundai Sonata'], seats: 5, basePrice: 70 },
  suv: { models: ['Toyota RAV4', 'Ford Explorer', 'Jeep Cherokee', 'Nissan Rogue'], seats: 7, basePrice: 95 },
  luxury: { models: ['BMW 5 Series', 'Mercedes E-Class', 'Audi A6', 'Lexus ES'], seats: 5, basePrice: 150 },
  van: { models: ['Ford Transit', 'Mercedes Vito', 'VW Transporter', 'Dodge Grand Caravan'], seats: 8, basePrice: 110 },
};

const INCLUDES = ['Unlimited mileage', 'Basic insurance', 'Roadside assistance', 'Airport surcharge included'];
const EXTRAS = ['GPS navigation', 'Child seat', 'Additional driver', 'Full coverage insurance', 'Snow chains', 'Wi-Fi hotspot'];

export class MockCarRentalProvider implements CarRentalProvider {
  async search(params: CarRentalSearchParams): Promise<ToolResult> {
    const { city, pickupDate, returnDate, carClass, maxResults } = params;

    const pickupDt = new Date(pickupDate);
    const returnDt = new Date(returnDate);
    const days = Math.max(1, Math.round((returnDt.getTime() - pickupDt.getTime()) / 86400000));

    const seed = `${city.toLowerCase()}${pickupDate}${returnDate}`;
    const classes = carClass ? [carClass] : Object.keys(CAR_CLASSES);
    const count = Math.min(maxResults, 6);
    const offers: CarRentalOffer[] = [];

    for (let i = 0; i < RENTAL_COMPANIES.length && offers.length < count * 2; i++) {
      const classKey = classes[Math.floor(seededRand(seed, i * 7) * classes.length)];
      const classData = CAR_CLASSES[classKey];

      const priceVariance = 0.85 + seededRand(seed, i * 11 + 1) * 0.4;
      const pricePerDay = Math.round(classData.basePrice * priceVariance);
      const totalPrice = pricePerDay * days;

      const modelIdx = Math.floor(seededRand(seed, i * 13 + 2) * classData.models.length);
      const companyIdx = Math.floor(seededRand(seed, i * 17 + 3) * RENTAL_COMPANIES.length);

      const includedCount = 2 + Math.floor(seededRand(seed, i * 5 + 4) * 3);
      const includes = INCLUDES.slice(0, includedCount);

      const extraCount = Math.floor(seededRand(seed, i * 3 + 5) * 3);
      const extras: string[] = [];
      for (let j = 0; j < extraCount; j++) {
        const extIdx = Math.floor(seededRand(seed, i * 19 + j * 7) * EXTRAS.length);
        if (!extras.includes(EXTRAS[extIdx])) extras.push(EXTRAS[extIdx]);
      }

      offers.push({
        company: RENTAL_COMPANIES[companyIdx],
        carModel: classData.models[modelIdx],
        carClass: classKey,
        seats: classData.seats,
        transmission: seededRand(seed, i * 23 + 6) > 0.3 ? 'automatic' : 'manual',
        pricePerDay,
        totalPrice,
        currency: 'USD',
        includes,
        extras,
        freeCancellation: seededRand(seed, i * 29 + 7) > 0.4,
        pickupLocation: `${city} Airport / City Center`,
      });
    }

    offers.sort((a, b) => a.pricePerDay - b.pricePerDay);

    return {
      success: true,
      data: {
        rentals: offers.slice(0, count),
        city,
        pickupDate,
        returnDate,
        days,
        source: 'mock',
        note: 'Sample data for demonstration purposes. Prices and availability are illustrative.',
      },
    };
  }
}
