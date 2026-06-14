const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthName(offsetMonths = 0): string {
  const d = new Date();
  return MONTH_NAMES[(d.getMonth() + offsetMonths) % 12];
}

const ALL_SUGGESTIONS_RAW: Record<"travel" | "shopping", string[]> = {
  travel: [
    // search_flights
    `Find flights from New York to Rome in ${monthName(2)}`,
    "Cheapest flights from London to Bangkok next month",
    // search_hotels
    `Find hotels in Barcelona for 5 nights in ${monthName(1)}`,
    "Best 4-star hotels in Kyoto under $150/night",
    // search_car_rentals
    `Rent an SUV in Lisbon for a week in ${monthName(2)}`,
    `Cheapest car rental in Miami from ${monthName(1)} 10 to 17`,
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
    `Add my Paris trip (${monthName(1)} 5–12) to my travel calendar`,
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

export const ALL_SUGGESTIONS = ALL_SUGGESTIONS_RAW;

export function getRandomSuggestions(count: number, agentType: "travel" | "shopping" = "travel"): string[] {
  const pool = ALL_SUGGESTIONS_RAW[agentType];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
