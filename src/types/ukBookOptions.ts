export type UKProductType = 'pdf' | 'booklet';

export interface UKBookOption {
  type: UKProductType;
  name: string;
  price: number; // in GBP
  stripePriceId: string;
  description: string;
  badge?: 'BEST VALUE' | 'RECOMMENDED';
  features: string[];
}

export const UK_BOOK_OPTIONS: Record<UKProductType, UKBookOption> = {
  pdf: {
    type: 'pdf',
    name: 'PDF Download',
    price: 7.99,
    stripePriceId: 'price_1SY7uJAH6ufMsgaDetBdVMf8',
    description: 'Download instantly and print at home',
    badge: 'BEST VALUE',
    features: [
      '18 unique coloring pages featuring your child',
      '80% more content than typical coloring books!',
      'Immediate access after payment',
      'Print unlimited copies at home',
      'Perfect for last-minute gifts',
      'High-quality 300 DPI pages',
      'Full-color covers included'
    ]
  },
  booklet: {
    type: 'booklet',
    name: 'Professionally Printed Booklet',
    price: 19.99,
    stripePriceId: 'price_1SY7uKAH6ufMsgaDeNpssT9a',
    description: 'Delivered to your door in 5-7 days',
    badge: 'RECOMMENDED',
    features: [
      '18 unique coloring pages featuring your child',
      '80% more content than typical coloring books!',
      'A4 size (210mm x 297mm)',
      'Premium matte paper (100 gsm)',
      'Professionally saddle-stitch bound',
      'Full color glossy covers',
      'UK delivery included'
    ]
  }
};

// Upgrade price ID for PDF to Booklet upgrade
export const UK_UPGRADE_PRICE_ID = 'price_1SY7uLAH6ufMsgaDiPNd8sQu';
export const UK_UPGRADE_PRICE = 12.00;

export const UK_PAGE_COUNT = 18; // Coloring pages
export const UK_TOTAL_PAGES = 20; // 18 coloring + front cover + back cover
