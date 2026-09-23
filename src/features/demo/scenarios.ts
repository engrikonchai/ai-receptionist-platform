import type { DemoBusiness } from './types';

/**
 * Fixed, fictional demo content for Milestone 2's public interactive
 * demo (/demo). Every business, person, message and contact detail
 * here is invented for illustration — see the disclaimers rendered
 * alongside them in the UI.
 *
 * This is entirely local mock data: no network calls, no Supabase
 * writes, no real Knowledge Base/lead/conversation records, and no AI
 * provider. The reply logic in ./match-answer.ts is a small local
 * keyword matcher — a deliberately isolated stand-in a future
 * milestone can swap for a real AI integration without touching the
 * UI components in ./components.
 *
 * Business types are drawn from the approved "Demo States.dc.html"
 * example set (Fitness studio, Online shop, Café, Consultancy,
 * Salon) so the platform reads as useful to many kinds of businesses,
 * never positioned around one industry.
 */
export const DEMO_BUSINESSES: DemoBusiness[] = [
  {
    id: 'fitness-studio',
    categoryLabel: 'Fitness studio',
    name: 'Northside Studio',
    initials: 'NS',
    greeting: 'Hi! Ask me anything about Northside Studio — classes, prices, hours.',
    tone: 'Friendly',
    responseLength: 'Short',
    handoffPolicy: 'When asked for a person',
    chipQuestionIds: ['hours', 'classes'],
    noMatchExample: 'Do you sell gift vouchers?',
    knowledgeBase: [
      {
        id: 'hours',
        topic: 'Opening hours',
        sampleQuestion: 'What are your hours?',
        keywords: ['hour', 'open', 'opening', 'time'],
        answer: "We're open Monday to Friday 6:00–21:00, and Saturday 9:00–14:00."
      },
      {
        id: 'classes',
        topic: 'Class types',
        sampleQuestion: 'Do you have beginner classes?',
        keywords: ['beginner', 'class', 'classes'],
        answer:
          "Yes — Foundations runs Tuesdays and Thursdays at 18:30. It's designed for first-timers."
      },
      {
        id: 'membership',
        topic: 'Membership prices',
        sampleQuestion: 'How much is membership?',
        keywords: ['price', 'membership', 'cost', 'fee'],
        answer:
          'Membership plans have no long-term contract — ask at the front desk for current pricing.'
      },
      {
        id: 'cancellation',
        topic: 'Cancellation policy',
        sampleQuestion: "What's your cancellation policy?",
        keywords: ['cancel', 'cancellation', 'policy'],
        answer:
          'You can cancel or pause your membership anytime from your account, effective the next billing cycle.'
      }
    ]
  },
  {
    id: 'online-shop',
    categoryLabel: 'Online shop',
    name: 'Harbor & Thread',
    initials: 'HT',
    greeting: 'Hi! Ask me anything about Harbor & Thread — shipping, returns, sizing.',
    tone: 'Friendly',
    responseLength: 'Short',
    handoffPolicy: 'When asked for a person',
    chipQuestionIds: ['shipping', 'returns'],
    noMatchExample: 'Can I pay with cryptocurrency?',
    knowledgeBase: [
      {
        id: 'shipping',
        topic: 'Shipping',
        sampleQuestion: 'How long does shipping take?',
        keywords: ['shipping', 'ship', 'deliver', 'delivery'],
        answer: 'Standard shipping typically takes 3–5 business days within the country.'
      },
      {
        id: 'returns',
        topic: 'Returns policy',
        sampleQuestion: "What's your returns policy?",
        keywords: ['return', 'refund', 'exchange'],
        answer: 'Items can be returned within 30 days in original condition for a full refund.'
      },
      {
        id: 'sizing',
        topic: 'Sizing guide',
        sampleQuestion: 'Do you have a sizing guide?',
        keywords: ['size', 'sizing', 'fit'],
        answer:
          'Yes — each product page includes a size chart with measurements in inches and centimeters.'
      },
      {
        id: 'tracking',
        topic: 'Order tracking',
        sampleQuestion: 'How do I track my order?',
        keywords: ['track', 'tracking', 'order status'],
        answer: "You'll get a tracking link by email as soon as your order ships."
      }
    ]
  },
  {
    id: 'cafe',
    categoryLabel: 'Café',
    name: 'Thistle & Bloom Café',
    initials: 'TB',
    greeting: 'Hi! Ask me anything about Thistle & Bloom — menu, hours, allergens.',
    tone: 'Friendly',
    responseLength: 'Short',
    handoffPolicy: 'When asked for a person',
    chipQuestionIds: ['menu', 'hours'],
    noMatchExample: 'Do you cater private events?',
    knowledgeBase: [
      {
        id: 'hours',
        topic: 'Opening hours',
        sampleQuestion: 'What are your opening hours?',
        keywords: ['hour', 'open', 'opening'],
        answer: "We're open daily from 7:30 to 17:00."
      },
      {
        id: 'menu',
        topic: 'Menu',
        sampleQuestion: "What's on the menu?",
        keywords: ['menu', 'food', 'coffee', 'pastr'],
        answer:
          'We serve coffee, tea, pastries, and a rotating lunch menu — the full menu is posted at the counter and online.'
      },
      {
        id: 'allergens',
        topic: 'Allergen information',
        sampleQuestion: 'Do you have allergen information?',
        keywords: ['allerg', 'gluten', 'dairy', 'nut'],
        answer:
          'Allergen information is available on request at the counter, and most pastries are labeled for common allergens.'
      },
      {
        id: 'wifi',
        topic: 'Wifi',
        sampleQuestion: 'Do you have wifi?',
        keywords: ['wifi', 'wi-fi', 'internet'],
        answer: 'Yes, free wifi is available for customers — ask at the counter for the password.'
      }
    ]
  },
  {
    id: 'consultancy',
    categoryLabel: 'Consultancy',
    name: 'Aldridge Partners',
    initials: 'AP',
    greeting: 'Hi! Ask me anything about Aldridge Partners — services, consultations, scheduling.',
    tone: 'Professional',
    responseLength: 'Short',
    handoffPolicy: 'When asked for a person',
    chipQuestionIds: ['services', 'consultation'],
    noMatchExample: 'Do you have a referral program?',
    knowledgeBase: [
      {
        id: 'services',
        topic: 'Services offered',
        sampleQuestion: 'What services do you offer?',
        keywords: ['service', 'offer', 'help with'],
        answer:
          'We advise on operations, growth strategy, and process improvement for small and mid-sized businesses.'
      },
      {
        id: 'consultation',
        topic: 'First consultation',
        sampleQuestion: 'How does a first consultation work?',
        keywords: ['consult', 'consultation', 'first call', 'meeting'],
        answer:
          'We start with a free 30-minute call to understand your goals before proposing next steps.'
      },
      {
        id: 'scheduling',
        topic: 'Scheduling a call',
        sampleQuestion: 'How do I schedule a call?',
        keywords: ['schedule', 'book a call', 'appointment', 'calendar'],
        answer:
          'You can request a time through the contact form, and someone will follow up to confirm.'
      },
      {
        id: 'industries',
        topic: 'Areas of expertise',
        sampleQuestion: 'What industries do you work with?',
        keywords: ['industr', 'expertise', 'sector'],
        answer: 'We work across retail, hospitality, and professional services, among others.'
      }
    ]
  },
  {
    id: 'salon',
    categoryLabel: 'Salon',
    name: 'Willowbrook Salon',
    initials: 'WS',
    greeting: 'Hi! Ask me anything about Willowbrook Salon — services, booking, hours.',
    tone: 'Friendly',
    responseLength: 'Short',
    handoffPolicy: 'When asked for a person',
    chipQuestionIds: ['booking', 'services'],
    noMatchExample: 'Do you do mobile or home visits?',
    knowledgeBase: [
      {
        id: 'hours',
        topic: 'Opening hours',
        sampleQuestion: 'What are your hours?',
        keywords: ['hour', 'open', 'opening'],
        answer: "We're open Tuesday to Saturday, 9:00 to 18:00."
      },
      {
        id: 'services',
        topic: 'Services & pricing',
        sampleQuestion: 'What services do you offer?',
        keywords: ['service', 'haircut', 'color', 'styling'],
        answer:
          'We offer cuts, color, and styling — ask at booking for current pricing, since it varies by stylist.'
      },
      {
        id: 'booking',
        topic: 'Booking an appointment',
        sampleQuestion: 'How do I book an appointment?',
        keywords: ['book', 'appointment', 'booking', 'schedule'],
        answer: "You can book online or by phone — we'll confirm your appointment by text."
      },
      {
        id: 'cancellation',
        topic: 'Cancellation policy',
        sampleQuestion: "What's your cancellation policy?",
        keywords: ['cancel', 'cancellation', 'policy', 'reschedule'],
        answer: "We ask for at least 24 hours' notice to cancel or reschedule without a fee."
      }
    ]
  }
];

export function getDemoBusiness(id: string): DemoBusiness | undefined {
  return DEMO_BUSINESSES.find((business) => business.id === id);
}
