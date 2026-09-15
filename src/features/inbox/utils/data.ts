import type { Conversation } from './types';

/**
 * Mock conversations for a short-term apartment rental business
 * ("Riviera Stay Apartments"). Purely local, static data — no backend,
 * no API calls. Dates and prices are illustrative only.
 *
 * Rule followed throughout: never state a reservation is confirmed —
 * `estimatedBookingValue` and the message copy are phrased as estimates
 * or open questions, not confirmations, unless a message explicitly
 * says availability was checked and confirmed.
 */
export const initialConversations: Conversation[] = [
  {
    id: 'c1',
    channel: 'website',
    language: 'en',
    status: 'open',
    handledBy: 'ai',
    unreadCount: 2,
    customer: {
      name: 'Sarah Bennett',
      email: 'sarah.bennett@example.com',
      phone: '+1 555 0114',
      leadStatus: 'qualified',
      checkIn: 'Aug 14, 2026',
      checkOut: 'Aug 21, 2026',
      guests: 4,
      requestedAccommodation: '2-bedroom apartment, sea view',
      estimatedBookingValue: '≈ €980 for 7 nights (not yet confirmed)',
      tags: ['Family', 'First-time guest'],
      assignedTeamMember: 'Unassigned',
      notes: []
    },
    suggestedReplies: [
      'Let me check availability for those dates and get back to you shortly.',
      'Would you like me to hold a 2-bedroom apartment while you decide?',
      'Could you share your preferred check-in time?'
    ],
    messages: [
      {
        id: 'c1-m1',
        sender: 'customer',
        author: 'Sarah Bennett',
        text: "Hi! We're a family of 4 looking at Riviera Stay for the week of Aug 14–21. Do you have a 2-bedroom apartment with a sea view available?",
        timestamp: '09:02'
      },
      {
        id: 'c1-m2',
        sender: 'ai',
        author: 'AI Receptionist',
        text: 'Hello Sarah! Thanks for reaching out. We do have a couple of 2-bedroom sea-view apartments in that area — let me check the calendar for Aug 14–21 and confirm availability for you.',
        timestamp: '09:03'
      },
      {
        id: 'c1-m3',
        sender: 'customer',
        author: 'Sarah Bennett',
        text: 'Great, thank you! Also, is breakfast included, and is there parking on site?',
        timestamp: '09:05'
      },
      {
        id: 'c1-m4',
        sender: 'ai',
        author: 'AI Receptionist',
        text: 'Breakfast is not included, but there is a bakery two minutes away. Free on-site parking is available for all guests. I still need to confirm the exact apartment availability — one moment.',
        timestamp: '09:06'
      },
      {
        id: 'c1-m5',
        sender: 'customer',
        author: 'Sarah Bennett',
        text: "Sounds good. Let me know as soon as you know if it's available — we're also looking at another place.",
        timestamp: '09:08'
      }
    ]
  },
  {
    id: 'c2',
    channel: 'instagram',
    language: 'me',
    status: 'needs_attention',
    handledBy: 'ai',
    unreadCount: 1,
    customer: {
      name: 'Nikola Radulović',
      email: 'nikola.radulovic@example.me',
      phone: '+382 67 123 456',
      leadStatus: 'negotiating',
      checkIn: 'Jul 3, 2026',
      checkOut: 'Jul 10, 2026',
      guests: 2,
      requestedAccommodation: 'Studio apartment, old town',
      estimatedBookingValue: '≈ €420 for 7 nights (not yet confirmed)',
      tags: ['Price-sensitive', 'Repeat visitor'],
      assignedTeamMember: 'Unassigned',
      notes: [
        {
          id: 'c2-n1',
          author: 'Demo Owner',
          text: 'Stayed with us in 2024, was happy with the studio near the old town gate.',
          timestamp: 'Yesterday'
        }
      ]
    },
    suggestedReplies: [
      'Mogu da proverim da li imamo popust za goste koji se vraćaju.',
      'Javiću vam se čim potvrdim cenu sa menadžerom.',
      'Da li vam odgovara da vas kasnije pozovemo telefonom?'
    ],
    messages: [
      {
        id: 'c2-m1',
        sender: 'customer',
        author: 'Nikola Radulović',
        text: 'Pozdrav! Bio sam kod vas prošle godine, da li imate popust za goste koji se vraćaju i da li može poseban aranžman ako ostajem duže?',
        timestamp: '11:20'
      },
      {
        id: 'c2-m2',
        sender: 'ai',
        author: 'AI Receptionist',
        text: 'Zdravo Nikola, drago nam je da se vraćate! Za standardne rezervacije mogu da vam potvrdim cene odmah, ali kombinacija popusta za povratnike i posebnog aranžmana za duži boravak zahteva da to proverim sa menadžerom.',
        timestamp: '11:22',
        lowConfidence: {
          confidence: 54,
          reason:
            'Guest is asking about a combined loyalty discount and a custom long-stay rate — outside the pricing rules the assistant was given.'
        }
      },
      {
        id: 'c2-s1',
        sender: 'system',
        author: 'System',
        text: 'AI Receptionist flagged this conversation for human review (confidence 54%).',
        timestamp: '11:22'
      },
      {
        id: 'c2-m3',
        sender: 'customer',
        author: 'Nikola Radulović',
        text: 'Ok, javite mi kad budete znali. Hvala!',
        timestamp: '11:24'
      }
    ]
  },
  {
    id: 'c3',
    channel: 'whatsapp',
    language: 'ru',
    status: 'resolved',
    handledBy: 'human',
    unreadCount: 0,
    customer: {
      name: 'Elena Volkova',
      email: 'elena.volkova@example.ru',
      phone: '+7 916 123 45 67',
      leadStatus: 'lost',
      checkIn: 'Sep 2, 2026',
      checkOut: 'Sep 9, 2026',
      guests: 2,
      requestedAccommodation: '1-bedroom apartment, city center',
      estimatedBookingValue: '≈ €560 for 7 nights (guest did not proceed)',
      tags: ['Price-sensitive'],
      assignedTeamMember: 'Demo Owner',
      notes: [
        {
          id: 'c3-n1',
          author: 'Demo Owner',
          text: 'Found our rate higher than a competitor. Worth a follow-up next season.',
          timestamp: '2 days ago'
        }
      ]
    },
    suggestedReplies: ['Спасибо за обращение! Будем рады видеть вас в другой раз.'],
    messages: [
      {
        id: 'c3-m1',
        sender: 'customer',
        author: 'Elena Volkova',
        text: 'Здравствуйте, подскажите, пожалуйста, стоимость апартаментов с 2 по 9 сентября на двоих?',
        timestamp: 'Mon · 16:40'
      },
      {
        id: 'c3-m2',
        sender: 'ai',
        author: 'AI Receptionist',
        text: 'Здравствуйте, Елена! За однокомнатные апартаменты в центре ориентировочная стоимость составит около €560 за 7 ночей. Уточню точную сумму у менеджера.',
        timestamp: 'Mon · 16:41'
      },
      {
        id: 'c3-m3',
        sender: 'human',
        author: 'Demo Owner',
        text: 'Здравствуйте! Подтверждаю ориентировочную стоимость — €560 за 7 ночей, без учёта сезонных корректировок. Точные даты пока не бронировались.',
        timestamp: 'Mon · 17:05'
      },
      {
        id: 'c3-m4',
        sender: 'customer',
        author: 'Elena Volkova',
        text: 'Понятно, спасибо. Посмотрю ещё варианты и напишу, если решусь.',
        timestamp: 'Mon · 17:12'
      },
      {
        id: 'c3-s1',
        sender: 'system',
        author: 'System',
        text: 'Demo Owner marked this conversation as resolved.',
        timestamp: 'Mon · 17:15'
      }
    ]
  },
  {
    id: 'c4',
    channel: 'website',
    language: 'en',
    status: 'open',
    handledBy: 'human',
    unreadCount: 0,
    customer: {
      name: 'Marco Ferretti',
      email: 'marco.ferretti@example.it',
      phone: '+39 340 555 0102',
      leadStatus: 'negotiating',
      checkIn: 'Oct 10, 2026',
      checkOut: 'Oct 17, 2026',
      guests: 2,
      requestedAccommodation: 'Sea view studio',
      estimatedBookingValue: '≈ €640 for 7 nights (not yet confirmed)',
      tags: ['Anniversary trip'],
      assignedTeamMember: 'Demo Owner',
      notes: [
        {
          id: 'c4-n1',
          author: 'Demo Owner',
          text: "Celebrating their anniversary — mentioned it'd be nice to arrange a small welcome note if we book them.",
          timestamp: 'Today'
        }
      ]
    },
    suggestedReplies: [
      "I'll get this sorted for your anniversary — one moment.",
      'Would you like me to note any special requests for your stay?'
    ],
    messages: [
      {
        id: 'c4-m1',
        sender: 'customer',
        author: 'Marco Ferretti',
        text: "Hi, we're celebrating our anniversary Oct 10–17 and would love a sea view studio if you have one.",
        timestamp: 'Yesterday · 12:10'
      },
      {
        id: 'c4-m2',
        sender: 'ai',
        author: 'AI Receptionist',
        text: 'Congratulations! Let me check what we have available for those dates and pass this along to our team so we can take good care of you.',
        timestamp: 'Yesterday · 12:11'
      },
      {
        id: 'c4-s1',
        sender: 'system',
        author: 'System',
        text: 'Demo Owner took over this conversation from AI Receptionist.',
        timestamp: 'Yesterday · 12:40'
      },
      {
        id: 'c4-m3',
        sender: 'human',
        author: 'Demo Owner',
        text: 'Hi Marco, happy anniversary in advance! We do have a sea view studio open for Oct 10–17. Estimated cost is around €640 for the week — I can hold it while you confirm.',
        timestamp: 'Yesterday · 12:42'
      },
      {
        id: 'c4-m4',
        sender: 'customer',
        author: 'Marco Ferretti',
        text: "That sounds lovely, thank you. We'll confirm by tomorrow.",
        timestamp: 'Yesterday · 13:02'
      }
    ]
  },
  {
    id: 'c5',
    channel: 'instagram',
    language: 'en',
    status: 'open',
    handledBy: 'ai',
    unreadCount: 3,
    customer: {
      name: 'Priya Nair',
      email: 'priya.nair@example.com',
      phone: '+44 7700 900123',
      leadStatus: 'new',
      checkIn: 'Nov 1, 2026',
      checkOut: 'Nov 29, 2026',
      guests: 1,
      requestedAccommodation: 'Studio apartment, long stay',
      estimatedBookingValue: '≈ €1,150 for 28 nights (not yet confirmed)',
      tags: ['Remote worker', 'Long stay'],
      assignedTeamMember: 'Unassigned',
      notes: []
    },
    suggestedReplies: [
      'Yes, we do offer reduced monthly rates for stays over 3 weeks.',
      'Let me put together a quote for the full month.',
      'Is fast wifi a must-have for your stay?'
    ],
    messages: [
      {
        id: 'c5-m1',
        sender: 'customer',
        author: 'Priya Nair',
        text: "Hey! I work remotely and I'm looking for a studio for the whole of November. Do you do monthly rates?",
        timestamp: '08:12'
      },
      {
        id: 'c5-m2',
        sender: 'ai',
        author: 'AI Receptionist',
        text: 'Hi Priya! Yes, we offer reduced rates for stays of 3+ weeks. For a studio across all of November, the estimate would be around €1,150, but this is not confirmed yet — let me check exact availability.',
        timestamp: '08:14'
      },
      {
        id: 'c5-m3',
        sender: 'customer',
        author: 'Priya Nair',
        text: 'Perfect. Is the wifi reliable for video calls? That matters a lot for me.',
        timestamp: '08:15'
      },
      {
        id: 'c5-m4',
        sender: 'ai',
        author: 'AI Receptionist',
        text: 'Yes, all apartments have fibre internet rated for video calls. I will confirm the studio availability for November shortly.',
        timestamp: '08:16'
      },
      {
        id: 'c5-m5',
        sender: 'customer',
        author: 'Priya Nair',
        text: 'Great, and is there a desk in the studio?',
        timestamp: '08:17'
      }
    ]
  },
  {
    id: 'c6',
    channel: 'whatsapp',
    language: 'me',
    status: 'resolved',
    handledBy: 'ai',
    unreadCount: 0,
    customer: {
      name: 'Jovana Đukić',
      email: 'jovana.dukic@example.me',
      phone: '+382 69 987 654',
      leadStatus: 'lost',
      checkIn: 'Jun 5, 2026',
      checkOut: 'Jun 8, 2026',
      guests: 3,
      requestedAccommodation: '2-bedroom apartment',
      estimatedBookingValue: '≈ €260 for 3 nights (guest did not proceed)',
      tags: [],
      assignedTeamMember: 'Unassigned',
      notes: []
    },
    suggestedReplies: ['Hvala vam na upitu, javite nam se ponovo kad budete planirali put!'],
    messages: [
      {
        id: 'c6-m1',
        sender: 'customer',
        author: 'Jovana Đukić',
        text: 'Zdravo, da li imate slobodan apartman za 3 osobe od 5. do 8. juna?',
        timestamp: '2 days ago · 10:05'
      },
      {
        id: 'c6-m2',
        sender: 'ai',
        author: 'AI Receptionist',
        text: 'Zdravo Jovana! Za taj period ima dvosoban apartman, procenjena cena je oko €260 za 3 noćenja, ali još nije potvrđeno. Da li želite da proverim tačnu dostupnost?',
        timestamp: '2 days ago · 10:07'
      },
      {
        id: 'c6-m3',
        sender: 'customer',
        author: 'Jovana Đukić',
        text: 'Hvala, ipak smo promenili planove za taj vikend.',
        timestamp: '2 days ago · 10:20'
      },
      {
        id: 'c6-s1',
        sender: 'system',
        author: 'System',
        text: 'AI Receptionist marked this conversation as resolved.',
        timestamp: '2 days ago · 10:21'
      }
    ]
  },
  {
    id: 'c7',
    channel: 'website',
    language: 'ru',
    status: 'needs_attention',
    handledBy: 'ai',
    unreadCount: 1,
    customer: {
      name: 'Dmitri Sokolov',
      email: 'dmitri.sokolov@example.ru',
      phone: '+7 926 555 0110',
      leadStatus: 'negotiating',
      checkIn: 'Aug 20, 2026',
      checkOut: 'Aug 27, 2026',
      guests: 5,
      requestedAccommodation: '3-bedroom apartment',
      estimatedBookingValue: '≈ €1,340 for 7 nights (not yet confirmed)',
      tags: ['Large group', 'Complaint risk'],
      assignedTeamMember: 'Unassigned',
      notes: []
    },
    suggestedReplies: [
      'Извините за неудобства, передаю ваш вопрос менеджеру.',
      'Мы свяжемся с вами в течение часа.'
    ],
    messages: [
      {
        id: 'c7-m1',
        sender: 'customer',
        author: 'Dmitri Sokolov',
        text: 'Здравствуйте, я писал вчера про трёхкомнатные апартаменты для 5 человек и до сих пор нет ответа о цене. Это не очень хорошее впечатление.',
        timestamp: '14:02'
      },
      {
        id: 'c7-m2',
        sender: 'ai',
        author: 'AI Receptionist',
        text: 'Дмитрий, приношу извинения за задержку. Ориентировочная стоимость трёхкомнатных апартаментов на 20–27 августа — около €1,340 за 7 ночей, точная сумма ещё не подтверждена.',
        timestamp: '14:05'
      },
      {
        id: 'c7-s1',
        sender: 'system',
        author: 'System',
        text: 'AI Receptionist flagged this conversation for human review: guest expressed dissatisfaction with response time.',
        timestamp: '14:05'
      },
      {
        id: 'c7-m3',
        sender: 'customer',
        author: 'Dmitri Sokolov',
        text: 'Хорошо, буду ждать подтверждения от человека, а не бота.',
        timestamp: '14:08'
      }
    ]
  }
];
