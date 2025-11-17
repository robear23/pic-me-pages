export type BindingType = 'standard' | 'premium';
export type PageCount = 12 | 24 | 32;

export interface BookOption {
  pageCount: PageCount;
  binding: BindingType;
  price: number;
  podPackageId: string;
  name: string;
  description: string;
  badge?: 'BEST VALUE' | 'RECOMMENDED' | 'MOST POPULAR';
  features: string[];
}

// TODO: Verify POD package IDs for 24 and 32-page books with Lulu
// Current IDs are confirmed for 12-page books only
export const BOOK_OPTIONS: Record<string, BookOption> = {
  '12-standard': {
    pageCount: 12,
    binding: 'standard',
    price: 19.99,
    podPackageId: '0850X1100BWSTDSTD060UW444MXX',
    name: '12-Page Standard',
    description: 'Traditional stapled binding - our affordable option for quality coloring books.',
    features: [
      'Saddle stitch binding',
      'Durable stapled spine',
      'Great for younger children',
      'Most affordable option'
    ]
  },
  '12-premium': {
    pageCount: 12,
    binding: 'premium',
    price: 24.99,
    podPackageId: '0850X1100FCPRECO060UW444MXX',
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
  '24-standard': {
    pageCount: 24,
    binding: 'standard',
    price: 34.99,
    podPackageId: '0850X1100BWSTDSTD060UW444MXX', // TODO: Verify 24-page saddle stitch POD ID
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
    price: 39.99,
    podPackageId: '0850X1100FCPRECO060UW444MXX', // TODO: Verify 24-page coil POD ID
    name: '24-Page Premium Coil',
    description: 'Professional coil binding with the perfect amount of content.',
    badge: 'BEST VALUE',
    features: [
      'Lays completely flat',
      'Professional coil binding',
      'Perfect page count',
      'Save $10 vs two 12-page books'
    ]
  },
  '32-standard': {
    pageCount: 32,
    binding: 'standard',
    price: 44.99,
    podPackageId: '0850X1100BWSTDSTD060UW444MXX', // TODO: Verify 32-page saddle stitch POD ID
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
    price: 49.99,
    podPackageId: '0850X1100FCPRECO060UW444MXX', // TODO: Verify 32-page coil POD ID
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
    BOOK_OPTIONS[`${pageCount}-standard`],
    BOOK_OPTIONS[`${pageCount}-premium`]
  ];
};

// Helper function to calculate per-page cost
export const getPerPageCost = (option: BookOption): number => {
  return option.price / option.pageCount;
};
