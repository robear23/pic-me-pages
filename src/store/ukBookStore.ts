import { create } from 'zustand';
import type { UKProductType } from '@/types/ukBookOptions';
import type { Character, ComplexityLevel } from './bookStore';

export type UKBookStep = 
  | 'uk-hero' 
  | 'uk-upload' 
  | 'uk-complexity' 
  | 'uk-interests' 
  | 'uk-product-selection'
  | 'uk-payment' 
  | 'uk-generating' 
  | 'uk-complete';

interface ShippingAddress {
  name: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  phone: string;
  email: string;
  specialInstructions: string;
}

interface UKBookState {
  currentStep: UKBookStep;
  
  // Generation inputs (reuse from bookStore types)
  characters: Character[];
  complexityLevel: ComplexityLevel;
  customPrompt: string;
  selectedInterests: string[];
  
  // UK-specific product selection
  selectedProduct: UKProductType | null;
  shippingAddress: ShippingAddress | null;
  
  // Order tracking
  ukOrderId: string | null;
  generatedBookId: string | null;
  
  // Actions
  setStep: (step: UKBookStep) => void;
  setCharacters: (characters: Character[]) => void;
  setComplexityLevel: (level: ComplexityLevel) => void;
  setCustomPrompt: (prompt: string) => void;
  setSelectedInterests: (interests: string[]) => void;
  setSelectedProduct: (product: UKProductType) => void;
  setShippingAddress: (address: ShippingAddress | null) => void;
  setUKOrderId: (id: string | null) => void;
  setGeneratedBookId: (id: string | null) => void;
  reset: () => void;
}

const initialState = {
  currentStep: 'uk-hero' as UKBookStep,
  characters: [] as Character[],
  complexityLevel: 'medium' as ComplexityLevel,
  customPrompt: '',
  selectedInterests: [] as string[],
  selectedProduct: null,
  shippingAddress: null,
  ukOrderId: null,
  generatedBookId: null,
};

export const useUKBookStore = create<UKBookState>((set) => ({
  ...initialState,
  
  setStep: (step) => set({ currentStep: step }),
  setCharacters: (characters) => set({ characters }),
  setComplexityLevel: (level) => set({ complexityLevel: level }),
  setCustomPrompt: (prompt) => set({ customPrompt: prompt }),
  setSelectedInterests: (interests) => set({ selectedInterests: interests }),
  setSelectedProduct: (product) => set({ selectedProduct: product }),
  setShippingAddress: (address) => set({ shippingAddress: address }),
  setUKOrderId: (id) => set({ ukOrderId: id }),
  setGeneratedBookId: (id) => set({ generatedBookId: id }),
  reset: () => set(initialState),
}));
