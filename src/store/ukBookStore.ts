import { create } from 'zustand';
import type { UKProductType } from '@/types/ukBookOptions';
import type { Character, ComplexityLevel, SupportingCastMember } from './bookStore';

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

const createDefaultCharacter = (): Character => ({
  id: Math.random().toString(36).substring(7),
  name: '',
  photos: [null, null, null],
});

interface UKBookState {
  currentStep: UKBookStep;
  
  // Generation inputs (reuse from bookStore types)
  characters: Character[];
  complexityLevel: ComplexityLevel;
  customPrompt: string;
  selectedInterests: string[];
  supportingCast: SupportingCastMember[];
  supportingCastPerPage: number;
  supportingCastPageCount: number;
  
  // UK-specific product selection
  selectedProduct: UKProductType | null;
  shippingAddress: ShippingAddress | null;
  
  // Order tracking
  ukOrderId: string | null;
  generatedBookId: string | null;
  jobId: string | null;
  isAdminBypass: boolean;
  
  // Actions
  setStep: (step: UKBookStep) => void;
  setCharacters: (characters: Character[]) => void;
  setComplexityLevel: (level: ComplexityLevel) => void;
  setCustomPrompt: (prompt: string) => void;
  setSelectedInterests: (interests: string[]) => void;
  setSupportingCast: (cast: SupportingCastMember[]) => void;
  addSupportingCastMember: (photo: File | string) => void;
  removeSupportingCastMember: (id: string) => void;
  setSupportingCastPerPage: (count: number) => void;
  setSupportingCastPageCount: (count: number) => void;
  setSelectedProduct: (product: UKProductType) => void;
  setShippingAddress: (address: ShippingAddress | null) => void;
  setUKOrderId: (id: string | null) => void;
  setGeneratedBookId: (id: string | null) => void;
  setJobId: (id: string | null) => void;
  setAdminBypass: (bypass: boolean) => void;
  reset: () => void;
}

const initialState = {
  currentStep: 'uk-hero' as UKBookStep,
  characters: [createDefaultCharacter()],
  complexityLevel: 'medium' as ComplexityLevel,
  customPrompt: '',
  selectedInterests: [] as string[],
  supportingCast: [] as SupportingCastMember[],
  supportingCastPerPage: 1,
  supportingCastPageCount: 4,
  selectedProduct: null,
  shippingAddress: null,
  ukOrderId: null,
  generatedBookId: null,
  jobId: null,
  isAdminBypass: false,
};

export const useUKBookStore = create<UKBookState>((set) => ({
  ...initialState,
  
  setStep: (step) => set({ currentStep: step }),
  setCharacters: (characters) => set({ characters }),
  setComplexityLevel: (level) => set({ complexityLevel: level }),
  setCustomPrompt: (prompt) => set({ customPrompt: prompt }),
  setSelectedInterests: (interests) => set({ selectedInterests: interests }),
  setSupportingCast: (cast) => set({ supportingCast: cast }),
  addSupportingCastMember: (photo) =>
    set((state) => {
      if (state.supportingCast.length >= 5) return state;
      return {
        supportingCast: [...state.supportingCast, {
          id: Math.random().toString(36).substring(7),
          photo,
        }],
      };
    }),
  removeSupportingCastMember: (id) =>
    set((state) => ({
      supportingCast: state.supportingCast.filter((c) => c.id !== id),
    })),
  setSupportingCastPerPage: (count) => set({ supportingCastPerPage: count }),
  setSupportingCastPageCount: (count) => set({ supportingCastPageCount: count }),
  setSelectedProduct: (product) => set({ selectedProduct: product }),
  setShippingAddress: (address) => set({ shippingAddress: address }),
  setUKOrderId: (id) => set({ ukOrderId: id }),
  setGeneratedBookId: (id) => set({ generatedBookId: id }),
  setJobId: (id) => set({ jobId: id }),
  setAdminBypass: (bypass) => set({ isAdminBypass: bypass }),
  reset: () => set(initialState),
}));
