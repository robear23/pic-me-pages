import { create } from 'zustand';

export type BookStep = 'hero' | 'upload' | 'settings' | 'interests' | 'generating' | 'complete' | 'rework-settings';

export interface Character {
  id: string;
  name: string;
  photos: (File | null)[];
}

export interface GeneratedPage {
  pageNumber: number;
  imageUrl: string;
  prompt: string;
  error?: string;
}

export interface GenerationParams {
  characters: Character[];
  complexity: 'simple' | 'medium' | 'detailed';
  artStyle: 'cartoon' | 'realistic' | 'minimalist' | 'whimsical' | 'photorealistic';
  consistentCharacters: boolean;
  interests: string[];
}

interface BookState {
  currentStep: BookStep;
  characters: Character[];
  complexity: 'simple' | 'medium' | 'detailed';
  artStyle: 'cartoon' | 'realistic' | 'minimalist' | 'whimsical' | 'photorealistic';
  consistentCharacters: boolean;
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
  generatedBookId: string | null;
  coverImageUrl: string | null;
  
  setStep: (step: BookStep) => void;
  addCharacter: () => void;
  removeCharacter: (id: string) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  setCharacterPhoto: (characterId: string, photoIndex: number, file: File | null) => void;
  setComplexity: (complexity: 'simple' | 'medium' | 'detailed') => void;
  setArtStyle: (style: 'cartoon' | 'realistic' | 'minimalist' | 'whimsical' | 'photorealistic') => void;
  toggleConsistentCharacters: () => void;
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
  complexity: 'medium' as const,
  artStyle: 'cartoon' as const,
  consistentCharacters: true,
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
  generatedBookId: null as string | null,
  coverImageUrl: null as string | null,
};

export const useBookStore = create<BookState>((set, get) => ({
  ...initialState,
  
  setStep: (step) => set({ currentStep: step }),
  
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
  
  setComplexity: (complexity) => set({ complexity }),
  
  setArtStyle: (artStyle) => set({ artStyle }),
  
  toggleConsistentCharacters: () =>
    set((state) => ({ consistentCharacters: !state.consistentCharacters })),
  
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
  
  enterReworkMode: () => {
    const state = get();
    set({
      isReworkMode: true,
      originalGenerationParams: {
        characters: state.characters,
        complexity: state.complexity,
        artStyle: state.artStyle,
        consistentCharacters: state.consistentCharacters,
        interests: state.selectedInterests,
      },
    });
  },
  
  completeRework: () => set({ maxReworksReached: true, isReworkMode: false }),
  
  reset: () => set(initialState),
}));
