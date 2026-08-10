export interface ServiceOffer {
  id: string;
  code: string;
  title: string;
  audience: string;
  price: string;
  timeline: string;
  description: string;
  features: string[];
  featured?: boolean;
}

export interface Capability {
  code: string;
  title: string;
  description: string;
}

// Homepage services live here so pricing and scope can be changed without
// touching the storefront, checkout, or Supabase-backed product catalogue.
export const SERVICE_OFFERS: ServiceOffer[] = [
  {
    id: 'ai-dashboard',
    code: '01 / INTELLIGENCE',
    title: 'AI Dashboard Sprint',
    audience: 'For operators who need one clear view of the business.',
    price: 'From \u00A3349',
    timeline: 'Typical build: 5-10 working days',
    description: 'A focused command centre that turns scattered data and repetitive work into one usable operating system.',
    features: [
      'Dashboard architecture and data mapping',
      'Three to five responsive core screens',
      'Supabase, API, or spreadsheet integration',
      'Search, filters, forms, and key actions',
      'AI-assisted workflows where they add value',
      'Launch support and two revision rounds',
    ],
  },
  {
    id: 'ecommerce-store',
    code: '02 / COMMERCE',
    title: 'E-commerce Launch Store',
    audience: 'For brands ready to look established and sell properly.',
    price: 'From \u00A3799',
    timeline: 'Typical build: 10-15 working days',
    description: 'A conversion-led storefront with the customer journey, payments, mobile experience, and owner controls connected end to end.',
    features: [
      'Custom storefront and product experience',
      'Mobile-first responsive build',
      'Secure checkout and payment integration',
      'Orders, confirmations, and delivery flow',
      'Editable products and store content',
      'Performance, analytics, and launch support',
    ],
    featured: true,
  },
];

export const CAPABILITIES: Capability[] = [
  {
    code: 'DA',
    title: 'Dashboard architecture',
    description: 'Clear information hierarchy, practical controls, and workflows designed around the decisions you make every day.',
  },
  {
    code: 'CX',
    title: 'Commerce experience',
    description: 'Product discovery, checkout, confirmation, and post-purchase journeys built as one connected system.',
  },
  {
    code: 'AU',
    title: 'Automation and integration',
    description: 'Supabase, payments, email, APIs, and useful AI connected without exposing private credentials in the browser.',
  },
  {
    code: 'MP',
    title: 'Motion and performance',
    description: 'Considered interaction, responsive behaviour, and fast loading that guide attention instead of slowing people down.',
  },
];

export const BUILD_STEPS = [
  ['01', 'Scope', 'You send the goal, examples, required features, and current setup. We confirm the build and fixed scope before payment.'],
  ['02', 'Build', 'The first working version is produced quickly, with progress shared at clear review points.'],
  ['03', 'Refine', 'Feedback is handled in the included revision rounds, then the full journey is checked across screen sizes.'],
  ['04', 'Launch', 'The finished build is connected to your accounts and deployed without replacing working production data.'],
] as const;
