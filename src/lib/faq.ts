interface FaqEntry {
  question: string;
  keywords: string[];
  answer: string;
}

const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: 'Return and refund policy',
    keywords: ['return', 'refund', 'send back', 'wrong item'],
    answer:
      'Kapruka accepts returns within 7 days of delivery for damaged, defective, or incorrect items. Contact Kapruka support at support@kapruka.com or +94 11 234 5678 with your order number and photos of the issue.',
  },
  {
    question: 'Order cancellation',
    keywords: ['cancel', 'cancellation', 'stop order'],
    answer:
      'Orders can be cancelled within 2 hours of placing them. After that, the order enters processing and cannot be cancelled. Contact support@kapruka.com immediately with your order number.',
  },
  {
    question: 'Payment methods',
    keywords: ['payment', 'pay', 'card', 'bank transfer', 'how to pay'],
    answer:
      "Kapruka accepts Visa, Mastercard, and local bank transfers. The checkout link I provide opens Kapruka's secure payment page where you can choose your payment method. No account needed.",
  },
  {
    question: 'Delivery time',
    keywords: ['delivery time', 'how long', 'when will', 'arrive', 'days'],
    answer:
      'Colombo and suburbs: same day or next day. Other cities: 1-3 days. Remote areas: up to 5 days. I can check the exact delivery time for your city — just tell me where.',
  },
  {
    question: 'Order tracking',
    keywords: ['track', 'tracking', 'where is my order', 'order status'],
    answer:
      "I can track your order right now — just give me your order number and I'll check the status.",
  },
  {
    question: 'International delivery',
    keywords: ['international', 'overseas', 'foreign', 'abroad', 'ship abroad'],
    answer:
      'Kapruka currently delivers within Sri Lanka only. For international deliveries, contact support@kapruka.com.',
  },
  {
    question: 'Damaged or defective items',
    keywords: ['damaged', 'broken', 'not working', 'defective'],
    answer:
      'For damaged or defective items, contact support@kapruka.com within 24 hours of delivery with photos. Kapruka will arrange a replacement or refund.',
  },
  {
    question: 'Exchanges',
    keywords: ['exchange', 'swap', 'different size', 'wrong size'],
    answer:
      "Exchanges are handled case by case. Contact support@kapruka.com with your order number and what you'd like to exchange.",
  },
  {
    question: 'Gift wrap and messages',
    keywords: ['gift wrap', 'gift message', 'gift note', 'personalise'],
    answer:
      "Yes — I can add a gift message when placing your order. Just tell me what you'd like it to say.",
  },
  {
    question: 'Price match and discounts',
    keywords: ['price match', 'cheaper', 'discount', 'coupon', 'promo'],
    answer:
      "Kapruka doesn't currently offer price matching or coupon codes through this assistant. Check kapruka.com for current promotions.",
  },
  {
    question: 'Receipts and invoices',
    keywords: ['receipt', 'invoice', 'bill'],
    answer:
      'An email receipt is sent automatically after payment. For a formal invoice, contact support@kapruka.com with your order number.',
  },
  {
    question: 'Contact customer support',
    keywords: ['contact', 'phone', 'email', 'support', 'help', 'human'],
    answer:
      'Kapruka customer support: Email support@kapruka.com or call +94 11 234 5678, Monday to Saturday 8am–6pm Sri Lanka time.',
  },
  {
    question: 'Cash on delivery',
    keywords: ['cash on delivery', 'COD', 'pay on delivery'],
    answer:
      'Cash on delivery is available for selected areas and products. The checkout page will show if COD is available for your order.',
  },
  {
    question: 'Bulk and corporate orders',
    keywords: ['bulk order', 'corporate', 'office', 'large quantity'],
    answer:
      'For bulk or corporate orders, contact corporate@kapruka.com with your requirements.',
  },
  {
    question: 'Perishables and northern/eastern delivery',
    keywords: ['perishable', 'northern province', 'jaffna', 'trincomalee', "can't deliver", 'fresh', 'north', 'east'],
    answer:
      "Fresh items like cakes and flowers can't be delivered to the Northern and Eastern provinces (Jaffna, Trincomalee, Batticaloa, Vavuniya, Polonnaruwa) due to the 2-3 day journey. I can suggest non-perishable alternatives or the nearest available city.",
  },
];

/**
 * Returns the answer for the first FAQ entry that has ≥ 2 keyword matches
 * in the lowercased query, or null if nothing matches well enough.
 */
export function searchFAQ(query: string): string | null {
  const q = query.toLowerCase();
  for (const entry of FAQ_ENTRIES) {
    const matchCount = entry.keywords.filter((kw) => q.includes(kw.toLowerCase())).length;
    if (matchCount >= 1) return entry.answer;
  }
  return null;
}
