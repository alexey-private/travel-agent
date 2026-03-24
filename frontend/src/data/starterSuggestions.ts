export const ALL_SUGGESTIONS = [
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
];

export function getRandomSuggestions(count: number): string[] {
  const shuffled = [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
