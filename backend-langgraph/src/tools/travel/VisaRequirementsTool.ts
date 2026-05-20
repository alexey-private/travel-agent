import { BaseTool } from '../BaseTool';
import { ToolResult, JSONSchema } from '../../types/tools';

interface VisaRequirementsInput {
  nationality: string;
  destination: string;
  purpose?: 'tourism' | 'business' | 'transit';
}

interface VisaRequirement {
  nationality: string;
  destination: string;
  visaRequired: boolean;
  visaType: string;
  maxStay: string;
  cost: string;
  processingTime: string;
  requirements: string[];
  notes: string;
  entryType: 'visa-free' | 'visa-on-arrival' | 'e-visa' | 'visa-required';
}

// Simplified visa policy table: [nationality ISO2] → [destination ISO2] → entryType
// visa-free | visa-on-arrival | e-visa | visa-required
const VISA_POLICY: Record<string, Record<string, 'visa-free' | 'visa-on-arrival' | 'e-visa' | 'visa-required'>> = {
  US: {
    GB: 'visa-free', FR: 'visa-free', DE: 'visa-free', IT: 'visa-free', ES: 'visa-free',
    JP: 'visa-free', AU: 'visa-free', CA: 'visa-free', MX: 'visa-free', BR: 'visa-free',
    TH: 'visa-on-arrival', ID: 'visa-on-arrival', TR: 'e-visa', IN: 'e-visa',
    CN: 'visa-required', RU: 'visa-required', SA: 'e-visa', EG: 'visa-on-arrival',
    AE: 'visa-free', SG: 'visa-free', KR: 'visa-free', NZ: 'visa-free',
  },
  GB: {
    US: 'visa-free', FR: 'visa-free', DE: 'visa-free', IT: 'visa-free', ES: 'visa-free',
    JP: 'visa-free', AU: 'e-visa', CA: 'visa-free', MX: 'visa-free',
    TH: 'visa-on-arrival', ID: 'visa-on-arrival', TR: 'e-visa', IN: 'e-visa',
    CN: 'visa-required', RU: 'visa-required', AE: 'visa-free', SG: 'visa-free',
  },
  DE: {
    US: 'visa-free', GB: 'visa-free', FR: 'visa-free', IT: 'visa-free', JP: 'visa-free',
    AU: 'e-visa', CA: 'visa-free', TH: 'visa-free', ID: 'visa-on-arrival',
    IN: 'e-visa', CN: 'visa-required', RU: 'visa-required', AE: 'visa-free',
    SG: 'visa-free', TR: 'e-visa',
  },
  IN: {
    TH: 'visa-on-arrival', ID: 'visa-free', SG: 'visa-free', AE: 'visa-free',
    US: 'visa-required', GB: 'visa-required', FR: 'visa-required', DE: 'visa-required',
    JP: 'visa-required', AU: 'visa-required', CA: 'visa-required', CN: 'visa-required',
    TR: 'e-visa', EG: 'visa-on-arrival', KR: 'visa-required', NZ: 'visa-required',
  },
  CN: {
    TH: 'visa-free', SG: 'visa-free', MY: 'visa-free', ID: 'visa-on-arrival',
    AE: 'visa-free', US: 'visa-required', GB: 'visa-required', FR: 'visa-required',
    DE: 'visa-required', JP: 'visa-required', AU: 'visa-required', CA: 'visa-required',
    KR: 'visa-free', RU: 'visa-free',
  },
};

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', FR: 'France', DE: 'Germany',
  IT: 'Italy', ES: 'Spain', JP: 'Japan', AU: 'Australia', CA: 'Canada',
  MX: 'Mexico', BR: 'Brazil', TH: 'Thailand', ID: 'Indonesia', TR: 'Turkey',
  IN: 'India', CN: 'China', RU: 'Russia', SA: 'Saudi Arabia', EG: 'Egypt',
  AE: 'UAE', SG: 'Singapore', KR: 'South Korea', NZ: 'New Zealand',
  MY: 'Malaysia',
};

// Resolve country name or ISO2 code → ISO2
function resolveCountryCode(input: string): string {
  const upper = input.trim().toUpperCase();
  if (COUNTRY_NAMES[upper]) return upper;
  const entry = Object.entries(COUNTRY_NAMES).find(
    ([, name]) => name.toLowerCase() === input.trim().toLowerCase(),
  );
  return entry ? entry[0] : upper.slice(0, 2);
}

const VISA_DETAILS: Record<'visa-free' | 'visa-on-arrival' | 'e-visa' | 'visa-required', {
  visaType: string; cost: string; processingTime: string; maxStay: string; requirements: string[];
}> = {
  'visa-free': {
    visaType: 'No visa required',
    cost: 'Free',
    processingTime: 'N/A',
    maxStay: 'Up to 90 days',
    requirements: ['Valid passport (6+ months validity)', 'Return ticket', 'Proof of sufficient funds'],
  },
  'visa-on-arrival': {
    visaType: 'Visa on Arrival',
    cost: '$25–$50 USD',
    processingTime: '15–30 minutes at the border',
    maxStay: 'Up to 30 days',
    requirements: ['Valid passport (6+ months validity)', 'Passport photo (2x)', 'Return ticket', 'Proof of accommodation', 'Cash for visa fee'],
  },
  'e-visa': {
    visaType: 'Electronic Visa (e-Visa)',
    cost: '$20–$80 USD',
    processingTime: '3–5 business days',
    maxStay: 'Up to 30–90 days (single entry)',
    requirements: ['Valid passport (6+ months validity)', 'Digital passport photo', 'Return ticket', 'Hotel booking confirmation', 'Travel insurance', 'Online application form'],
  },
  'visa-required': {
    visaType: 'Embassy/Consulate Visa',
    cost: '$60–$160 USD',
    processingTime: '5–15 business days',
    maxStay: 'As specified on visa',
    requirements: ['Valid passport (6+ months validity)', 'Completed application form', 'Passport photos (2x)', 'Bank statements (3 months)', 'Travel insurance', 'Hotel/itinerary confirmation', 'Return ticket', 'Employment/sponsor letter'],
  },
};

export class VisaRequirementsTool extends BaseTool {
  readonly name = 'check_visa_requirements';
  readonly description =
    'Check visa requirements for traveling from one country to another. Returns visa type, cost, processing time, required documents, and maximum stay duration. ' +
    'Use when the user asks about visas, entry requirements, whether they need a visa, or travel documents.';

  readonly inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      nationality: {
        type: 'string',
        description: 'Traveler\'s nationality as country name or ISO2 code (e.g. "American", "United States", "US")',
      },
      destination: {
        type: 'string',
        description: 'Destination country name or ISO2 code (e.g. "Japan", "JP", "Thailand")',
      },
      purpose: {
        type: 'string',
        enum: ['tourism', 'business', 'transit'],
        description: 'Purpose of travel (default: tourism)',
      },
    },
    required: ['nationality', 'destination'],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { nationality, destination, purpose = 'tourism' } = input as VisaRequirementsInput;

    const natCode = resolveCountryCode(nationality);
    const destCode = resolveCountryCode(destination);
    const natName = COUNTRY_NAMES[natCode] ?? nationality;
    const destName = COUNTRY_NAMES[destCode] ?? destination;

    const entryType: 'visa-free' | 'visa-on-arrival' | 'e-visa' | 'visa-required' =
      VISA_POLICY[natCode]?.[destCode] ?? 'visa-required';

    const details = VISA_DETAILS[entryType];

    let notes = '';
    if (purpose === 'business') {
      notes = 'For business travel, you may need to show an invitation letter from the host company. Some countries require a separate business visa.';
    } else if (purpose === 'transit') {
      notes = 'Transit visa rules differ from tourist visas. If you have a layover exceeding 24 hours, a transit visa may be required.';
    } else {
      notes = entryType === 'visa-free'
        ? 'Enjoy your trip! Ensure your passport is valid for at least 6 months beyond your travel dates.'
        : entryType === 'visa-on-arrival'
          ? 'Have your documents ready before landing. Some airports have separate queues for visa-on-arrival.'
          : entryType === 'e-visa'
            ? 'Apply online before your trip. Print the approved e-visa and carry it with you.'
            : 'Contact the nearest embassy or consulate to apply. Processing times may vary by season.';
    }

    const result: VisaRequirement = {
      nationality: natName,
      destination: destName,
      visaRequired: entryType !== 'visa-free',
      entryType,
      visaType: details.visaType,
      maxStay: details.maxStay,
      cost: details.cost,
      processingTime: details.processingTime,
      requirements: details.requirements,
      notes,
    };

    return {
      success: true,
      data: {
        ...result,
        disclaimer: 'Visa policies change frequently. Always verify with the official embassy or consulate before travel.',
      },
    };
  }
}
