/**
 * Knowledge base seed script.
 *
 * Usage:
 *   npm run seed --workspace=backend
 *
 * Embeds and inserts curated travel documents (visa tips, health guides,
 * cultural etiquette, currency info) for 7 popular destinations.
 * Safe to run multiple times — duplicate topics are skipped.
 */

import { Pool } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { EmbeddingService } from '../services/EmbeddingService';
import { RAGService } from '../services/RAGService';

// ---------------------------------------------------------------------------
// Seed documents
// ---------------------------------------------------------------------------

interface SeedDocument {
  topic: string;
  content: string;
  metadata: Record<string, unknown>;
}

const DOCUMENTS: SeedDocument[] = [
  // ── JAPAN ──────────────────────────────────────────────────────────────────
  {
    topic: 'Japan visa requirements',
    content: `Citizens of over 60 countries, including the USA, Canada, UK, Australia, and most EU nations, enjoy visa-free entry to Japan for short stays (up to 90 days for tourism).
Requirements: valid passport, return/onward ticket, sufficient funds, accommodation proof.
On arrival, fingerprinting and a photo are taken at immigration.
Working-holiday visas are available for nationals of about 30 countries aged 18–30.
Apply through the nearest Japanese consulate/embassy; the tourist visa takes 5–7 business days.
Overstaying is a serious offence and can result in deportation and a future entry ban.`,
    metadata: { destination: 'Japan', category: 'visa' },
  },
  {
    topic: 'Japan travel health tips',
    content: `Japan has excellent healthcare and no mandatory vaccinations, but the following are recommended:
- Hepatitis A and B
- Typhoid (if eating at local street stalls extensively)
- Japanese encephalitis (for extended rural stays in summer)
- Routine vaccines (MMR, diphtheria, tetanus, polio)

Tap water is safe to drink throughout Japan.
Pharmacies (薬局, yakkyoku) are widely available; bring a prescription if you carry prescription medication.
Japan has strict drug laws: many common Western medications (e.g. pseudoephedrine, codeine) are prohibited. Check the Japanese Ministry of Health list before packing.
Travel insurance with medical evacuation coverage is strongly advised.`,
    metadata: { destination: 'Japan', category: 'health' },
  },
  {
    topic: 'Japan cultural etiquette',
    content: `Key etiquette points for Japan:
- Remove shoes when entering homes, many traditional restaurants, and some temple areas.
- Bow when greeting — deeper bows signal more respect.
- Tipping is not customary and can be considered rude.
- Eating or drinking while walking is frowned upon in most areas.
- Speak quietly on public transport; phone calls are generally prohibited.
- Two hands when giving or receiving business cards (meishi).
- Tattoos may restrict access to some hot springs (onsen) and public baths.
- Avoid pointing with chopsticks or sticking them upright in rice — both are funeral gestures.
- Queuing is taken seriously; form orderly lines at train platform markings.`,
    metadata: { destination: 'Japan', category: 'culture' },
  },

  // ── FRANCE ─────────────────────────────────────────────────────────────────
  {
    topic: 'France visa requirements',
    content: `France is part of the Schengen Area. Citizens of the USA, Canada, Australia, UK (post-Brexit), and many other countries can visit for up to 90 days within any 180-day period without a visa.
From 2025, the EU's ETIAS (European Travel Information and Authorisation System) will be required for visa-exempt travellers — register online before departure; it is valid for 3 years.
A valid passport is required; EU/EEA citizens may enter with a national ID card.
Longer stays or study/work require a French long-stay visa obtained from the French consulate in your home country.`,
    metadata: { destination: 'France', category: 'visa' },
  },
  {
    topic: 'France travel tips and culture',
    content: `Tips for travelling in France:
- A basic greeting in French ("Bonjour/Bonsoir") goes a long way; locals appreciate the effort.
- Tipping is not obligatory — service is included by law — but rounding up or leaving 5–10% is appreciated in restaurants.
- Shops and pharmacies close on Sundays in many areas; plan ahead.
- The Paris Metro is the easiest way to get around the capital; buy a carnet (10-trip book) or use the Navigo card.
- Validate your train/metro ticket before boarding — fines for "lapin" (riding without a valid ticket) are common.
- Health insurance: carry your EHIC/GHIC (EU nationals) or purchase travel insurance with healthcare coverage.
- Tap water ("une carafe d'eau") is free and safe to drink at restaurants — asking for it is perfectly normal.
- Currency: Euro (€). Contactless card payments are widely accepted.`,
    metadata: { destination: 'France', category: 'travel-tips' },
  },

  // ── THAILAND ───────────────────────────────────────────────────────────────
  {
    topic: 'Thailand visa requirements',
    content: `Thailand offers visa-on-arrival (VOA) and visa-exempt entry to nationals of about 65 countries for 30 days (exemption) or 15 days (VOA).
In 2024 Thailand extended the visa-exempt stay to 60 days for many nationalities including the USA, EU, UK, and Australia.
Requirements: valid passport (6+ months validity), onward/return ticket, proof of funds (~THB 10,000 per person), and accommodation details.
Thailand Elite Visa and Long-Term Resident (LTR) Visa offer longer stays for qualifying applicants.
Land border crossings have different rules — the common "visa run" may be restricted; check current regulations.`,
    metadata: { destination: 'Thailand', category: 'visa' },
  },
  {
    topic: 'Thailand travel health and safety',
    content: `Recommended vaccinations for Thailand:
- Hepatitis A and B
- Typhoid
- Rabies (if adventurous travel or wildlife contact)
- Japanese encephalitis (rural/northern regions)
- Malaria prophylaxis for border regions (Chiang Rai, Kanchanaburi) — not required in Bangkok or main tourist areas

Food safety: eat at busy street stalls, avoid raw shellfish and unpeeled fruit. Bottled or filtered water only — do not drink tap water.
Sun protection is essential; Thailand is close to the equator year-round.
Road safety: motorbike accidents are the leading cause of tourist injury; always wear a helmet and avoid renting bikes without experience.
Avoid touching or feeding street animals due to rabies risk.
Hospital quality: Bangkok and Chiang Mai have excellent private hospitals; rural areas are more limited.`,
    metadata: { destination: 'Thailand', category: 'health' },
  },
  {
    topic: 'Thailand cultural etiquette',
    content: `Cultural norms in Thailand:
- The monarchy is deeply revered; any disrespect is a serious criminal offence under lèse-majesté laws.
- Dress modestly when visiting temples — cover shoulders and knees; remove shoes before entering.
- The head is considered sacred; never touch someone's head.
- Feet are considered the lowest part of the body — do not point feet at people or sacred objects.
- "Wai" greeting (palms together, slight bow) is used for elders and monks; Thais won't wai monks back.
- Bargaining is expected in markets but not in malls or convenience stores.
- Showing anger or raising your voice in public is considered a serious loss of face.
- Tipping: 20–50 THB is appreciated in restaurants; 10–20% in upscale places.`,
    metadata: { destination: 'Thailand', category: 'culture' },
  },

  // ── ITALY ──────────────────────────────────────────────────────────────────
  {
    topic: 'Italy visa and entry requirements',
    content: `Italy is a Schengen member state. Travellers from the USA, Canada, Australia, UK, and most of the Americas can enter visa-free for up to 90 days in any 180-day window.
From 2025, ETIAS pre-travel authorisation will be required for visa-exempt non-EU nationals — register at etias.eu before travel; it costs €7 and is valid for 3 years.
EU/EEA/Swiss citizens may enter with a valid national ID card; a passport is not strictly required but is recommended.
Longer stays require a national visa obtained from the Italian consulate/embassy prior to travel.`,
    metadata: { destination: 'Italy', category: 'visa' },
  },
  {
    topic: 'Italy travel tips',
    content: `Practical tips for Italy:
- Validate train tickets before boarding at yellow machines on the platform — inspectors fine passengers with unvalidated tickets even if the ticket was purchased.
- "Coperto" (cover charge) on restaurant bills is legal and normal; tipping is optional but 10% is appreciated.
- Many churches require covered shoulders and knees — carry a scarf or shawl.
- Avoid tourist traps near major attractions; walk 2–3 blocks for better-value restaurants.
- Tap water is safe and free (look for "acqua potabile" fountains).
- Currency: Euro (€). Many small businesses are cash-only; carry some cash.
- Driving in historic city centres (ZTL zones) without a permit results in automatic fines sent weeks later — check before driving.
- Pharmacies (green cross) dispense many medications without prescription and offer medical advice.`,
    metadata: { destination: 'Italy', category: 'travel-tips' },
  },

  // ── MEXICO ─────────────────────────────────────────────────────────────────
  {
    topic: 'Mexico visa requirements',
    content: `Citizens of the USA, Canada, EU, UK, Australia, Japan, and many other countries do not require a visa to visit Mexico for tourism for up to 180 days.
On arrival you will receive a tourist card (Forma Migratoria Múltiple — FMM); keep it, as you must surrender it on departure. It is now electronic at major airports.
A valid passport is required; US/Canadian citizens can enter by land or sea with a US passport card or enhanced driver's licence.
Extensions beyond the granted period require an INM (Instituto Nacional de Migración) visit — do not overstay.`,
    metadata: { destination: 'Mexico', category: 'visa' },
  },
  {
    topic: 'Mexico travel health and safety',
    content: `Health precautions for Mexico:
- Drink only bottled or purified water — "Montezuma's Revenge" (traveller's diarrhoea) is common.
- Recommended vaccines: Hepatitis A, Typhoid; consider Hepatitis B, Rabies for rural/adventure travel.
- Malaria exists in certain rural areas (Chiapas, Sinaloa) — not a risk in major cities or tourist resorts.
- Zika virus present; pregnant travellers should consult a doctor before visiting.
- Altitude sickness: Mexico City sits at 2,240 m — take it easy the first day; ibuprofen or Diamox may help.
- Safety: tourist areas (Cancún, Los Cabos, Mexico City historic centre) are generally safe; check current government travel advisories before visiting less-frequented regions.
- Emergency number: 911 nationwide.`,
    metadata: { destination: 'Mexico', category: 'health' },
  },

  // ── AUSTRALIA ──────────────────────────────────────────────────────────────
  {
    topic: 'Australia visa requirements',
    content: `Australia requires all foreign nationals to hold a valid visa before boarding a flight to Australia.
Electronic Travel Authority (ETA — subclass 601): available to passport holders of 8 countries (USA, UK, Japan, Singapore, Canada, and more) via the Australian ETA app. Cost: AUD 20 processing fee. Stay: up to 3 months per visit.
eVisitor (subclass 651): free, for EU/EEA passport holders, issued electronically. Stay: up to 3 months.
Tourist Visa (subclass 600): for all others; applied online; processing 20–40 days; costs AUD 150+.
Working Holiday Visa (subclass 417/462): for eligible nationalities aged 18–30 (35 for some countries).
Note: Australia has strict biosecurity rules — declare all food, plant, and animal products on arrival.`,
    metadata: { destination: 'Australia', category: 'visa' },
  },
  {
    topic: 'Australia travel tips',
    content: `Essential tips for Australia:
- Sun protection is critical — Australia has one of the highest UV indices in the world; SPF 50+ and a hat are mandatory.
- Swimming safety: follow beach flag warnings; always swim between the red-and-yellow flags; rips claim lives every year.
- Wildlife: most dangerous animals avoid humans but respect warning signs. Do not approach saltwater crocodiles, sharks, or snakes.
- Distances are vast — internal flights are often more practical than driving. A Sydney–Melbourne drive is 9 hours.
- Tipping is not customary but 10% is appreciated in restaurants.
- Healthcare: Australia has a reciprocal healthcare agreement with UK, Ireland, New Zealand, and several other countries. All others should purchase comprehensive travel insurance.
- Currency: Australian Dollar (AUD). Contactless payments are near-universal.`,
    metadata: { destination: 'Australia', category: 'travel-tips' },
  },

  // ── INDIA ──────────────────────────────────────────────────────────────────
  {
    topic: 'India visa requirements',
    content: `Most foreign nationals require a visa to enter India.
e-Visa (eTV): available for citizens of over 160 countries for tourism, business, and medical visits. Apply at indianvisaonline.gov.in at least 4 days before travel. Fee varies by nationality (~USD 25–80). Valid: 30 days (tourist, double entry), 1 year (multiple entry).
Visa on Arrival: available only at a handful of airports for a small number of nationalities.
Regular sticker visa: applied at Indian embassy/consulate for longer stays.
Pakistan, Bangladesh, and certain other nationalities have additional restrictions.
Note: a separate Protected Area Permit (PAP) or Inner Line Permit (ILP) is required for some border regions (Sikkim, Arunachal Pradesh, Ladakh areas).`,
    metadata: { destination: 'India', category: 'visa' },
  },
  {
    topic: 'India travel health tips',
    content: `Health precautions for India:
- Water: drink only bottled or boiled water; avoid ice in drinks; peel or cook all fruit and vegetables.
- Recommended vaccines: Hepatitis A, Typhoid, Tetanus. Consider Hepatitis B, Rabies, Japanese encephalitis (rural), Cholera.
- Malaria: present in many regions; prophylaxis recommended especially for rural travel and monsoon season (June–September).
- Food safety: eat at busy restaurants; avoid raw salads and buffets that have been sitting out.
- Stomach upsets are common; pack oral rehydration salts and loperamide.
- Air quality: Delhi and several other cities have severe pollution in winter (Nov–Feb); those with respiratory conditions should take precautions.
- Medical care: private hospitals in major cities are excellent; rural areas have limited facilities. Travel insurance with medical evacuation coverage is strongly recommended.`,
    metadata: { destination: 'India', category: 'health' },
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const embeddingService = new EmbeddingService();
  const ragService = new RAGService(pool, anthropic, embeddingService);

  console.log(`Seeding ${DOCUMENTS.length} knowledge base documents…\n`);

  for (const doc of DOCUMENTS) {
    // Check whether this topic already exists to make the script idempotent
    const existing = await pool.query(
      'SELECT id FROM knowledge_base WHERE topic = $1 LIMIT 1',
      [doc.topic],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  SKIP  ${doc.topic}`);
      continue;
    }

    process.stdout.write(`  INSERT ${doc.topic} … `);
    try {
      await ragService.ingestDocument(doc.topic, doc.content, doc.metadata);
      console.log('done');
    } catch (err) {
      console.log(`FAILED (${err instanceof Error ? err.message : err}) — skipping`);
    }
    // Respect Voyage AI free-tier rate limit
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  await pool.end();
  console.log('\nSeed complete.');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
