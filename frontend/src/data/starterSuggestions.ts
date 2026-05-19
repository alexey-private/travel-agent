export const ALL_SUGGESTIONS: Record<"travel" | "shopping", string[]> = {
  travel: [
    "Plan a 7-day trip to Tokyo in April",
    "Best time to visit Bali — weather & crowds?",
    "Do I need a visa for Thailand from the US?",
    "Convert 1000 USD to EUR",
    "Top vegetarian-friendly cities in Europe",
    "What are the must-see sights in Paris?",
    "Safest neighborhoods to stay in Mexico City",
    "How to get from London to Edinburgh by train",
    "Budget travel tips for Southeast Asia",
    "Best beaches in Greece for families",
    "Do I need travel insurance for a Schengen trip?",
    "What vaccinations are required for Kenya?",
    "Hidden gems in Portugal off the tourist trail",
    "How many days do I need in New York City?",
    "Best street food cities in Asia",
    "What is the local currency in Morocco?",
    "Is it safe to travel solo in Colombia?",
    "Packing list for a two-week trip to Iceland",
    "Top national parks to visit in the USA",
    "What languages are spoken in Switzerland?",
  ],
  shopping: [
    "Find me the best noise-cancelling headphones under $200",
    "Compare prices for the Sony WH-1000XM5",
    "What's the best lightweight laptop for travel?",
    "Find deals on luggage sets for international travel",
    "Best travel backpacks reviewed — 2026",
    "Compare prices for AirPods Pro vs Samsung Galaxy Buds",
    "Find a portable charger with at least 20000mAh",
    "Best budget smartphones with good cameras",
    "Search for deals on Kindle e-readers",
    "Find travel adapters for Europe and Asia",
    "Best rated running shoes under $150",
    "Compare smartwatches: Apple Watch vs Garmin",
    "Find discounts on travel-size toiletry sets",
    "Best standing desks for home offices under $400",
    "Find mechanical keyboards with wireless support",
    "Best robot vacuum cleaners reviewed",
    "Compare prices for Dyson vs Shark vacuums",
    "Find deals on instant cameras",
    "Best rated coffee makers under $100",
    "Find waterproof Bluetooth speakers",
  ],
};

export function getRandomSuggestions(count: number, agentType: "travel" | "shopping" = "travel"): string[] {
  const pool = ALL_SUGGESTIONS[agentType];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
