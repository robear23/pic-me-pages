import { create } from 'zustand';

export type BookStep = 'hero' | 'upload' | 'interests' | 'generating' | 'complete';

export interface GeneratedPage {
  pageNumber: number;
  imageUrl: string;
  prompt: string;
}

interface BookState {
  currentStep: BookStep;
  characterName: string;
  characterPhotos: (File | null)[];
  selectedInterests: string[];
  generatedPages: GeneratedPage[];
  generationProgress: number;
  generationStatus: string;
  apiError: string | null;
  isGeneratingPrompts: boolean;
  isGeneratingImages: boolean;
  currentApiCall: 'prompts' | 'images' | 'photos' | null;
  
  setStep: (step: BookStep) => void;
  setCharacterName: (name: string) => void;
  setCharacterPhoto: (index: number, file: File | null) => void;
  toggleInterest: (interest: string) => void;
  setGeneratedPages: (pages: GeneratedPage[]) => void;
  setGenerationProgress: (progress: number) => void;
  setGenerationStatus: (status: string) => void;
  setApiError: (error: string | null) => void;
  setIsGeneratingPrompts: (loading: boolean) => void;
  setIsGeneratingImages: (loading: boolean) => void;
  setCurrentApiCall: (call: 'prompts' | 'images' | 'photos' | null) => void;
  reset: () => void;
}

const initialState = {
  currentStep: 'hero' as BookStep,
  characterName: '',
  characterPhotos: [null, null, null] as (File | null)[],
  selectedInterests: [] as string[],
  generatedPages: [] as GeneratedPage[],
  generationProgress: 0,
  generationStatus: '',
  apiError: null as string | null,
  isGeneratingPrompts: false,
  isGeneratingImages: false,
  currentApiCall: null as 'prompts' | 'images' | 'photos' | null,
};

export const useBookStore = create<BookState>((set) => ({
  ...initialState,
  
  setStep: (step) => set({ currentStep: step }),
  
  setCharacterName: (name) => set({ characterName: name }),
  
  setCharacterPhoto: (index, file) =>
    set((state) => {
      const newPhotos = [...state.characterPhotos];
      newPhotos[index] = file;
      return { characterPhotos: newPhotos };
    }),
  
  toggleInterest: (interest) =>
    set((state) => {
      const isSelected = state.selectedInterests.includes(interest);
      if (isSelected) {
        return {
          selectedInterests: state.selectedInterests.filter((i) => i !== interest),
        };
      } else {
        if (state.selectedInterests.length >= 5) return state;
        return {
          selectedInterests: [...state.selectedInterests, interest],
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
  
  reset: () => set(initialState),
}));
