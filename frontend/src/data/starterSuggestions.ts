import { perLocale, type Locale } from "@travel-agent/i18n";

export type SuggestionAgent = "travel" | "shopping";

/**
 * A starter suggestion is two things at once: the label on a button and the
 * message that goes to the LLM when it is pressed. That is why the sets below
 * are written per language rather than translated — a literal translation of an
 * English phrase makes an unnatural request, and it drags the English examples
 * along with it. A Hebrew speaker does not ask about flights from New York.
 *
 * Each set covers the same tools, two phrases each, with routes, cities and
 * currencies that belong to the language.
 */

const monthFormat = perLocale((locale) => new Intl.DateTimeFormat(locale, { month: "long" }));

/**
 * Month name in the given locale, offset from today. Used inside suggestion text.
 *
 * Called once per suggestion that names a month, which is a dozen times per
 * set, so the formatter is cached and only the date is recomputed.
 */
function monthName(locale: Locale, offsetMonths = 0): string {
  const d = new Date();
  // Day 1 first: setMonth on the 31st overflows into the month after the one
  // asked for, so "in two months" would skip a month for three days each year.
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return monthFormat(locale).format(d);
}

function englishSuggestions(): Record<SuggestionAgent, string[]> {
  return {
    travel: [
      // search_flights
      `Find flights from New York to Rome in ${monthName("en", 2)}`,
      "Cheapest flights from London to Bangkok next month",
      // search_hotels
      `Find hotels in Barcelona for 5 nights in ${monthName("en", 1)}`,
      "Best 4-star hotels in Kyoto under $150/night",
      // search_car_rentals
      `Rent an SUV in Lisbon for a week in ${monthName("en", 2)}`,
      `Cheapest car rental in Miami from ${monthName("en", 1)} 10 to 17`,
      // search_tours
      "Find cultural tours in Morocco for 7 days",
      "Best adventure tours in New Zealand under $2000",
      // search_spas
      "Best massage spas in Bali",
      "Find thermal spa experiences in Budapest",
      // check_visa_requirements
      "Do I need a visa for Thailand from the US?",
      "Visa requirements for India with a UK passport",
      // manage_calendar
      `Add my Paris trip (${monthName("en", 1)} 5–12) to my travel calendar`,
      "Remind me to book a hotel for my Tokyo trip",
      // get_weather
      "Best time to visit Bali — weather & crowds?",
      "What's the weather like in Iceland in February?",
      // get_country_info
      "What languages are spoken in Switzerland?",
      "Tell me about Japan — culture, currency, timezone",
      // convert_currency
      "Convert 1000 USD to EUR",
      "How much is 500 GBP in Japanese yen?",
      // web_search
      "Top vegetarian-friendly cities in Europe",
      "Hidden gems in Portugal off the tourist trail",
    ],
    shopping: [
      // search_products
      "Find me the best noise-cancelling headphones under $200",
      "Find a portable charger with at least 20000mAh",
      // compare_prices
      "Compare prices for the Sony WH-1000XM5",
      "Compare prices for AirPods Pro vs Samsung Galaxy Buds",
      // get_product_reviews
      "What do reviews say about the Kindle Paperwhite?",
      "Best rated running shoes under $150 — reviews",
      // search_deals
      "Find deals on luggage sets for international travel",
      "Search for deals on Kindle e-readers this week",
      // manage_wishlist
      "Add Sony WH-1000XM5 to my wishlist",
      "Show me my saved wishlist items",
      // manage_price_alerts
      "Alert me when AirPods Pro drop below $180",
      "Set a price alert for MacBook Air under $1000",
      // manage_calendar
      "Remind me about Black Friday deals on November 28",
      "Add a reminder: Amazon Prime Day starts July 8",
      // web_search
      "Best travel backpacks reviewed — 2026",
      "What's the best lightweight laptop for travel?",
      // convert_currency
      "How much is 300 EUR in USD for a shopping budget?",
      "Convert £200 to USD — shopping budget for New York",
    ],
  };
}

/** Departures from Tel Aviv, prices in shekels. */
function hebrewSuggestions(): Record<SuggestionAgent, string[]> {
  return {
    travel: [
      // search_flights
      `מצא טיסות מתל אביב לרומא ב${monthName("he", 2)}`,
      "הטיסות הזולות ביותר מתל אביב לבנגקוק בחודש הבא",
      // search_hotels
      `מצא מלונות בברצלונה לחמישה לילות ב${monthName("he", 1)}`,
      "המלונות הטובים ביותר בקיוטו עד 600 ש\"ח ללילה",
      // search_car_rentals
      `שכור רכב שטח בליסבון לשבוע ב${monthName("he", 2)}`,
      `השכרת הרכב הזולה ביותר במיאמי, מה-10 עד ה-17 ב${monthName("he", 1)}`,
      // search_tours
      "מצא טיולים תרבותיים במרוקו לשבעה ימים",
      "טיולי הרפתקאות בניו זילנד עד 7,000 ש\"ח",
      // search_spas
      "מקומות הספא הטובים ביותר לעיסוי בבאלי",
      "מצא מרחצאות חמים בבודפשט",
      // check_visa_requirements
      "האם צריך ויזה לתאילנד עם דרכון ישראלי?",
      "מהן דרישות הוויזה להודו עבור אזרח ישראלי?",
      // manage_calendar
      `הוסף ליומן הנסיעות את הטיול שלי לפריז ב${monthName("he", 1)}`,
      "תזכיר לי להזמין מלון לקראת הטיול לטוקיו",
      // get_weather
      "מתי הזמן הטוב ביותר לבקר בבאלי — מזג אוויר ועומס תיירים?",
      "איך מזג האוויר באיסלנד בפברואר?",
      // get_country_info
      "אילו שפות מדברים בשווייץ?",
      "ספר לי על יפן — תרבות, מטבע ואזור זמן",
      // convert_currency
      "המר 1,000 דולר לאירו",
      "כמה שווים 500 ליש\"ט בין יפני?",
      // web_search
      "הערים הידידותיות ביותר לצמחונים באירופה",
      "פנינות נסתרות בפורטוגל, הרחק ממסלולי התיירים",
    ],
    shopping: [
      // search_products
      "מצא אוזניות עם ביטול רעשים עד 800 ש\"ח",
      "מצא סוללה ניידת של 20,000 מיליאמפר לפחות",
      // compare_prices
      "השווה מחירים לאוזניות Sony WH-1000XM5",
      "השווה בין AirPods Pro לבין Samsung Galaxy Buds",
      // get_product_reviews
      "מה אומרות הביקורות על Kindle Paperwhite?",
      "נעלי הריצה המדורגות הכי גבוה עד 600 ש\"ח — ביקורות",
      // search_deals
      "מצא מבצעים על סטים של מזוודות לטיסות לחו\"ל",
      "חפש מבצעים על קוראי ספרים דיגיטליים השבוע",
      // manage_wishlist
      "הוסף את Sony WH-1000XM5 לרשימת המשאלות שלי",
      "הצג לי את הפריטים השמורים ברשימת המשאלות",
      // manage_price_alerts
      "עדכן אותי כשה-AirPods Pro ירדו מתחת ל-700 ש\"ח",
      "הגדר התראת מחיר ל-MacBook Air מתחת ל-4,000 ש\"ח",
      // manage_calendar
      "תזכיר לי על מבצעי בלאק פריידיי ב-28 בנובמבר",
      "הוסף תזכורת: פריים דיי של אמזון מתחיל ב-8 ביולי",
      // web_search
      "תיקי הגב הטובים ביותר לנסיעות — ביקורות 2026",
      "מהו המחשב הנייד הקל ביותר לנסיעות?",
      // convert_currency
      "כמה הם 300 אירו בשקלים לתקציב הקניות?",
      "המר 200 ליש\"ט לשקלים — תקציב קניות בלונדון",
    ],
  };
}

/**
 * Departures from Tel Aviv, prices in dollars.
 *
 * Months are named with "на", not "в": Intl gives the nominative ("октябрь"),
 * which is also the accusative for every month name, whereas "в" would need the
 * prepositional ("в октябре") and read as broken Russian.
 */
function russianSuggestions(): Record<SuggestionAgent, string[]> {
  return {
    travel: [
      // search_flights
      `Найди рейсы из Тель-Авива в Рим на ${monthName("ru", 2)}`,
      "Самые дешёвые рейсы из Тель-Авива в Бангкок в следующем месяце",
      // search_hotels
      `Найди отели в Барселоне на пять ночей на ${monthName("ru", 1)}`,
      "Лучшие четырёхзвёздочные отели в Киото дешевле 150 долларов за ночь",
      // search_car_rentals
      `Арендуй внедорожник в Лиссабоне на неделю на ${monthName("ru", 2)}`,
      `Самая дешёвая аренда машины в Майами на ${monthName("ru", 1)}, с 10 по 17 число`,
      // search_tours
      "Найди культурные туры по Марокко на семь дней",
      "Лучшие приключенческие туры по Новой Зеландии дешевле 2000 долларов",
      // search_spas
      "Лучшие спа с массажем на Бали",
      "Найди термальные купальни в Будапеште",
      // check_visa_requirements
      "Нужна ли виза в Таиланд с израильским паспортом?",
      "Визовые требования для Индии с российским паспортом",
      // manage_calendar
      `Добавь поездку в Париж на ${monthName("ru", 1)} в календарь путешествий`,
      "Напомни забронировать отель для поездки в Токио",
      // get_weather
      "Когда лучше всего ехать на Бали — погода и наплыв туристов?",
      "Какая погода в Исландии в феврале?",
      // get_country_info
      "На каких языках говорят в Швейцарии?",
      "Расскажи о Японии — культура, валюта, часовой пояс",
      // convert_currency
      "Переведи 1000 долларов в евро",
      "Сколько будет 500 фунтов в японских иенах?",
      // web_search
      "Лучшие города Европы для вегетарианцев",
      "Неочевидные места в Португалии вдали от туристических маршрутов",
    ],
    shopping: [
      // search_products
      "Подбери наушники с шумоподавлением дешевле 200 долларов",
      "Найди внешний аккумулятор минимум на 20000 мА·ч",
      // compare_prices
      "Сравни цены на Sony WH-1000XM5",
      "Сравни AirPods Pro и Samsung Galaxy Buds",
      // get_product_reviews
      "Что пишут в отзывах о Kindle Paperwhite?",
      "Кроссовки для бега с лучшими оценками дешевле 150 долларов — отзывы",
      // search_deals
      "Найди скидки на комплекты чемоданов для перелётов",
      "Поищи скидки на электронные книги на этой неделе",
      // manage_wishlist
      "Добавь Sony WH-1000XM5 в список желаний",
      "Покажи сохранённые товары из списка желаний",
      // manage_price_alerts
      "Сообщи, когда AirPods Pro подешевеют до 180 долларов",
      "Поставь отслеживание цены на MacBook Air дешевле 1000 долларов",
      // manage_calendar
      "Напомни о скидках Чёрной пятницы 28 ноября",
      "Добавь напоминание: Amazon Prime Day начинается 8 июля",
      // web_search
      "Лучшие рюкзаки для путешествий — обзоры 2026",
      "Какой ноутбук самый лёгкий для поездок?",
      // convert_currency
      "Сколько будет 300 евро в долларах для бюджета на покупки?",
      "Переведи 200 фунтов в доллары — бюджет на покупки в Нью-Йорке",
    ],
  };
}

export const ALL_SUGGESTIONS: Record<Locale, Record<SuggestionAgent, string[]>> = {
  en: englishSuggestions(),
  he: hebrewSuggestions(),
  ru: russianSuggestions(),
};

export function getRandomSuggestions(
  count: number,
  agentType: SuggestionAgent = "travel",
  locale: Locale = "en",
): string[] {
  // Fisher-Yates rather than sort(() => Math.random() - 0.5): that comparator is
  // inconsistent, which the spec leaves undefined, and it skews heavily towards
  // leaving items near where they started.
  const pool = [...ALL_SUGGESTIONS[locale][agentType]];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
