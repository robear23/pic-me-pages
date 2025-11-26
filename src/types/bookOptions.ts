export type BindingType = 'standard' | 'premium' | 'pdf';
export type PageCount = 12 | 24 | 32;

export interface BookOption {
  pageCount: PageCount;
  binding: BindingType;
  price: number;
  podPackageId?: string;
  name: string;
  description: string;
  badge?: 'BEST VALUE' | 'RECOMMENDED' | 'MOST POPULAR';
  features: string[];
  isPdfOnly?: boolean;
}

// Verified POD package IDs for Lulu print-on-demand:
// Standard (Saddle Stitch): 0850X1100BWSTDSS060UW444MXX
// Premium (Coil): 0850X1100BWSTDCO060UW444MXX
// These IDs work for all page counts (12, 24, 32 pages)
export const BOOK_OPTIONS: Record<string, BookOption> = {
  '12-pdf': {
    pageCount: 12,
    binding: 'pdf',
    price: 9.99,
    name: '12-Page PDF Download',
    description: 'Instant digital download - print at home or your favorite print shop.',
    badge: 'BEST VALUE',
    features: [
      'Instant download',
      'Print unlimited copies',
      'High-resolution PDF',
      'Most affordable option'
    ],
    isPdfOnly: true
  },
  '12-standard': {
    pageCount: 12,
    binding: 'standard',
    price: 24.99,
    podPackageId: '0850X1100BWSTDSS060UW444MXX',
    name: '12-Page Standard',
    description: 'Traditional stapled binding - our affordable option for quality coloring books.',
    features: [
      'Saddle stitch binding',
      'Durable stapled spine',
      'Great for younger children',
      'Professionally printed'
    ]
  },
  '12-premium': {
    pageCount: 12,
    binding: 'premium',
    price: 29.99,
    podPackageId: '0850X1100BWSTDCO060UW444MXX',
    name: '12-Page Premium Coil',
    description: 'Professional coil binding that lays completely flat. Perfect for easy coloring and durability.',
    badge: 'RECOMMENDED',
    features: [
      'Lays completely flat',
      'Professional coil binding',
      'Easy to flip pages',
      'Most popular choice'
    ]
  },
  '24-pdf': {
    pageCount: 24,
    binding: 'pdf',
    price: 12.99,
    name: '24-Page PDF Download',
    description: 'Digital download with more content to enjoy.',
    features: [
      'Instant download',
      'Print unlimited copies',
      'High-resolution PDF',
      'Great value'
    ],
    isPdfOnly: true
  },
  '24-standard': {
    pageCount: 24,
    binding: 'standard',
    price: 29.99,
    podPackageId: '0850X1100BWSTDSS060UW444MXX',
    name: '24-Page Standard',
    description: 'Traditional stapled binding with double the content.',
    features: [
      'Saddle stitch binding',
      'Double the coloring pages',
      'Great value',
      'Durable construction'
    ]
  },
  '24-premium': {
    pageCount: 24,
    binding: 'premium',
    price: 34.99,
    podPackageId: '0850X1100BWSTDCO060UW444MXX',
    name: '24-Page Premium Coil',
    description: 'Professional coil binding with the perfect amount of content.',
    badge: 'BEST VALUE',
    features: [
      'Lays completely flat',
      'Professional coil binding',
      'Perfect page count',
      'Save vs buying multiple books'
    ]
  },
  '32-pdf': {
    pageCount: 32,
    binding: 'pdf',
    price: 14.99,
    name: '32-Page PDF Download',
    description: 'Maximum content in convenient digital format.',
    features: [
      'Instant download',
      'Print unlimited copies',
      'High-resolution PDF',
      'Maximum pages'
    ],
    isPdfOnly: true
  },
  '32-standard': {
    pageCount: 32,
    binding: 'standard',
    price: 34.99,
    podPackageId: '0850X1100BWSTDSS060UW444MXX',
    name: '32-Page Standard',
    description: 'Traditional stapled binding with maximum content.',
    features: [
      'Saddle stitch binding',
      'Maximum coloring pages',
      '33% more content',
      'Best for avid colorists'
    ]
  },
  '32-premium': {
    pageCount: 32,
    binding: 'premium',
    price: 39.99,
    podPackageId: '0850X1100BWSTDCO060UW444MXX',
    name: '32-Page Premium Coil',
    description: 'Professional coil binding with the most content.',
    features: [
      'Lays completely flat',
      'Professional coil binding',
      'Maximum pages',
      'Perfect for serious collectors'
    ]
  }
};

// Helper function to get book option by page count and binding
export const getBookOption = (pageCount: PageCount, binding: BindingType): BookOption => {
  const key = `${pageCount}-${binding}`;
  return BOOK_OPTIONS[key];
};

// Helper function to get all options for a specific page count
export const getOptionsForPageCount = (pageCount: PageCount): BookOption[] => {
  return [
    BOOK_OPTIONS[`${pageCount}-pdf`],
    BOOK_OPTIONS[`${pageCount}-standard`],
    BOOK_OPTIONS[`${pageCount}-premium`]
  ];
};

// Helper function to calculate per-page cost
export const getPerPageCost = (option: BookOption): number => {
  return option.price / option.pageCount;
};
