import type { Locale } from '../i18n/config';

export type SuggestionAgent = 'travel' | 'shopping';

/**
 * Starter buttons.
 *
 * Each entry is both a button label and the message that gets sent to the LLM,
 * so these are written per language rather than translated — a literal
 * translation of an English prompt makes for an unnatural query, and the
 * routes, currencies and products a Hebrew or Russian speaker asks about are
 * not the ones an English prompt names. The tool coverage is what stays the
 * same across languages: flights, weather, visas, currency, hotels, car
 * rental, itinerary, country info, tours.
 *
 * Telegram caps callback data, not button text, but long labels wrap badly on
 * phones — the test keeps every entry under 64 bytes, which is roughly 30
 * characters once Hebrew and Cyrillic take two bytes each.
 */
export const STARTER_POOLS: Record<Locale, Record<SuggestionAgent, string[]>> = {
  en: {
    travel: [
      'Find flights from NYC to Tokyo next month',
      "What's the weather in Bali in July?",
      'Do I need a visa for Thailand?',
      'Convert 1000 USD to Japanese Yen',
      'Best hotels in Paris under €150/night',
      'Search car rentals in Rome for next week',
      'Plan a 7-day trip to Japan',
      'What currency does Vietnam use?',
      'Find guided tours in Barcelona',
      'Check visa requirements for India',
    ],
    shopping: [
      'Find me a good laptop under $1000',
      'Compare iPhone 16 vs Samsung Galaxy S25',
      'Best wireless headphones in 2025',
      'Add MacBook Pro to my shopping list',
      'Find deals on Sony cameras',
      'Compare prices for iPad Pro',
      'Best budget mechanical keyboard',
      'Find a 4K monitor under $400',
      'Search deals on running shoes',
      'Compare AirPods Pro vs Sony WF-1000XM5',
    ],
  },
  he: {
    travel: [
      'מצא טיסות מתל אביב לרומא',
      'מה מזג האוויר בבנגקוק ביולי?',
      'צריך ויזה לתאילנד?',
      'המר 1000 שקל לאירו',
      'מלונות בפריז עד 150 אירו ללילה',
      'השכרת רכב ברומא לשבוע הבא',
      'תכנן טיול של שבוע ביפן',
      'איזה מטבע יש בווייטנאם?',
      'סיורים מודרכים בברצלונה',
      'דרישות ויזה להודו',
    ],
    shopping: [
      'מצא לפטופ טוב עד 4000 שקל',
      'השווה iPhone 16 מול Galaxy S25',
      'אוזניות אלחוטיות הכי טובות',
      'הוסף MacBook Pro לרשימת הקניות',
      'מבצעים על מצלמות Sony',
      'השווה מחירים ל־iPad Pro',
      'מקלדת מכנית זולה וטובה',
      'מסך 4K עד 1500 שקל',
      'מבצעים על נעלי ריצה',
      'השווה AirPods Pro מול Sony WF-1000XM5',
    ],
  },
  ru: {
    travel: [
      'Найди рейсы из Москвы в Токио',
      'Какая погода на Бали в июле?',
      'Нужна ли виза в Таиланд?',
      'Переведи 1000 рублей в иены',
      'Отели в Париже до 150 € за ночь',
      'Аренда авто в Риме на неделю',
      'Спланируй поездку в Японию',
      'Какая валюта во Вьетнаме?',
      'Экскурсии в Барселоне',
      'Визовые требования в Индию',
    ],
    shopping: [
      'Найди ноутбук до 80 000 ₽',
      'Сравни iPhone 16 и Galaxy S25',
      'Лучшие беспроводные наушники',
      'Добавь MacBook Pro в список покупок',
      'Скидки на камеры Sony',
      'Сравни цены на iPad Pro',
      'Дешёвая механическая клавиатура',
      'Монитор 4K до 40 000 ₽',
      'Скидки на беговые кроссовки',
      'Сравни AirPods Pro и Sony WF-1000XM5',
    ],
  },
};
