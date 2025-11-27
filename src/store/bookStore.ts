import { create } from 'zustand';
import type { BindingType, PageCount, BookOption } from '@/types/bookOptions';
import { getBookOption } from '@/types/bookOptions';

export type BookStep = 'hero' | 'upload' | 'complexity' | 'interests' | 'book-options' | 'payment' | 'generating' | 'complete' | 'rework-settings';
export type ComplexityLevel = 'simple' | 'medium' | 'detailed';

export interface Character {
  id: string;
  name: string;
  photos: (File | string | null)[];
}

export interface GeneratedPage {
  pageNumber: number;
  imageUrl: string;
  prompt: string;
  error?: string;
}

export interface GenerationParams {
  characters: Character[];
  consistentCharacters: boolean;
  interests: string[];
  complexityLevel: ComplexityLevel;
  customPrompt?: string;
}

interface BookState {
  currentStep: BookStep;
  characters: Character[];
  consistentCharacters: boolean;
  complexityLevel: ComplexityLevel;
  customPrompt: string;
  selectedInterests: string[];
  generatedPages: GeneratedPage[];
  generationProgress: number;
  generationStatus: string;
  apiError: string | null;
  isGeneratingPrompts: boolean;
  isGeneratingImages: boolean;
  currentApiCall: 'prompts' | 'images' | 'photos' | null;
  selectedPagesForRework: number[];
  originalGenerationParams: GenerationParams | null;
  isReworkMode: boolean;
  maxReworksReached: boolean;
  reworkedPageNumbers: number[];
  generatedBookId: string | null;
  coverImageUrl: string | null;
  backCoverImageUrl: string | null;
  selectedPageCount: PageCount;
  selectedBinding: BindingType;
  selectedPrice: number;
  selectedPodPackageId: string;
  paymentBypassed: boolean;
  orderId: string | null;
  
  setStep: (step: BookStep) => void;
  setPaymentBypassed: (bypassed: boolean) => void;
  setOrderId: (id: string | null) => void;
  addCharacter: () => void;
  removeCharacter: (id: string) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  setCharacterPhoto: (characterId: string, photoIndex: number, file: File | null) => void;
  setComplexityLevel: (level: ComplexityLevel) => void;
  setCustomPrompt: (prompt: string) => void;
  toggleInterest: (interest: string) => void;
  setInterests: (interests: string[]) => void;
  togglePageForRework: (pageNumber: number) => void;
  setGeneratedPages: (pages: GeneratedPage[]) => void;
  setGenerationProgress: (progress: number) => void;
  setGenerationStatus: (status: string) => void;
  setApiError: (error: string | null) => void;
  setIsGeneratingPrompts: (loading: boolean) => void;
  setIsGeneratingImages: (loading: boolean) => void;
  setCurrentApiCall: (call: 'prompts' | 'images' | 'photos' | null) => void;
  setGeneratedBookId: (id: string | null) => void;
  setCoverImageUrl: (url: string | null) => void;
  setBackCoverImageUrl: (url: string | null) => void;
  setBookOptions: (pageCount: PageCount, binding: BindingType) => void;
  getSelectedBookOption: () => BookOption;
  setReworkedPageNumbers: (pageNumbers: number[]) => void;
  enterReworkMode: () => void;
  completeRework: () => void;
  reset: () => void;
}

const createDefaultCharacter = (): Character => ({
  id: Math.random().toString(36).substring(7),
  name: '',
  photos: [null, null, null],
});

const initialState = {
  currentStep: 'hero' as BookStep,
  characters: [createDefaultCharacter()],
  consistentCharacters: true,
  complexityLevel: 'medium' as ComplexityLevel, // Default to medium
  customPrompt: '',
  selectedInterests: [] as string[],
  generatedPages: [] as GeneratedPage[],
  generationProgress: 0,
  generationStatus: '',
  apiError: null as string | null,
  isGeneratingPrompts: false,
  isGeneratingImages: false,
  currentApiCall: null as 'prompts' | 'images' | 'photos' | null,
  selectedPagesForRework: [] as number[],
  originalGenerationParams: null as GenerationParams | null,
  isReworkMode: false,
  maxReworksReached: false,
  reworkedPageNumbers: [] as number[],
  generatedBookId: null as string | null,
  coverImageUrl: null as string | null,
  backCoverImageUrl: null as string | null,
  selectedPageCount: 24 as PageCount,
  selectedBinding: 'premium' as BindingType,
  selectedPrice: 34.99,
  selectedPodPackageId: '0850X1100BWSTDCO060UW444MXX',
  paymentBypassed: false,
  orderId: null,
};

export const useBookStore = create<BookState>((set, get) => ({
  ...initialState,
  
  setStep: (step) => set({ currentStep: step }),
  
  setPaymentBypassed: (bypassed) => set({ paymentBypassed: bypassed }),
  
  setOrderId: (id) => set({ orderId: id }),
  
  addCharacter: () =>
    set((state) => {
      if (state.characters.length >= 5) return state;
      return {
        characters: [...state.characters, createDefaultCharacter()],
      };
    }),
  
  removeCharacter: (id) =>
    set((state) => {
      if (state.characters.length <= 1) return state;
      return {
        characters: state.characters.filter((c) => c.id !== id),
      };
    }),
  
  updateCharacter: (id, updates) =>
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  
  setCharacterPhoto: (characterId, photoIndex, file) =>
    set((state) => ({
      characters: state.characters.map((c) => {
        if (c.id !== characterId) return c;
        const newPhotos = [...c.photos];
        newPhotos[photoIndex] = file;
        return { ...c, photos: newPhotos };
      }),
    })),
  
  setComplexityLevel: (level) => set({ complexityLevel: level }),
  
  setCustomPrompt: (prompt) => set({ customPrompt: prompt }),
  
  toggleInterest: (interest) =>
    set((state) => {
      const isSelected = state.selectedInterests.includes(interest);
      if (isSelected) {
        return {
          selectedInterests: state.selectedInterests.filter((i) => i !== interest),
        };
      } else {
        return {
          selectedInterests: [...state.selectedInterests, interest],
        };
      }
    }),
  
  setInterests: (interests) => set({ selectedInterests: interests }),
  
  togglePageForRework: (pageNumber) =>
    set((state) => {
      const isSelected = state.selectedPagesForRework.includes(pageNumber);
      const maxSelectable = Math.floor(state.generatedPages.length * 0.5);
      
      if (isSelected) {
        return {
          selectedPagesForRework: state.selectedPagesForRework.filter((p) => p !== pageNumber),
        };
      } else {
        if (state.selectedPagesForRework.length >= maxSelectable) return state;
        return {
          selectedPagesForRework: [...state.selectedPagesForRework, pageNumber],
        };
      }
    }),
  
  setGeneratedPages: (pages) => set({ generatedPages: pages }),
  
  setGenerationProgress: (progress) => set({ generationProgress: progress }),
  
  setGenerationStatus: (status) => set({ generationStatus: status }),
  
  setApiError: (error) => set({ apiError: error }),
  
  setIsGeneratingPrompts: (loading) => set({ isGeneratingPrompts: loading }),
  
  setIsGeneratingImages: (loading) => set({ isGeneratingImages: loading }),
  
  setCurrentApiCall: (call) => set({ currentApiCall: call }),
  
  setGeneratedBookId: (id) => set({ generatedBookId: id }),
  
  setCoverImageUrl: (url) => set({ coverImageUrl: url }),
  
  setBackCoverImageUrl: (url) => set({ backCoverImageUrl: url }),
  
  setBookOptions: (pageCount, binding) => {
    const option = getBookOption(pageCount, binding);
    set({
      selectedPageCount: pageCount,
      selectedBinding: binding,
      selectedPrice: option.price,
      selectedPodPackageId: option.podPackageId,
    });
  },
  
  getSelectedBookOption: () => {
    const state = get();
    return getBookOption(state.selectedPageCount, state.selectedBinding);
  },
  
  setReworkedPageNumbers: (pageNumbers) => set({ reworkedPageNumbers: pageNumbers }),
  
  enterReworkMode: () => {
    const state = get();
    console.log('Entering rework mode');
    set({
      isReworkMode: true,
      // Preserve existing page selection if already set (from CompleteStep)
      selectedPagesForRework: state.selectedPagesForRework.length > 0 
        ? state.selectedPagesForRework 
        : [],
      currentStep: 'rework-settings' as BookStep,
      generationProgress: 0,  // Reset progress
      generationStatus: '',   // Reset status
      apiError: null,         // Clear errors
      originalGenerationParams: {
        characters: state.characters,
        consistentCharacters: state.consistentCharacters,
        interests: state.selectedInterests,
        complexityLevel: state.complexityLevel,
        customPrompt: state.customPrompt,
      },
    });
  },
  
  completeRework: () =>
    set((state) => {
      // Add newly reworked pages to the cumulative list
      const newReworkedPages = [...new Set([...state.reworkedPageNumbers, ...state.selectedPagesForRework])];
      
      // Calculate if we've reached the 50% limit
      const totalPages = state.selectedPageCount;
      const maxAllowedReworks = Math.floor(totalPages * 0.5);
      const limitReached = newReworkedPages.length >= maxAllowedReworks;
      
      return {
        isReworkMode: false,
        selectedPagesForRework: [],
        originalGenerationParams: null,
        reworkedPageNumbers: newReworkedPages,
        maxReworksReached: limitReached,
        currentStep: 'complete',
        generatedBookId: state.generatedBookId,
        coverImageUrl: state.coverImageUrl,
        selectedPageCount: state.selectedPageCount,
        selectedBinding: state.selectedBinding,
        selectedPrice: state.selectedPrice,
        selectedPodPackageId: state.selectedPodPackageId,
      };
    }),
  
  reset: () => set(initialState),
}));
