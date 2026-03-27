/**
 * Shopping knowledge base seed script.
 *
 * Usage:
 *   npx ts-node src/db/seed-shopping.ts
 *   — or —
 *   npm run seed:shopping --workspace=backend
 *
 * Embeds and inserts product catalog + review documents for ~30 products
 * across electronics, home, clothing, and sports categories.
 *
 * Each product generates two KB documents:
 *   - "<Product Name> — product"   : specs, price, store, features
 *   - "<Product Name> — reviews"   : pros/cons, ratings, customer feedback
 *
 * Metadata fields on product docs:
 *   type, category, brand, price, store, url, inStock, productId
 *
 * Metadata fields on review docs:
 *   type, category, brand, productId, avgRating, reviewCount
 *
 * Safe to run multiple times — duplicate topics are skipped.
 */

import { Pool } from 'pg';
import { env } from '../config/env';
import { EmbeddingService } from '../services/EmbeddingService';
import { RAGService } from '../services/RAGService';
import { AnthropicLLMClient } from '../llm/AnthropicLLMClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeedDocument {
  topic: string;
  content: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Seed documents
// ---------------------------------------------------------------------------

const DOCUMENTS: SeedDocument[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // ELECTRONICS — HEADPHONES (Over-ear ANC)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Sony WH-1000XM5 ───────────────────────────────────────────────────────
  {
    topic: 'Sony WH-1000XM5 Headphones — product',
    content: `Sony WH-1000XM5 Wireless Noise Cancelling Headphones
Brand: Sony | Price: $349.99 | Store: Best Buy | In Stock: Yes
Category: electronics — over-ear headphones

Key Features:
- Industry-leading noise cancellation with eight microphones and two processors
- 30-hour battery life (NC on); 3-minute quick charge gives 3 hours of playback
- Multipoint connection: pair with two devices simultaneously
- Speak-to-Chat and Auto NC Optimizer adapt to your environment automatically
- Crystal-clear hands-free calling via precise voice pickup
- Supports LDAC for Hi-Res Audio (up to 990 kbps), AAC, SBC

Technical Specifications:
- Driver unit: 30 mm, dome type
- Frequency response: 4 Hz – 40,000 Hz
- Bluetooth version: 5.2
- Weight: 250 g
- Foldable: No (flat design, slim carrying case included)
- Colors: Platinum Silver, Midnight Black

URL: https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'headphones', brand: 'Sony', price: 349.99, store: 'Best Buy', url: 'https://www.bestbuy.com/site/sony-wh-1000xm5/6505727.p', inStock: true, productId: 'e1' },
  },
  {
    topic: 'Sony WH-1000XM5 Headphones — reviews',
    content: `Sony WH-1000XM5 — Customer Reviews & Expert Analysis
Average Rating: 4.8 / 5 | Total Reviews: 12,450

Overall Assessment:
The WH-1000XM5 is widely regarded as the benchmark for consumer noise-cancelling headphones. Its ANC performance in mid-range frequencies (airplane cabin noise, HVAC hum) is unmatched. Sound signature is warm and musical, appealing to casual listeners and audiophiles alike via LDAC.

Pros (most mentioned by customers):
- Best-in-class ANC for office and airplane environments
- Comfortable for all-day wear thanks to new ear cushion design
- LDAC support delivers noticeable Hi-Res Audio quality over compatible Android devices
- Multipoint pairing works reliably across laptop + phone
- Speak-to-Chat is genuinely useful in real-world settings
- Companion Sony Headphones Connect app is well-designed

Cons (most mentioned by customers):
- Non-foldable design makes travel packing slightly less convenient than XM4
- ANC is slightly weaker on very high-frequency sounds (keyboard clatter)
- Premium price; noticeably more expensive than competitors in the $150–$200 range
- Carrying case feels flimsy given the price

Best For:
- Frequent flyers seeking maximum ANC
- Remote workers in noisy open-plan offices
- Audiophiles wanting wireless Hi-Res Audio on Android

Expert Verdict:
Wirecutter, RTINGS, and The Verge all award this as the top pick in wireless ANC headphones. If budget is not a constraint, the XM5 is the safest recommendation.

Sample Customer Reviews:
- "I've tried Bose QC45 and these blow them out of the water for office noise. Worth every penny." — ★★★★★
- "LDAC + Sony app EQ = incredible sound quality for streaming. Finally ditched wired." — ★★★★★
- "Slightly disappointed it doesn't fold flat like the XM4. Sounds better though." — ★★★★☆
- "Battery life is outstanding. 3 weeks of commuting on a single charge." — ★★★★★`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'headphones', brand: 'Sony', productId: 'e1', avgRating: 4.8, reviewCount: 12450 },
  },

  // ── Sony WH-CH720N ────────────────────────────────────────────────────────
  {
    topic: 'Sony WH-CH720N Noise Cancelling Headphones — product',
    content: `Sony WH-CH720N Wireless Noise Cancelling Headphones
Brand: Sony | Price: $99.99 | Store: Amazon | In Stock: Yes
Category: electronics — over-ear headphones

Key Features:
- Noise cancellation with Dual Noise Sensor Technology (two microphones per earcup)
- Exceptional 35-hour battery life with NC on; 5-minute quick charge for 1 hour playback
- Ultra-lightweight design at only 192 g — lightest in Sony's NC lineup
- Multipoint connection for two devices
- Adaptive Sound Control adjusts ambient sound settings based on activity (walking, transport)
- Foldable for portability

Technical Specifications:
- Driver unit: 30 mm
- Frequency response: 20 Hz – 20,000 Hz
- Bluetooth version: 5.2
- Codec support: AAC, SBC (no LDAC)
- Weight: 192 g
- Colors: Black, White, Blue, Lavender

URL: https://www.amazon.com/dp/B0BVM9YBFN`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'headphones', brand: 'Sony', price: 99.99, store: 'Amazon', url: 'https://www.amazon.com/dp/B0BVM9YBFN', inStock: true, productId: 'e13' },
  },
  {
    topic: 'Sony WH-CH720N Noise Cancelling Headphones — reviews',
    content: `Sony WH-CH720N — Customer Reviews & Expert Analysis
Average Rating: 4.5 / 5 | Total Reviews: 8,720

Overall Assessment:
The WH-CH720N punches well above its $100 price point. The ANC is noticeably better than most competitors under $150 and the 35-hour battery is class-leading. Ideal for commuters or students who want Sony quality without the XM5 price tag.

Pros (most mentioned by customers):
- Outstanding battery life (35 h) for the price category
- Lightweight and comfortable for extended wear
- ANC effectively handles low-frequency hum (subway, bus engine)
- Foldable design with included soft pouch
- Adaptive Sound Control (walking, transit, stationary) is a premium feature at this price
- Good call quality; voice clarity praised by call recipients

Cons (most mentioned by customers):
- No LDAC — sound quality ceiling lower than XM5
- ANC less effective on high-frequency noise vs premium models
- Ear cushions feel thin; some users find seal degrades comfort over 3+ hours
- No AUX / wired fallback option
- Plastic build feels budget compared to Sony's premium line

Best For:
- Commuters and students with a $100 budget
- Anyone wanting Sony ANC reliability without premium pricing
- Light travelers who prioritize battery life

Expert Verdict:
Rtings rates WH-CH720N as the best ANC headphone under $100. A clear step above Anker and JBL competition in noise isolation performance.

Sample Customer Reviews:
- "Amazing value. My office is loud and these cancel it out very effectively for $100." — ★★★★★
- "Battery literally lasts a week of commuting. Incredible for the price." — ★★★★★
- "ANC is solid but I can still hear keyboard clicks in a quiet office." — ★★★★☆
- "Very light on the head. Forgot I was wearing them on a 4-hour flight." — ★★★★★`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'headphones', brand: 'Sony', productId: 'e13', avgRating: 4.5, reviewCount: 8720 },
  },

  // ── Bose QuietComfort 45 ──────────────────────────────────────────────────
  {
    topic: 'Bose QuietComfort 45 Noise Cancelling Headphones — product',
    content: `Bose QuietComfort 45 Wireless Noise Cancelling Headphones
Brand: Bose | Price: $199.00 | Store: Best Buy | In Stock: Yes
Category: electronics — over-ear headphones

Key Features:
- Bose signature noise cancellation — consistent and predictable performance in all environments
- Quiet Mode (full ANC) and Aware Mode (ambient passthrough) toggle
- 24-hour battery life; 15-minute quick charge for 3 hours playback
- Balanced sound tuning — neutral profile preferred by classical and podcast listeners
- Foldable design; lightweight at 238 g
- TriPort acoustic architecture for consistent bass at any volume

Technical Specifications:
- Driver unit: proprietary 35 mm Bose TriPort
- Bluetooth version: 5.1
- Codec support: AAC, SBC (no aptX or LDAC)
- Weight: 238 g
- Colors: White Smoke, Triple Black, Cypress Green, Limited Edition

URL: https://www.bestbuy.com/site/bose-quietcomfort-45/6483562.p`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'headphones', brand: 'Bose', price: 199.00, store: 'Best Buy', url: 'https://www.bestbuy.com/site/bose-quietcomfort-45/6483562.p', inStock: true, productId: 'e18' },
  },
  {
    topic: 'Bose QuietComfort 45 Noise Cancelling Headphones — reviews',
    content: `Bose QuietComfort 45 — Customer Reviews & Expert Analysis
Average Rating: 4.7 / 5 | Total Reviews: 18,900

Overall Assessment:
The QC45 occupies a sweet spot between performance and price. Bose's ANC algorithm excels in real-world consistent performance — less adaptive than Sony but more predictable. The neutral sound signature and legendary Bose comfort make it a favorite for long work sessions and travel.

Pros (most mentioned by customers):
- Premium build comfort — soft ear cushions, minimal clamping force
- Bose ANC excels at eliminating constant low-frequency noise (airplane, AC units)
- Neutral, fatigue-free sound signature ideal for long listening sessions
- Foldable and compact for travel
- Reliable Bluetooth connection; stable multipoint pairing
- Best-in-class call quality; voice isolation consistently praised

Cons (most mentioned by customers):
- No LDAC or aptX HD — sound quality ceiling below Sony XM5 at same volume
- 24h battery trails Sony WH-CH720N's 35h
- Limited EQ options in Bose Music app
- No auto-play/pause on ear removal (QC45 generation)
- Price is competitive but not budget; Sony WH-CH720N offers similar ANC for $100 less

Best For:
- Professionals on long calls or video meetings
- Frequent flyers prioritizing comfort above all
- Classical music and podcast listeners who prefer neutral sound

Expert Verdict:
The QC45 is Wirecutter's runner-up pick to the Sony XM5. If you prioritize comfort and call quality over sound-quality ceiling, the QC45 is the better choice at $199.

Sample Customer Reviews:
- "My third pair of Bose QC headphones. They just work, always. Comfort is unbeatable." — ★★★★★
- "QC45 is my office daily driver. 8-hour calls without ear fatigue." — ★★★★★
- "Disappointed there's no LDAC. Sony XM5 is clearly better for music quality." — ★★★★☆
- "Bose app is too basic. No parametric EQ. But the sound is balanced out of the box." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'headphones', brand: 'Bose', productId: 'e18', avgRating: 4.7, reviewCount: 18900 },
  },

  // ── JBL Tune 760NC ────────────────────────────────────────────────────────
  {
    topic: 'JBL Tune 760NC Noise Cancelling Headphones — product',
    content: `JBL Tune 760NC Wireless Noise Cancelling Headphones
Brand: JBL | Price: $99.95 | Store: Best Buy | In Stock: Yes
Category: electronics — over-ear headphones

Key Features:
- JBL Active Noise Cancelling (ANC) blocks out background noise
- 35-hour total battery life with ANC off (50 h without ANC); 5-minute charge for 2 hours
- JBL Pure Bass Sound signature — enhanced bass profile
- Foldable flat design; compact carrying bag included
- Voice assistant compatible (Google Assistant, Siri)
- Wired fallback via 3.5 mm AUX cable (cable included)

Technical Specifications:
- Driver: 40 mm
- Frequency response: 20 Hz – 20,000 Hz
- Bluetooth version: 5.0
- Codec support: AAC, SBC
- Weight: 224 g
- Colors: Black, White, Blue, Pink

URL: https://www.bestbuy.com/site/jbl-tune-760nc/6501304.p`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'headphones', brand: 'JBL', price: 99.95, store: 'Best Buy', url: 'https://www.bestbuy.com/site/jbl-tune-760nc/6501304.p', inStock: true, productId: 'e15' },
  },
  {
    topic: 'JBL Tune 760NC Noise Cancelling Headphones — reviews',
    content: `JBL Tune 760NC — Customer Reviews & Expert Analysis
Average Rating: 4.4 / 5 | Total Reviews: 9,100

Overall Assessment:
The Tune 760NC is a solid entry-level ANC headphone at $100. The bass-forward JBL sound signature suits bass-heavy genres well. ANC performance is adequate for commuting but trails Sony WH-CH720N in raw noise attenuation. The 3.5 mm wired fallback is a distinct advantage for in-flight entertainment.

Pros (most mentioned by customers):
- Exceptional battery life (35h ANC on; 50h ANC off)
- 3.5 mm wired input — works when battery is dead or on flights with wired audio
- JBL bass-boosted sound appeals to hip-hop, EDM, and pop listeners
- Affordable and widely available
- Comfortable padded headband and ear cushions

Cons (most mentioned by customers):
- ANC is good but not excellent — Sony WH-CH720N beats it at the same price
- Strong bass boost is a negative for classical, jazz, or podcast listeners
- Plastic build; feels light but not premium
- No multipoint Bluetooth connection
- Microphone quality below average for calls

Best For:
- Bass-music fans on a budget
- Users who need wired fallback option
- Occasional travelers who don't fly frequently

Sample Customer Reviews:
- "These replaced my wired Sony's. The bass is punchy and ANC works well on the subway." — ★★★★★
- "Good value. ANC isn't the best but for $100 I'm not complaining." — ★★★★☆
- "Love that it has a headphone jack. Most headphones at this price don't." — ★★★★★
- "Mic quality on calls is mediocre. People say I sound muffled." — ★★★☆☆`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'headphones', brand: 'JBL', productId: 'e15', avgRating: 4.4, reviewCount: 9100 },
  },

  // ── Anker Soundcore Q45 ───────────────────────────────────────────────────
  {
    topic: 'Anker Soundcore Q45 Noise Cancelling Headphones — product',
    content: `Anker Soundcore Q45 Adaptive Active Noise Cancelling Headphones
Brand: Anker | Price: $79.99 | Store: Amazon | In Stock: Yes
Category: electronics — over-ear headphones

Key Features:
- Adaptive ANC with 4 microphones — automatically adjusts noise cancellation level to environment
- 50-hour playtime (ANC off); 40 hours with ANC on
- Hi-Res Audio certified — extended frequency response up to 40 kHz
- LDAC codec support for high-quality wireless audio (unusual at this price)
- Transparency Mode for ambient awareness
- App-based EQ (Soundcore app) with preset library

Technical Specifications:
- Driver: 40 mm custom dynamic
- Frequency response: 20 Hz – 40,000 Hz (Hi-Res)
- Bluetooth version: 5.3
- Codec support: LDAC, AAC, SBC
- Weight: 262 g
- Colors: Black, White

URL: https://www.amazon.com/dp/B09SNFR4XW`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'headphones', brand: 'Anker', price: 79.99, store: 'Amazon', url: 'https://www.amazon.com/dp/B09SNFR4XW', inStock: true, productId: 'e14' },
  },
  {
    topic: 'Anker Soundcore Q45 Noise Cancelling Headphones — reviews',
    content: `Anker Soundcore Q45 — Customer Reviews & Expert Analysis
Average Rating: 4.4 / 5 | Total Reviews: 14,300

Overall Assessment:
The Q45 is arguably the most feature-rich headphone under $100. LDAC and Hi-Res Audio certification at $80 is remarkable. ANC performance is adequate but below Sony WH-CH720N in real-world tests. Best-in-class battery life at 40+ hours. Ideal for budget-conscious buyers who want maximum features per dollar.

Pros (most mentioned by customers):
- LDAC at $80 is exceptional value — Sony charges $350 for the same codec
- 40-hour battery with ANC (50h without) — best in class for the price
- Adaptive ANC adjusts automatically — useful feature usually found in $200+ headphones
- Hi-Res Audio certified; sound quality benefits are audible on LDAC-capable Android phones
- Soundcore app is feature-rich with full EQ customization

Cons (most mentioned by customers):
- ANC quality below Sony WH-CH720N despite higher feature count
- Build quality feels budget — creaky plastic, thin headband padding
- Microphone performance is average; calls are functional but not impressive
- LDAC requires a compatible Android device (iPhone users won't benefit)
- Adaptive ANC occasionally wrong in ambiguous environments

Best For:
- Android users who want LDAC without paying Sony prices
- Budget buyers who want to maximize features per dollar
- Long commutes or travel where battery life matters most

Sample Customer Reviews:
- "LDAC at $80?! The sound quality upgrade over AAC is real on my Samsung phone." — ★★★★★
- "Best battery life of any headphone I've owned. 2 weeks before I need to charge." — ★★★★★
- "ANC is OK but Sony CH720N is noticeably better for the same price. Bought Q45 for the LDAC." — ★★★★☆
- "Feels a bit plasticky but works great. Can't complain at $80." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'headphones', brand: 'Anker', productId: 'e14', avgRating: 4.4, reviewCount: 14300 },
  },

  // ── Beats Studio Pro ──────────────────────────────────────────────────────
  {
    topic: 'Beats Studio Pro Noise Cancelling Headphones — product',
    content: `Beats Studio Pro Wireless Noise Cancelling Headphones
Brand: Beats | Price: $179.95 | Store: Target | In Stock: Yes
Category: electronics — over-ear headphones

Key Features:
- Active Noise Cancelling (ANC) with transparency mode
- Personalized spatial audio with dynamic head tracking (iOS/macOS)
- Apple H1 + USB-C compatibility with Class 1 Bluetooth
- 40-hour battery life (ANC off); 36 hours with ANC on
- Supports USB-C lossless audio and 3.5 mm wired connection
- Compatible with Apple Find My network
- Fast Fuel: 10-minute charge gives 4 hours playback

Technical Specifications:
- Driver: custom-tuned 40 mm
- Bluetooth version: 5.3
- Codec support: AAC (lossless via USB-C), SBC
- Weight: 260 g
- Colors: Black, Navy, Sandstone, Deep Brown

URL: https://www.target.com/p/beats-studio-pro/-/A-88069124`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'headphones', brand: 'Beats', price: 179.95, store: 'Target', url: 'https://www.target.com/p/beats-studio-pro/-/A-88069124', inStock: true, productId: 'e16' },
  },
  {
    topic: 'Beats Studio Pro Noise Cancelling Headphones — reviews',
    content: `Beats Studio Pro — Customer Reviews & Expert Analysis
Average Rating: 4.5 / 5 | Total Reviews: 11,200

Overall Assessment:
The Studio Pro is the best Beats headphone to date and a strong ANC option under $200 for Apple ecosystem users. Personalized spatial audio with head tracking rivals AirPods Max at a fraction of the cost. ANC is competitive with Bose QC45. The USB-C lossless audio path is a genuinely unique feature.

Pros (most mentioned by customers):
- Exceptional Apple ecosystem integration (H1, Find My, instant pairing with iPhone/iPad/Mac)
- Personalized spatial audio with head tracking — immersive for movies and Apple Music Dolby Atmos
- USB-C lossless audio is a standout feature unique to Studio Pro
- Comfortable over-ear fit; premium materials
- 36h ANC battery competes with top competitors

Cons (most mentioned by customers):
- Heavily Apple-ecosystem focused — Android users get significantly less value
- ANC is good but slightly below Sony WH-1000XM5 for blocking continuous noise
- No multipoint Bluetooth connection
- Bass can feel overpowering in default tuning (addressable via EQ)
- Beats app EQ is limited compared to Sony or Soundcore apps

Best For:
- iPhone users wanting best-in-class Apple integration
- Apple Music subscribers who use Dolby Atmos
- Users who sometimes need wired lossless audio via USB-C

Sample Customer Reviews:
- "Spatial audio on Apple TV content is genuinely impressive. Better than I expected." — ★★★★★
- "H1 chip makes pairing between my Mac and iPhone seamless. Love it." — ★★★★★
- "ANC is solid but not Sony XM5 level. For Apple users though, the integration is unbeatable." — ★★★★☆
- "USB-C lossless is a killer feature nobody talks about. Sounds incredible on my MacBook." — ★★★★★`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'headphones', brand: 'Beats', productId: 'e16', avgRating: 4.5, reviewCount: 11200 },
  },

  // ── Jabra Evolve2 55 ──────────────────────────────────────────────────────
  {
    topic: 'Jabra Evolve2 55 Noise Cancelling Headphones — product',
    content: `Jabra Evolve2 55 Business Noise Cancelling Headphones
Brand: Jabra | Price: $149.00 | Store: Amazon | In Stock: Yes
Category: electronics — over-ear headphones (professional/business)

Key Features:
- Professional-grade ANC optimized for open-plan office environments
- 6-microphone array with advanced call algorithm — certified for Microsoft Teams, Zoom, Google Meet
- 49-hour battery life; fast charge 50% in 80 minutes
- Busylight LED on the earcup signals availability to colleagues
- 2-in-1 design: Bluetooth headset + USB connection for headset stand
- Jabra Sound+ app with HearThrough (transparency), Music EQ, and ANC intensity control

Technical Specifications:
- Driver: 40 mm
- Microphone: 6-mic array (3 per earcup)
- Bluetooth version: 5.2
- Codec support: AAC, SBC
- Weight: 310 g
- Certifications: UC (Unified Communications), Microsoft Teams Certified

URL: https://www.amazon.com/dp/B09B1Q4KXG`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'headphones', brand: 'Jabra', price: 149.00, store: 'Amazon', url: 'https://www.amazon.com/dp/B09B1Q4KXG', inStock: true, productId: 'e17' },
  },
  {
    topic: 'Jabra Evolve2 55 Noise Cancelling Headphones — reviews',
    content: `Jabra Evolve2 55 — Customer Reviews & Expert Analysis
Average Rating: 4.3 / 5 | Total Reviews: 4,600

Overall Assessment:
The Evolve2 55 is designed specifically for professional hybrid-work environments. The 6-mic call quality is among the best in any wireless headphone — remote colleagues consistently report excellent voice clarity. ANC for music/commuting is secondary to call-optimized performance. Best business headphone under $200.

Pros (most mentioned by customers):
- Best-in-class call quality — 6-mic array with professional voice processing
- Busylight LED is a genuinely useful open-office feature
- UC-certified for Teams, Zoom, Google Meet — no compatibility issues
- 49-hour battery is exceptional for a business headset
- Jabra Sound+ app call customization is extensive

Cons (most mentioned by customers):
- Heavier (310g) than consumer alternatives — not ideal for all-day casual wear
- ANC for music is adequate but not best-in-class; Sony/Bose lead for music listening
- USB dongle for UC connection sold separately for some SKUs
- Sound signature is flat/neutral — engineered for voice, not music enjoyment
- Price for music listening value is poor compared to Sony WH-CH720N at similar price

Best For:
- Professionals on 4–8 hours of calls daily
- Open-plan office workers who need busylight DO NOT DISTURB signal
- IT-managed Microsoft Teams or Zoom environments
- Remote workers who prioritize call quality over everything else

Sample Customer Reviews:
- "My call quality went from 'you sound muffled' to 'best audio on the team'. Night and day." — ★★★★★
- "Teams certified means zero config on our corporate IT. Just works." — ★★★★★
- "Heavy for 8 hours of wear. My neck gets tired. Great for calls though." — ★★★★☆
- "Sound for music is flat and boring. But I bought it for work, and for that it's perfect." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'headphones', brand: 'Jabra', productId: 'e17', avgRating: 4.3, reviewCount: 4600 },
  },

  // ── Sennheiser HD 450BT ───────────────────────────────────────────────────
  {
    topic: 'Sennheiser HD 450BT Noise Cancelling Headphones — product',
    content: `Sennheiser HD 450BT Wireless Noise Cancelling Headphones
Brand: Sennheiser | Price: $99.95 | Store: Amazon | In Stock: Yes
Category: electronics — over-ear headphones

Key Features:
- Active Noise Cancellation (ANC) with wind noise reduction
- Sennheiser-tuned sound with deep, dynamic bass and clear treble
- 30-hour battery life; USB-C charging
- aptX and AAC codec support for improved wireless audio quality
- Foldable flat design with hard carrying case included
- Voice assistant access (Google Assistant, Amazon Alexa, Siri)
- 3.5 mm wired fallback input

Technical Specifications:
- Driver: 38 mm dynamic
- Frequency response: 18 Hz – 22,000 Hz
- Bluetooth version: 5.0
- Codec support: aptX, AAC, SBC
- Weight: 227 g
- Colors: Black, White

URL: https://www.amazon.com/dp/B085G9F3SX`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'headphones', brand: 'Sennheiser', price: 99.95, store: 'Amazon', url: 'https://www.amazon.com/dp/B085G9F3SX', inStock: true, productId: 'e19' },
  },
  {
    topic: 'Sennheiser HD 450BT Noise Cancelling Headphones — reviews',
    content: `Sennheiser HD 450BT — Customer Reviews & Expert Analysis
Average Rating: 4.3 / 5 | Total Reviews: 7,800

Overall Assessment:
The HD 450BT brings Sennheiser's renowned audio engineering to the sub-$100 tier. Sound quality and aptX codec support place it ahead of JBL and Anker for pure audio fidelity. ANC is decent but not quite the standard of Sony WH-CH720N. Best choice for audiophile-minded buyers on a strict budget.

Pros (most mentioned by customers):
- Sennheiser sound quality — natural, detailed presentation vs bass-heavy competitors
- aptX codec delivers better wireless audio than AAC-only competitors (Anker Q45 has LDAC though)
- Hard carrying case included — better protection than soft pouches
- 30h battery and USB-C charging
- 3.5 mm wired input available

Cons (most mentioned by customers):
- ANC trails Sony WH-CH720N; noticeable difference in noisy environments
- Smart controls on earcup take time to learn; occasional accidental activations
- App feature set is minimal compared to Sony, Jabra, or Soundcore
- No multipoint connection
- Headband padding could be improved for extended wear

Best For:
- Audiophiles wanting Sennheiser sound tuning at entry price
- Users with aptX-capable Android phones wanting better-than-AAC quality
- Buyers who want a hard case included in the box

Sample Customer Reviews:
- "Sennheiser sound in a $100 package. The detail and soundstage are miles better than JBL." — ★★★★★
- "aptX makes a genuine difference on my OnePlus. Cleaner highs than my old ANC headphones." — ★★★★★
- "ANC is mediocre. Sony CH720N is better for blocking noise at the same price." — ★★★☆☆
- "Hard carrying case is a premium touch. Nice when most competitors include a cloth pouch." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'headphones', brand: 'Sennheiser', productId: 'e19', avgRating: 4.3, reviewCount: 7800 },
  },

  // ── Apple AirPods Pro 2nd Gen ──────────────────────────────────────────────
  {
    topic: 'Apple AirPods Pro (2nd Generation) — product',
    content: `Apple AirPods Pro 2nd Generation True Wireless Earbuds
Brand: Apple | Price: $249.00 | Store: Amazon | In Stock: Yes
Category: electronics — in-ear earbuds

Key Features:
- Apple H2 chip — 2× more ANC than 1st gen; computational audio via Apple Silicon
- Adaptive Transparency: processes 48,000 times per second to let in safe sounds
- Personalized Spatial Audio with dynamic head tracking
- Up to 6 hours listening with ANC; 30 hours total with case
- MagSafe Charging Case with built-in speaker, lanyard loop, and Find My
- IPX4 water resistance (earbuds and case)
- Hearing health features: loud sound protection, conversation boost

Technical Specifications:
- Chip: Apple H2
- Connectivity: Bluetooth 5.3
- Codec: AAC (lossless via direct Apple device connection)
- Weight per earbud: 5.3 g
- Colors: White only
- Ear tips: XS, S, M, L (silicone)

URL: https://www.amazon.com/dp/B0CHWRXH8B`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'earbuds', brand: 'Apple', price: 249.00, store: 'Amazon', url: 'https://www.amazon.com/dp/B0CHWRXH8B', inStock: true, productId: 'e2' },
  },
  {
    topic: 'Apple AirPods Pro (2nd Generation) — reviews',
    content: `Apple AirPods Pro 2nd Gen — Customer Reviews & Expert Analysis
Average Rating: 4.7 / 5 | Total Reviews: 32,100

Overall Assessment:
The AirPods Pro 2 deliver the best ANC in a true wireless earbud form factor, outperforming Samsung Galaxy Buds2 Pro and Sony WF-1000XM5 in independent tests. The deep Apple ecosystem integration (instant device switching, head tracking spatial audio, Find My) is unmatched. A premium choice for iPhone users.

Pros (most mentioned by customers):
- Best-in-class ANC for in-ear earbuds — blocks more ambient noise than any competitor
- Adaptive Transparency sounds completely natural — like removing a glass barrier
- Seamless Apple device pairing and switching (iPhone, iPad, Mac, Apple Watch)
- H2 chip computational audio processing is a genuine technical advantage
- Small, lightweight, comfortable for hours

Cons (most mentioned by customers):
- Significant value reduction for Android users (no head tracking, limited controls)
- White-only color option
- Ear tip seal is critical — users with non-standard ear canals may struggle with fit
- $249 price is high for earbuds vs over-ear ANC competitors
- Battery (6h) is lower than over-ear competitors

Best For:
- iPhone users wanting the best wireless earbuds money can buy
- Commuters who prefer in-ear fit to over-ear headphones
- Apple Music subscribers using Dolby Atmos spatial audio

Sample Customer Reviews:
- "ANC is shockingly good. I didn't believe the reviews until I tried them at the airport." — ★★★★★
- "Transparency mode is like magic. I can hold a normal conversation without removing them." — ★★★★★
- "Worth every penny for iPhone users. The seamless switching between devices alone justifies it." — ★★★★★
- "Expensive for earbuds. But there's nothing better at this form factor." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'earbuds', brand: 'Apple', productId: 'e2', avgRating: 4.7, reviewCount: 32100 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ELECTRONICS — LAPTOPS
  // ══════════════════════════════════════════════════════════════════════════

  // ── MacBook Air M3 ────────────────────────────────────────────────────────
  {
    topic: 'Apple MacBook Air M3 13-inch — product',
    content: `Apple MacBook Air M3 13-inch Laptop
Brand: Apple | Price: $1,099.00 | Store: Apple | In Stock: Yes
Category: electronics — laptop

Key Features:
- Apple M3 chip (8-core CPU, 10-core GPU) — fastest chip ever in MacBook Air
- Up to 18 hours battery life
- 13.6" Liquid Retina display (2560×1664, 500 nits, P3 wide color)
- MagSafe 3 charging + 2 Thunderbolt 3 USB-C ports
- 8 GB unified memory (16 GB / 24 GB options)
- 256 GB SSD base storage (configurable up to 2 TB)
- Fanless design — completely silent operation

Technical Specifications:
- CPU: Apple M3 (8-core)
- GPU: 10-core Apple GPU
- RAM: 8 GB unified memory (LPDDR5)
- Storage: 256 GB NVMe SSD
- Display: 13.6" 2560×1664 Liquid Retina
- Weight: 1.24 kg (2.7 lbs)
- Colors: Midnight, Starlight, Space Gray, Sky Blue

URL: https://www.apple.com/shop/buy-mac/macbook-air/13-inch-m3`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'laptop', brand: 'Apple', price: 1099.00, store: 'Apple', url: 'https://www.apple.com/shop/buy-mac/macbook-air/13-inch-m3', inStock: true, productId: 'e5' },
  },
  {
    topic: 'Apple MacBook Air M3 13-inch — reviews',
    content: `Apple MacBook Air M3 — Customer Reviews & Expert Analysis
Average Rating: 4.9 / 5 | Total Reviews: 8,900

Overall Assessment:
The MacBook Air M3 is the best all-around laptop for most people. The combination of M3 performance, 18-hour battery, fanless silent operation, and macOS ecosystem is unmatched in the $1,099 price tier. Wirecutter, The Verge, and CNET all name it their top laptop recommendation for non-power users.

Pros (most mentioned by customers):
- Astonishing battery life — consistently 14–18 hours in real-world use
- Silent fanless operation — never throttles under typical workloads
- M3 chip is dramatically faster than Intel-era Macs and most Windows competition
- Display quality is excellent — bright, accurate colors for photo and video work
- Build quality is best-in-class; aluminum unibody feels premium

Cons (most mentioned by customers):
- Base 8 GB RAM can feel limiting for heavy multitasking or running multiple VMs
- Only 2 USB-C ports — dongle needed for most peripherals
- Base 256 GB storage fills quickly for media-heavy users
- Locked into macOS ecosystem — not suitable for Windows-specific software
- Webcam quality (1080p FaceTime HD) lags behind some Windows competitors

Best For:
- Students, writers, and creative professionals on macOS
- Anyone prioritizing battery life and silence above raw performance
- Users already invested in the Apple ecosystem

Sample Customer Reviews:
- "I've had it unplugged for 3 days on light use. Battery life is absurd." — ★★★★★
- "M3 handles 4K video editing in Final Cut without breaking a sweat. Fanless." — ★★★★★
- "8GB RAM feels tight when running Figma + Slack + Chrome. Should have got 16GB." — ★★★★☆
- "Best laptop I've ever owned. The display is gorgeous and it's whisper quiet." — ★★★★★`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'laptop', brand: 'Apple', productId: 'e5', avgRating: 4.9, reviewCount: 8900 },
  },

  // ── Lenovo ThinkPad X1 Carbon Gen 11 ─────────────────────────────────────
  {
    topic: 'Lenovo ThinkPad X1 Carbon Gen 11 — product',
    content: `Lenovo ThinkPad X1 Carbon Gen 11 Business Laptop
Brand: Lenovo | Price: $1,349.00 | Store: Lenovo | In Stock: Yes
Category: electronics — laptop

Key Features:
- Intel Core i7-1365U (13th Gen) processor
- 14" IPS display (1920×1200, 400 nits anti-glare, optional 2.8K OLED)
- Ultra-lightweight at 1.12 kg (2.48 lbs) — MIL-SPEC 810H durability certified
- Up to 15 hours battery life
- Comprehensive ports: 2× Thunderbolt 4, 2× USB-A 3.2, HDMI 2.0, headphone jack, microSD
- Best-in-class ThinkPad keyboard with 1.5 mm key travel
- Business security: IR camera + fingerprint reader + optional Smart Card reader

Technical Specifications:
- CPU: Intel Core i7-1365U (10-core, up to 5.2 GHz)
- RAM: 16 GB LPDDR5 (soldered)
- Storage: 512 GB NVMe SSD
- Display: 14.0" IPS 1920×1200
- Weight: 1.12 kg
- OS: Windows 11 Pro

URL: https://www.lenovo.com/us/en/p/laptops/thinkpad/thinkpadx1/x1-carbon-gen-11`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'laptop', brand: 'Lenovo', price: 1349.00, store: 'Lenovo', url: 'https://www.lenovo.com/us/en/p/laptops/thinkpad/thinkpadx1/x1-carbon-gen-11', inStock: true, productId: 'e20' },
  },
  {
    topic: 'Lenovo ThinkPad X1 Carbon Gen 11 — reviews',
    content: `Lenovo ThinkPad X1 Carbon Gen 11 — Customer Reviews & Expert Analysis
Average Rating: 4.6 / 5 | Total Reviews: 3,400

Overall Assessment:
The X1 Carbon Gen 11 remains the gold standard for enterprise Windows ultrabooks. Unmatched keyboard, comprehensive ports (rare at this weight), and MIL-SPEC durability make it a professional's first choice. Intel performance is competitive but trails Apple M3 in efficiency and battery life.

Pros (most mentioned by customers):
- The best keyboard on any laptop — deep travel, precise feedback, backlit
- Lightest laptop in its class with MIL-SPEC drop/dust/vibration certification
- All the ports you need in one device: USB-A, USB-C, HDMI, headphone jack
- Corporate IT management tools and security features are best-in-class
- 4G LTE option available for always-connected enterprise use

Cons (most mentioned by customers):
- Battery (12–15h) trails Apple M3 MacBook Air (18h) considerably
- Fan noise is noticeable under CPU load; not silent like MacBook Air
- RAM is soldered — cannot be upgraded after purchase
- Premium pricing; can feel expensive vs MacBook Air for non-enterprise users
- Webcam quality on base model is 720p — below standard in 2024

Best For:
- Enterprise IT environments requiring Windows + security features
- Business travelers who need durability and comprehensive ports
- Keyboard enthusiasts who type all day

Sample Customer Reviews:
- "ThinkPad keyboard is a religion. I refuse to use anything else for 8 hours of writing." — ★★★★★
- "IT deployed 200 of these. Zero hardware failures in 18 months. Reliability is unmatched." — ★★★★★
- "Battery is good but my colleague's MacBook Air M3 last 2× as long. That stings at $1,349." — ★★★★☆
- "All my dongles can stay in the drawer. USB-A + HDMI + USB-C on one laptop in 2024 is rare." — ★★★★★`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'laptop', brand: 'Lenovo', productId: 'e20', avgRating: 4.6, reviewCount: 3400 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ELECTRONICS — SMARTPHONES
  // ══════════════════════════════════════════════════════════════════════════

  // ── iPhone 15 Pro ─────────────────────────────────────────────────────────
  {
    topic: 'Apple iPhone 15 Pro — product',
    content: `Apple iPhone 15 Pro Smartphone
Brand: Apple | Price: $999.00 | Store: Apple | In Stock: Yes
Category: electronics — smartphone

Key Features:
- A17 Pro chip (3nm) — fastest mobile chip; hardware ray tracing
- Titanium frame — strongest, lightest Pro design; grade 5 titanium
- 48 MP main camera + 12 MP ultrawide + 12 MP 3× telephoto (optical zoom)
- Action button (customizable hardware button replacing mute switch)
- USB-C with USB 3 speeds (up to 10 Gbps) for ProRes video transfer
- ProRes and Log video recording at up to 4K 60fps
- Dynamic Island notification system

Technical Specifications:
- Display: 6.1" Super Retina XDR OLED (2556×1179, 2000 nits peak)
- Chip: Apple A17 Pro (6-core CPU, 6-core GPU)
- RAM: 8 GB
- Storage: 128 GB / 256 GB / 512 GB / 1 TB
- Battery: ~23h video playback
- 5G: Sub-6 GHz and mmWave
- Colors: Black Titanium, White Titanium, Blue Titanium, Natural Titanium

URL: https://www.apple.com/shop/buy-iphone/iphone-15-pro`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'smartphone', brand: 'Apple', price: 999.00, store: 'Apple', url: 'https://www.apple.com/shop/buy-iphone/iphone-15-pro', inStock: true, productId: 'e6' },
  },
  {
    topic: 'Apple iPhone 15 Pro — reviews',
    content: `Apple iPhone 15 Pro — Customer Reviews & Expert Analysis
Average Rating: 4.8 / 5 | Total Reviews: 45,200

Overall Assessment:
The iPhone 15 Pro is the complete professional smartphone package. The A17 Pro leads mobile benchmarks by a significant margin. Camera capabilities (especially ProRes video and 3× optical zoom) are best-in-class. The titanium build feels premium without the weight penalty. The switch to USB-C is long overdue but welcome.

Pros (most mentioned by customers):
- A17 Pro is the fastest mobile chip available — future-proofed for years
- Camera system is best-in-class: natural color science, excellent low-light, ProRes video
- Titanium body is noticeably lighter and more premium than aluminum
- Action Button is genuinely customizable and useful
- USB-C finally replaces Lightning; USB 3 speeds are fast for ProRes workflow

Cons (most mentioned by customers):
- $999 base price is premium; 128 GB storage feels insufficient at this price
- ProMotion 120Hz display is now expected but was missing on base iPhone 15
- Battery life (23h) trails some Android flagships like Galaxy S24 Ultra
- Gets warm during intensive tasks (A17 Pro thermal management)
- No significant design change from iPhone 14 Pro

Best For:
- Professional photographers and videographers who need ProRes
- iOS ecosystem users who want the best performance available
- Users who value resale value and software longevity (5–6 years of updates)

Sample Customer Reviews:
- "Camera is insane. ProRes footage looks better than my old mirrorless camera." — ★★★★★
- "Titanium feels amazing. My iPhone 14 Pro now feels cheap by comparison." — ★★★★★
- "USB-C is great but 128GB base storage for $999 is insulting. Always buy 256GB." — ★★★★☆
- "A17 Pro is incredibly fast. Gaming, video editing, AI tasks — nothing slows it down." — ★★★★★`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'smartphone', brand: 'Apple', productId: 'e6', avgRating: 4.8, reviewCount: 45200 },
  },

  // ── Samsung Galaxy S24 Ultra ──────────────────────────────────────────────
  {
    topic: 'Samsung Galaxy S24 Ultra Smartphone — product',
    content: `Samsung Galaxy S24 Ultra Smartphone
Brand: Samsung | Price: $1,299.00 | Store: Amazon | In Stock: Yes
Category: electronics — smartphone

Key Features:
- Snapdragon 8 Gen 3 (exclusive to S24 Ultra in US) — fastest Android performance
- Built-in S Pen for precision note-taking, sketching, and on-screen control
- 200 MP main camera + 12 MP ultrawide + 10 MP 3× telephoto + 50 MP 5× telephoto
- 6.8" QHD+ Dynamic AMOLED display (3088×1440, 2600 nits peak, 1–120Hz adaptive)
- Galaxy AI features: Circle to Search, live translation, chat summarization
- 5000 mAh battery with 45W wired + 15W wireless charging
- Titanium frame (grade 2) — IP68 water and dust resistance

Technical Specifications:
- Display: 6.8" QHD+ AMOLED (3088×1440, 120Hz)
- Chip: Snapdragon 8 Gen 3 (US) / Exynos 2400 (intl.)
- RAM: 12 GB
- Storage: 256 GB / 512 GB / 1 TB
- Battery: 5000 mAh
- Colors: Titanium Gray, Black, Violet, Yellow, Orange, Green, Blue

URL: https://www.amazon.com/dp/B0CMDWC436`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'smartphone', brand: 'Samsung', price: 1299.00, store: 'Amazon', url: 'https://www.amazon.com/dp/B0CMDWC436', inStock: true, productId: 'e7' },
  },
  {
    topic: 'Samsung Galaxy S24 Ultra Smartphone — reviews',
    content: `Samsung Galaxy S24 Ultra — Customer Reviews & Expert Analysis
Average Rating: 4.6 / 5 | Total Reviews: 18,700

Overall Assessment:
The S24 Ultra is the ultimate Android powerhouse. The 200 MP camera system with 5× optical telephoto is unrivalled for zoom photography. The S Pen remains unique and invaluable for productivity. Galaxy AI features lead the Android ecosystem. Battery life is consistently excellent at ~36 hours of mixed use.

Pros (most mentioned by customers):
- 200 MP camera with 5× optical zoom is class-leading for zoom and detail
- S Pen is uniquely useful — no other flagship offers this
- Galaxy AI (Circle to Search, Note Assist, live translation) is genuinely productive
- Best Android battery life in the flagship tier — consistently 30–36 hours
- 6.8" display is gorgeous; 2600 nits peak brightness visible in direct sunlight

Cons (most mentioned by customers):
- $1,299 starting price; most power users need 512 GB which pushes it to $1,419
- Large and heavy (232g) — not suitable for users with smaller hands
- Galaxy AI requires Samsung account and data sharing
- Titanium is grade 2 (softer) vs iPhone 15 Pro's grade 5
- One UI can feel bloated with Samsung/Google duplicate apps

Best For:
- Android power users who want the best camera, S Pen productivity, and AI
- Photography enthusiasts who frequently shoot zoom subjects (wildlife, sports, events)
- Business users who take handwritten notes and need long battery life

Sample Customer Reviews:
- "The 5× zoom is a game changer. Concert and sports photos are incredible." — ★★★★★
- "S Pen + Note Assist is my replacement for a notebook. Take notes in meetings, AI summarizes." — ★★★★★
- "30+ hour battery consistently. I charge every other day. Incredible." — ★★★★★
- "Heavy and big. Almost dropped it getting it out of my pocket. Needs a good case." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'smartphone', brand: 'Samsung', productId: 'e7', avgRating: 4.6, reviewCount: 18700 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HOME APPLIANCES
  // ══════════════════════════════════════════════════════════════════════════

  // ── Instant Pot Duo 7-in-1 ────────────────────────────────────────────────
  {
    topic: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker — product',
    content: `Instant Pot Duo 7-in-1 Electric Pressure Cooker (6 Quart)
Brand: Instant Pot | Price: $89.99 | Store: Amazon | In Stock: Yes
Category: home — kitchen appliance

Key Features:
- 7 cooking functions: pressure cook, slow cook, rice cooker, steamer, sauté, yogurt maker, warmer
- 6-quart capacity serves 4–6 people (3 qt and 8 qt also available)
- Up to 70% faster cooking vs conventional methods
- 14 one-touch smart programs (soup, beans, meat, poultry, etc.)
- Safety certified with 10 safety mechanisms
- Stainless steel cooking pot (food-grade 304) — no non-stick coating to scratch or chip

Technical Specifications:
- Capacity: 6 quarts
- Power: 1000W
- Pressure: High (10–12 psi) / Low (5.8–7.2 psi)
- Material: Stainless steel inner pot
- Dimensions: 33 × 31 × 31 cm
- Weight: 5.35 kg
- Cord length: 92 cm

URL: https://www.amazon.com/dp/B00FLYWNYQ`,
    metadata: { type: 'product', category: 'home', subcategory: 'kitchen', brand: 'Instant Pot', price: 89.99, store: 'Amazon', url: 'https://www.amazon.com/dp/B00FLYWNYQ', inStock: true, productId: 'h1' },
  },
  {
    topic: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker — reviews',
    content: `Instant Pot Duo 7-in-1 — Customer Reviews & Expert Analysis
Average Rating: 4.7 / 5 | Total Reviews: 87,000

Overall Assessment:
The Instant Pot Duo is the best-selling kitchen appliance on Amazon for good reason. It genuinely replaces 7 separate appliances and dramatically reduces cooking time. The learning curve for pressure cooking is real but well-documented via the massive Instant Pot community. An essential tool for meal prep and batch cooking.

Pros (most mentioned by customers):
- Replaces pressure cooker, slow cooker, rice cooker, steamer, sauté pan, yogurt maker, food warmer
- Dramatically faster than conventional cooking: dried beans in 25 minutes, whole chicken in 20 minutes
- Extremely large and helpful online community with thousands of tested recipes
- Stainless steel pot is durable and easy to clean (dishwasher safe)
- 10-safety-mechanism certification makes pressure cooking safe for beginners

Cons (most mentioned by customers):
- Learning curve: first-time pressure cooker users need 3–4 uses to feel confident
- Lid seal can absorb cooking odors (keep lid off when stored)
- Pressure cook cycle requires additional time to pressurize (10–15 minutes before cooking begins)
- 6-quart size is large for 1–2 person households
- Buttons and programs are slightly confusing initially

Best For:
- Families and meal-prep cooks who want to reduce cooking time
- Dried bean and legume cooking (beans from dry in 25–30 minutes)
- Budget-conscious cooks who want to replace multiple appliances with one

Sample Customer Reviews:
- "Dried chickpeas in 25 minutes from scratch. This changed my cooking completely." — ★★★★★
- "Replaced my slow cooker, rice cooker, and steamer. Counter space reclaimed." — ★★★★★
- "Took me 3 attempts to understand pressure cooking. Now I use it every day." — ★★★★★
- "Seal ring absorbs garlic smell. I keep a separate ring for desserts. Small annoyance." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'home', subcategory: 'kitchen', brand: 'Instant Pot', productId: 'h1', avgRating: 4.7, reviewCount: 87000 },
  },

  // ── Dyson V15 Detect ──────────────────────────────────────────────────────
  {
    topic: 'Dyson V15 Detect Cordless Vacuum Cleaner — product',
    content: `Dyson V15 Detect Cordless Stick Vacuum Cleaner
Brand: Dyson | Price: $749.99 | Store: Dyson | In Stock: Yes
Category: home — vacuum cleaner

Key Features:
- Laser Detect technology: reveals hidden dust particles invisible to naked eye on hard floors
- Piezo sensor counts and categorizes particle size 15,000 times/second; adapts suction automatically
- 240 AW suction power — most powerful cordless vacuum Dyson makes
- HEPA filtration (H13) captures 99.97% of particles as small as 0.3 microns (allergist recommended)
- Up to 60 minutes run time on Eco mode; LCD screen shows remaining battery
- Includes Hair Screw tool — self-untangles hair as you vacuum (no scissors needed)
- 5 cleaner head and tool options in box

Technical Specifications:
- Suction: 240 AW
- Motor: Dyson Hyperdymium 125,000 RPM
- Filtration: H13 HEPA
- Run time: up to 60 min (Eco); 10 min (Boost)
- Bin volume: 0.77 L
- Weight: 3.1 kg
- Charge time: 4.5 hours

URL: https://www.dyson.com/vacuum-cleaners/cordless/v15/detect`,
    metadata: { type: 'product', category: 'home', subcategory: 'cleaning', brand: 'Dyson', price: 749.99, store: 'Dyson', url: 'https://www.dyson.com/vacuum-cleaners/cordless/v15/detect', inStock: true, productId: 'h2' },
  },
  {
    topic: 'Dyson V15 Detect Cordless Vacuum Cleaner — reviews',
    content: `Dyson V15 Detect — Customer Reviews & Expert Analysis
Average Rating: 4.8 / 5 | Total Reviews: 11,200

Overall Assessment:
The V15 Detect is the definitive premium cordless vacuum. Laser reveal technology sounds gimmicky but is genuinely revelatory — users consistently describe being shocked by the dust they were missing. The auto-adapting suction, HEPA filtration, and 60-minute battery make it suitable for large homes without compromising allergy management.

Pros (most mentioned by customers):
- Laser dust detection on hard floors is genuinely useful and satisfying to use
- Suction power is best-in-class among cordless models; matches many corded vacuums
- H13 HEPA filtration is critical for allergy and asthma sufferers
- Hair Screw tool genuinely doesn't tangle — pet owners particularly praise this
- Auto-mode intelligently adjusts suction to surface type

Cons (most mentioned by customers):
- $749 price is a major barrier — 3–4× the price of budget cordless vacuums
- 0.77L bin is small for large homes; requires frequent emptying during big cleans
- Heavy for an overhead vacuum (3.1 kg arm fatigue on ceilings)
- Charging time of 4.5 hours is slow vs 2 hours for some competitors
- Short boost mode duration (10 min) limiting for very thick carpet

Best For:
- Allergy and asthma sufferers who need HEPA-certified filtration
- Pet owners battling hair tangles and dander
- Users with mixed hard floor and carpet homes who want adaptive cleaning

Sample Customer Reviews:
- "The laser mode on my kitchen floor made me want to throw out my old vacuum. Disgusting what I was missing." — ★★★★★
- "My allergist noticed improvement after I switched. HEPA filtration is non-negotiable for me." — ★★★★★
- "Expensive but I've had my V10 for 6 years. Dyson lasts. Justified the cost." — ★★★★★
- "Bin is too small. I empty it twice cleaning my 2000 sq ft house." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'home', subcategory: 'cleaning', brand: 'Dyson', productId: 'h2', avgRating: 4.8, reviewCount: 11200 },
  },

  // ── KitchenAid Artisan Stand Mixer ────────────────────────────────────────
  {
    topic: 'KitchenAid Artisan Series 5-Quart Stand Mixer — product',
    content: `KitchenAid Artisan Series 5-Quart Tilt-Head Stand Mixer
Brand: KitchenAid | Price: $379.99 | Store: Target | In Stock: Yes
Category: home — kitchen appliance

Key Features:
- 325W motor with 10 speed settings for mixing, whipping, and kneading
- 5-quart stainless steel bowl handles up to 9 dozen cookies or 4 loaves of bread per batch
- Tilt-Head design for easy bowl and attachment access
- Hub-powered 10 attachment port drives 15+ optional attachments (pasta, meat grinder, ice cream maker, etc.)
- Planetary mixing action: 67 touchpoints per rotation for thorough mixing
- Available in 30+ colors to match kitchen décor

Technical Specifications:
- Motor: 325W direct drive
- Speeds: 10
- Bowl: 5 qt stainless steel
- Attachments included: flat beater, dough hook, wire whip
- Dimensions: 35.6 × 22.9 × 35.6 cm
- Weight: 11.2 kg
- Cord: 90 cm

URL: https://www.target.com/p/kitchenaid-artisan-series-5-quart-tilt-head-stand-mixer/-/A-14736529`,
    metadata: { type: 'product', category: 'home', subcategory: 'kitchen', brand: 'KitchenAid', price: 379.99, store: 'Target', url: 'https://www.target.com/p/kitchenaid-artisan-series-5-quart-tilt-head-stand-mixer/-/A-14736529', inStock: true, productId: 'h5' },
  },
  {
    topic: 'KitchenAid Artisan Series 5-Quart Stand Mixer — reviews',
    content: `KitchenAid Artisan Stand Mixer — Customer Reviews & Expert Analysis
Average Rating: 4.8 / 5 | Total Reviews: 32,000

Overall Assessment:
The KitchenAid Artisan has been the gold standard home stand mixer for 50+ years. Its build quality, attachment ecosystem, and reliability are unmatched. Home bakers consistently describe it as a generational appliance. The attachment hub transforming it into a pasta maker, meat grinder, or ice cream churner is a key differentiator.

Pros (most mentioned by customers):
- 50+ year track record of reliability — reviewers regularly mention 20–30 year old KitchenAids still running
- Attachment hub: 15+ optional attachments make it a versatile kitchen multi-tool
- Planetary mixing action ensures consistent, thorough mixing across the entire bowl
- Available in 30+ colors — design-forward complement to kitchen aesthetic
- Commercial-grade materials at home appliance pricing

Cons (most mentioned by customers):
- Heavy at 11.2 kg — not easy to move; most users keep it permanently on the counter
- Walk (movement across counter) at high speeds on dough; rubber feet can loosen
- 5 qt bowl capacity, while large, doesn't suit very large batch baking (8+ quarts available separately)
- Price; budget-conscious bakers can find functional alternatives for $150–$200
- Accessories are expensive when purchased from KitchenAid directly

Best For:
- Regular home bakers who make bread, cookies, or cakes weekly
- Users who want the attachment ecosystem (pasta, meat, grain milling)
- Anyone looking for an appliance they'll own for 20+ years

Sample Customer Reviews:
- "My mother bought her KitchenAid in 1987. Still running. I bought mine last year. Heirloom quality." — ★★★★★
- "Pasta attachment changed my cooking life. Fresh pasta in 15 minutes." — ★★★★★
- "Walks slightly on bread dough at speed 2. Keep a hand on it for stiff doughs." — ★★★★☆
- "Worth every cent. Made 12 dozen Christmas cookies in one session without the motor even getting warm." — ★★★★★`,
    metadata: { type: 'reviews', category: 'home', subcategory: 'kitchen', brand: 'KitchenAid', productId: 'h5', avgRating: 4.8, reviewCount: 32000 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CLOTHING & FOOTWEAR
  // ══════════════════════════════════════════════════════════════════════════

  // ── Nike Air Max 270 ──────────────────────────────────────────────────────
  {
    topic: 'Nike Air Max 270 Running Shoes — product',
    content: `Nike Air Max 270 Lifestyle / Running Shoes
Brand: Nike | Price: $150.00 | Store: Nike | In Stock: Yes
Category: clothing — athletic footwear

Key Features:
- Nike's tallest Air unit heel (32mm) — maximum cushioning for all-day comfort
- Engineered mesh upper — breathable, lightweight, stretchy fit
- Rubber outsole with waffle-pattern traction for durability and grip
- Available in 20+ colorways for men and women
- Lifestyle shoe with light running capability (not engineered for marathon training)

Technical Specifications:
- Upper: Engineered mesh + synthetic overlays
- Midsole: Foam + Nike Air Max 270 unit (32mm heel)
- Outsole: Rubber
- Weight: 298 g (Men's US 10)
- Sizes: Men's 6–15, Women's 5–12 (half sizes available)
- Width: Standard (D for men, B for women)

URL: https://www.nike.com/t/air-max-270-mens-shoes`,
    metadata: { type: 'product', category: 'clothing', subcategory: 'footwear', brand: 'Nike', price: 150.00, store: 'Nike', url: 'https://www.nike.com/t/air-max-270-mens-shoes', inStock: true, productId: 'c1' },
  },
  {
    topic: 'Nike Air Max 270 Running Shoes — reviews',
    content: `Nike Air Max 270 — Customer Reviews & Expert Analysis
Average Rating: 4.5 / 5 | Total Reviews: 9,800

Overall Assessment:
The Air Max 270 is Nike's best-selling lifestyle sneaker. The 32mm Air heel unit delivers exceptional underfoot cushioning for casual wear, walking, and light running. Not designed for technical running performance — buyers who expect it to replace dedicated running shoes are often disappointed. For all-day comfort and style, it excels.

Pros (most mentioned by customers):
- Exceptional heel cushioning — best in class for a lifestyle/casual sneaker
- Breathable engineered mesh keeps feet cool in warm weather
- Wide colorway selection for style-conscious buyers
- Very comfortable from day one — minimal break-in required
- Versatile aesthetic works for casual and semi-athletic settings

Cons (most mentioned by customers):
- Not suitable for serious running; midsole stack is too high for responsive running feel
- Runs slightly narrow — wide-footed buyers should consider half size up
- 32mm heel creates a slight heel drop that some wearers find awkward initially
- Air unit is visually prominent — love it or hate it aesthetically
- Pricey at $150 for a lifestyle sneaker; sale pricing makes them much better value

Best For:
- All-day walking, standing jobs, casual wear
- Air Max collectors and Nike lifestyle enthusiasts
- Buyers who prioritize cushioning comfort over athletic performance

Sample Customer Reviews:
- "Standing for 8 hours in retail. These are the only shoes that don't leave my feet aching." — ★★★★★
- "Wore them all day at Disneyland. Zero foot pain. Incredible cushioning." — ★★★★★
- "Runs slightly narrow. I went half size up and they fit perfectly." — ★★★★☆
- "Great casual shoe but don't try to run 5K in them. Got proper running shoes for that." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'clothing', subcategory: 'footwear', brand: 'Nike', productId: 'c1', avgRating: 4.5, reviewCount: 9800 },
  },

  // ── Adidas Ultraboost 23 ──────────────────────────────────────────────────
  {
    topic: 'Adidas Ultraboost 23 Running Shoes — product',
    content: `Adidas Ultraboost 23 Running Shoes
Brand: Adidas | Price: $190.00 | Store: Adidas | In Stock: Yes
Category: clothing — athletic footwear / running shoes

Key Features:
- BOOST midsole technology — energy return in every stride; responsive and cushioned
- Primeknit+ upper — adaptive, sock-like fit with targeted support zones
- Linear Energy Push (LEP+) system — flexible carbon-fiber-inspired plate for efficiency
- Continental rubber outsole — BMW-partnership rubber compound for grip in wet conditions
- Designed for daily training and long-distance running
- Heel counter for stability on longer runs

Technical Specifications:
- Upper: Primeknit+ (recycled materials)
- Midsole: BOOST + LEP+ system
- Outsole: Continental rubber
- Drop: 10mm
- Weight: 310 g (Men's UK 8.5)
- Sizes: Men's 3.5–17 UK, Women's 3–9 UK

URL: https://www.adidas.com/us/ultraboost-23-shoes/GY9351.html`,
    metadata: { type: 'product', category: 'clothing', subcategory: 'footwear', brand: 'Adidas', price: 190.00, store: 'Adidas', url: 'https://www.adidas.com/us/ultraboost-23-shoes/GY9351.html', inStock: true, productId: 'c2' },
  },
  {
    topic: 'Adidas Ultraboost 23 Running Shoes — reviews',
    content: `Adidas Ultraboost 23 — Customer Reviews & Expert Analysis
Average Rating: 4.6 / 5 | Total Reviews: 7,600

Overall Assessment:
The Ultraboost 23 is Adidas's premium daily trainer that crosses over into lifestyle use. The BOOST midsole is consistently rated as the most comfortable running foam by long-distance runners. The Primeknit upper adapts to foot shape uniquely well. Best for daily training runs of 5–15 km and casual wear.

Pros (most mentioned by customers):
- BOOST foam is genuinely the most comfortable underfoot experience in running
- Primeknit upper is sock-like — adapts to different foot shapes better than rigid uppers
- Continental rubber outsole grip in wet conditions is notably superior to most alternatives
- Versatile enough for running AND casual wear without looking athletic
- Durable — consistent reports of 700–1000 km lifespan before sole compression

Cons (most mentioned by customers):
- $190 price is at the high end for daily trainers
- Not a race shoe — lacks the propulsive carbon plate of Adizero Adios Pro
- Primeknit can wear through at the big toe area after heavy mileage
- Heavier than newer super-foam competitors (310g vs Puma Deviate Nitro at 265g)
- Boost foam absorbs water and becomes heavy in wet conditions

Best For:
- Daily training runs (5–15 km) where comfort is the priority
- Runners who want a shoe that works for running AND casual walking
- Long-distance runners who value energy return in the late miles

Sample Customer Reviews:
- "Best mileage shoe I've ever owned. 900 km and the BOOST still feels cushioned." — ★★★★★
- "I wear these to the office on casual Fridays. They're stylish enough. And comfortable all day." — ★★★★★
- "Wet Continental rubber grip is genuinely impressive in the rain. No slipping." — ★★★★★
- "Heavy compared to modern race shoes but for training comfort there's nothing better." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'clothing', subcategory: 'footwear', brand: 'Adidas', productId: 'c2', avgRating: 4.6, reviewCount: 7600 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SPORTS & FITNESS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Garmin Fenix 7 ────────────────────────────────────────────────────────
  {
    topic: 'Garmin Fenix 7 GPS Multisport Smartwatch — product',
    content: `Garmin Fenix 7 GPS Multisport Smartwatch
Brand: Garmin | Price: $699.99 | Store: REI | In Stock: Yes
Category: sports — GPS smartwatch

Key Features:
- Multi-band GPS for precise outdoor tracking (running, hiking, cycling, swimming, skiing)
- Up to 18 days battery in smartwatch mode; 57 hours GPS mode
- Solar charging option (Fenix 7S/7X Solar models) extends battery further
- Full-color TopoActive maps with turn-by-turn navigation; 32 GB storage
- Advanced health metrics: HRV, VO2 max, training load, body battery, sleep staging
- Sapphire crystal display (Solar/Sapphire variants); MIL-SPEC 810 durability
- Dive-ready: 10 ATM water resistance

Technical Specifications:
- Display: 1.3" MIP (240×240)
- GPS: Multi-band (L1+L5)
- Battery: 18 days smartwatch / 57 h GPS mode
- Storage: 32 GB
- Weight: 79 g (standard)
- Water resistance: 10 ATM
- Connectivity: Bluetooth, ANT+, Wi-Fi

URL: https://www.rei.com/product/garmin-fenix-7`,
    metadata: { type: 'product', category: 'sports', subcategory: 'smartwatch', brand: 'Garmin', price: 699.99, store: 'REI', url: 'https://www.rei.com/product/garmin-fenix-7', inStock: true, productId: 's2' },
  },
  {
    topic: 'Garmin Fenix 7 GPS Multisport Smartwatch — reviews',
    content: `Garmin Fenix 7 — Customer Reviews & Expert Analysis
Average Rating: 4.7 / 5 | Total Reviews: 8,900

Overall Assessment:
The Fenix 7 is the definitive multisport GPS watch for serious outdoor athletes. GPS accuracy, battery life, and training analysis are unmatched in the consumer smartwatch market. The mapping and navigation capability is genuinely useful for trail running, hiking, and backcountry skiing. Apple Watch and Galaxy Watch athletes who try a Garmin rarely go back.

Pros (most mentioned by customers):
- GPS accuracy is best-in-class: multi-band L1/L5 delivers sub-meter precision
- 18-day battery life eliminates the charging anxiety of Apple Watch / Galaxy Watch
- Full topographic maps with turn-by-turn navigation — genuine outdoor safety tool
- Training status, HRV monitoring, and body battery are accurate and actionable
- MIL-SPEC durability and 10 ATM water resistance for any adventure sport

Cons (most mentioned by customers):
- $700 price is substantial; most casual fitness users don't need this level of capability
- Interface and menus have a learning curve; less intuitive than Apple Watch or Fitbit
- Smartwatch features (apps, Spotify, payments) are less polished than Apple Watch
- Heavy and large on the wrist vs sleeker competitors
- Syncing to Garmin Connect requires phone; analysis is in-app only

Best For:
- Trail runners, hikers, and cyclists who need navigation and long battery
- Triathletes and multisport athletes who track swimming, cycling, and running
- Backcountry adventurers who need mapping and safety data

Sample Customer Reviews:
- "Ran a 50-mile ultra without charging. Apple Watch would have needed 3 charges." — ★★★★★
- "Turn-by-turn on trails is a safety game changer. Never worried about getting lost." — ★★★★★
- "Learning curve is real. Took 2 weeks to find all the features I wanted. Worth it." — ★★★★★
- "HRV and training status coaching is remarkably accurate. Predicted my overtraining burnout." — ★★★★★`,
    metadata: { type: 'reviews', category: 'sports', subcategory: 'smartwatch', brand: 'Garmin', productId: 's2', avgRating: 4.7, reviewCount: 8900 },
  },

  // ── Bowflex SelectTech 552 ────────────────────────────────────────────────
  {
    topic: 'Bowflex SelectTech 552 Adjustable Dumbbells — product',
    content: `Bowflex SelectTech 552 Adjustable Dumbbells (Pair)
Brand: Bowflex | Price: $379.00 | Store: Best Buy | In Stock: No
Category: sports — home gym / free weights

Key Features:
- Adjusts from 5 to 52.5 lbs in 2.5 lb increments (15 weight settings per dumbbell)
- Replaces 15 sets of traditional dumbbells (5 to 52.5 lbs)
- Dial adjustment system changes weight in seconds — no fumbling with collars or plates
- Molded cradle tray included for storage and workout organization
- Space-saving: 2 dumbbells replace a full rack of 15 dumbbell pairs
- Durable engineering resin and metal plates

Technical Specifications:
- Weight range: 5–52.5 lbs per dumbbell (2.5 lb increments from 5–25 lbs; 5 lb increments above 25 lbs)
- Length: 40.6 cm (extended); varies with weight selected
- Materials: engineered resin, metal plates
- Warranty: 2 years on parts, 1 year on labor
- Includes: 2 dumbbells + 2 storage trays

URL: https://www.bestbuy.com/site/bowflex-selecttech-552-adjustable-dumbbells/6422485.p`,
    metadata: { type: 'product', category: 'sports', subcategory: 'home gym', brand: 'Bowflex', price: 379.00, store: 'Best Buy', url: 'https://www.bestbuy.com/site/bowflex-selecttech-552-adjustable-dumbbells/6422485.p', inStock: false, productId: 's5' },
  },
  {
    topic: 'Bowflex SelectTech 552 Adjustable Dumbbells — reviews',
    content: `Bowflex SelectTech 552 — Customer Reviews & Expert Analysis
Average Rating: 4.7 / 5 | Total Reviews: 9,200

Overall Assessment:
The SelectTech 552 is consistently rated the best adjustable dumbbell for home gyms. The dial adjustment mechanism is the fastest and most reliable on the market. Replacing 15 dumbbell pairs in the footprint of 2 is the key value proposition for space-limited home gym users. Often out of stock due to high demand.

Pros (most mentioned by customers):
- Fastest weight change of any adjustable dumbbell — 3 seconds with the dial system
- Replaces enormous dumbbell rack — critical for apartment and small home gym owners
- 5–52.5 lbs range covers almost all home strength training exercises
- Storage trays keep workout area tidy and protect the adjustment mechanism
- Build quality is durable; many reviewers report 5+ years of daily use without failure

Cons (most mentioned by customers):
- Frequently out of stock; high demand means waiting periods or secondary market prices
- 52.5 lbs max is limiting for advanced lifters (Bowflex 1090 adjusts to 90 lbs)
- Cannot be used on a rack — must return to tray between sets
- Plastic mechanism can make noise under heavy loads
- Long length (40.6 cm) makes some exercises (preacher curl, close-grip work) awkward

Best For:
- Space-limited home gym owners who need a full dumbbell range
- Intermediate lifters (5–52.5 lbs covers nearly all exercises for this population)
- Anyone replacing a 15-pair commercial dumbbell rack

Sample Customer Reviews:
- "Moved from a 2-bedroom to an apartment. These replaced my entire dumbbell rack. Life saver." — ★★★★★
- "5 years, 4 days per week. Mechanism still works perfectly. Best gym investment I've made." — ★★★★★
- "52.5 lbs is limiting once you get stronger. Wish I'd bought the 1090s." — ★★★★☆
- "Dial is so much faster than screw-collar competitors. Set up a circuit in seconds." — ★★★★★`,
    metadata: { type: 'reviews', category: 'sports', subcategory: 'home gym', brand: 'Bowflex', productId: 's5', avgRating: 4.7, reviewCount: 9200 },
  },

  // ── Apple Watch Ultra 2 ───────────────────────────────────────────────────
  {
    topic: 'Apple Watch Ultra 2 — product',
    content: `Apple Watch Ultra 2 GPS + Cellular Smartwatch
Brand: Apple | Price: $799.00 | Store: Apple | In Stock: Yes
Category: sports — smartwatch

Key Features:
- S9 SiP chip with 64-bit dual-core CPU; Neural Engine for on-device ML
- Precision dual-frequency GPS (L1+L5) with 3D track and turn-by-turn navigation
- Up to 60 hours battery in Low Power Mode; 36 hours normal use
- 49mm titanium case — Apple's largest, most rugged watch
- 2000-nit display — readable in direct sunlight
- Water resistant to 100m (EN 13319 dive standard)
- Action Button: customizable hardware button for one-press actions
- Temperature sensor (skin and ambient), advanced workout metrics

Technical Specifications:
- Display: 49mm Always-On Retina LTPO OLED (410×502, 2000 nits)
- Chip: Apple S9 SiP
- GPS: Dual-frequency L1 + L5
- Battery: 36h (normal) / 60h (Low Power Mode)
- Case: Grade 2 titanium
- Water resistance: 100m / EN 13319
- Weight: 61.4 g (without band)

URL: https://www.apple.com/shop/buy-watch/apple-watch-ultra`,
    metadata: { type: 'product', category: 'sports', subcategory: 'smartwatch', brand: 'Apple', price: 799.00, store: 'Apple', url: 'https://www.apple.com/shop/buy-watch/apple-watch-ultra', inStock: true, productId: 's6' },
  },
  {
    topic: 'Apple Watch Ultra 2 — reviews',
    content: `Apple Watch Ultra 2 — Customer Reviews & Expert Analysis
Average Rating: 4.8 / 5 | Total Reviews: 14,600

Overall Assessment:
The Ultra 2 is Apple's best smartwatch and a credible competitor to Garmin in the adventure sports segment. The titanium build, L1/L5 GPS, 60-hour battery, and 100m water resistance are genuinely competitive with Garmin Fenix 7. The Apple ecosystem integration (seamless iPhone pairing, Apple Health, Apple Fitness+) makes it the best smartwatch for iPhone users who do serious sports.

Pros (most mentioned by customers):
- Best Apple Watch ever — 60h battery is a major step from standard Apple Watch's 18h
- 2000-nit display is genuinely readable in harsh direct sunlight (trail running, skiing)
- L1/L5 dual-frequency GPS accuracy matches Garmin in independent testing
- Titanium build is extremely durable — users report surviving significant impacts
- Action Button is customizable for one-press workout start, dive logging, etc.
- 100m water resistance with dive standard — scuba and freediving capable

Cons (most mentioned by customers):
- $799 price — among the most expensive smartwatches available
- Garmin Fenix 7 has 18-day battery vs Ultra 2's 2.5 days (normal); significant gap
- Very large (49mm); users with small wrists find it overwhelming
- Maps and navigation less comprehensive than Garmin's TopoActive maps
- Apple ecosystem lock-in — useless for Android users

Best For:
- iPhone users who do triathlon, trail running, open-water swimming, or adventure sports
- Divers who want a dive-certified Apple Watch
- Athletes who want Apple ecosystem AND serious athletic capability

Sample Customer Reviews:
- "Worn it freediving to 30m repeatedly. Worked perfectly. Garmin can't match Apple ecosystem." — ★★★★★
- "60h battery means I can charge Sunday and forget it until Tuesday. Huge upgrade from Series 8." — ★★★★★
- "GPS accuracy is finally Garmin-level. Ultramarathon trail matched paper map perfectly." — ★★★★★
- "Way too big for my 150mm wrist. Almost returned it but got used to it after 2 weeks." — ★★★★☆`,
    metadata: { type: 'reviews', category: 'sports', subcategory: 'smartwatch', brand: 'Apple', productId: 's6', avgRating: 4.8, reviewCount: 14600 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ELECTRONICS — PERIPHERALS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Logitech MX Master 3S ─────────────────────────────────────────────────
  {
    topic: 'Logitech MX Master 3S Wireless Mouse — product',
    content: `Logitech MX Master 3S Advanced Wireless Mouse
Brand: Logitech | Price: $99.99 | Store: Amazon | In Stock: Yes
Category: electronics — computer peripheral

Key Features:
- 8000 DPI MagSpeed electromagnetic scrolling — scroll through 1,000 lines in 1 second
- Virtually silent clicks — 90% quieter than standard mouse (certified)
- 6 programmable buttons + customizable per-application in Logi Options+
- Works on any surface including glass (new optical sensor)
- Connects to up to 3 devices (Easy-Switch button); Bluetooth + USB receiver
- Ergonomic sculpted right-handed shape optimized for large hands
- 70-day battery life via USB-C charging; 1-minute charge = 3 hours use

Technical Specifications:
- Sensor: 8000 DPI Darkfield High-Precision optical
- Connectivity: Bluetooth 5.0 + Logi Bolt USB receiver
- Battery: 70 days (USB-C)
- Buttons: 7 (including MagSpeed scroll wheel, thumb wheel)
- Weight: 141 g
- Compatibility: Windows, macOS, Linux, ChromeOS
- Colors: Pale Gray, Graphite, Rose

URL: https://www.amazon.com/dp/B09HM94VDS`,
    metadata: { type: 'product', category: 'electronics', subcategory: 'peripheral', brand: 'Logitech', price: 99.99, store: 'Amazon', url: 'https://www.amazon.com/dp/B09HM94VDS', inStock: true, productId: 'e8' },
  },
  {
    topic: 'Logitech MX Master 3S Wireless Mouse — reviews',
    content: `Logitech MX Master 3S — Customer Reviews & Expert Analysis
Average Rating: 4.7 / 5 | Total Reviews: 22,000

Overall Assessment:
The MX Master 3S is the definitive productivity mouse for power users. The MagSpeed scroll wheel is unique and transformative for document-heavy workflows. Silent clicks are a genuine improvement in shared office environments. Logi Options+ app customization per-app is a compelling differentiator. The most recommended mouse in professional and developer communities.

Pros (most mentioned by customers):
- MagSpeed scroll wheel is transformative for spreadsheets, long docs, and code files
- Silent clicks are notably quieter — appropriate for meetings and shared workspaces
- Per-application button customization via Logi Options+ is uniquely powerful
- Connects 3 devices; Easy-Switch button is a frictionless workflow tool
- Works flawlessly on glass desks (common problem with other optical mice)
- 70-day battery eliminates charging anxiety

Cons (most mentioned by customers):
- Right-handed only; left-handed users have no equivalent option
- Large size favors users with medium-to-large hands; small hands may find grip uncomfortable
- $100 price is premium for a mouse
- Bluetooth connection can be slightly laggy vs USB receiver (minor)
- Heavy at 141g; users coming from lighter gaming mice may find it fatiguing

Best For:
- Knowledge workers and developers who work with large files and documents
- Multi-device workflows (laptop + desktop + work machine)
- Professionals in shared offices who need quiet peripherals

Sample Customer Reviews:
- "MagSpeed scroll through 5,000-row Excel sheets in one spin. Nothing else comes close." — ★★★★★
- "Silent clicks are a real feature in client meetings. My old mouse sounded like a typewriter." — ★★★★★
- "Per-app customization is fantastic. Different gesture button actions in Figma vs VS Code." — ★★★★★
- "Too big for my hands after 3 hours. Switched to MX Anywhere 3. Consider hand size." — ★★★☆☆`,
    metadata: { type: 'reviews', category: 'electronics', subcategory: 'peripheral', brand: 'Logitech', productId: 'e8', avgRating: 4.7, reviewCount: 22000 },
  },

];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const llmClient = new AnthropicLLMClient(env.ANTHROPIC_API_KEY ?? '');
  const embeddingService = new EmbeddingService();
  const ragService = new RAGService(pool, llmClient, embeddingService);

  console.log(`Seeding ${DOCUMENTS.length} shopping knowledge base documents…\n`);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of DOCUMENTS) {
    const existing = await pool.query(
      'SELECT id FROM knowledge_base WHERE topic = $1 LIMIT 1',
      [doc.topic],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  SKIP   ${doc.topic}`);
      skipped++;
      continue;
    }

    process.stdout.write(`  INSERT ${doc.topic} … `);
    try {
      await ragService.ingestDocument(doc.topic, doc.content, doc.metadata);
      console.log('done');
      inserted++;
    } catch (err) {
      console.log(`FAILED (${err instanceof Error ? err.message : err})`);
      failed++;
    }

    // Respect Voyage AI free-tier rate limit
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  await pool.end();
  console.log(`\nSeed complete. Inserted: ${inserted} | Skipped: ${skipped} | Failed: ${failed}`);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
