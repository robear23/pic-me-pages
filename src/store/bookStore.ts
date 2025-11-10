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
  
  setStep: (step: BookStep) => void;
  setCharacterName: (name: string) => void;
  setCharacterPhoto: (index: number, file: File | null) => void;
  toggleInterest: (interest: string) => void;
  setGeneratedPages: (pages: GeneratedPage[]) => void;
  setGenerationProgress: (progress: number) => void;
  setGenerationStatus: (status: string) => void;
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
  
  reset: () => set(initialState),
}));
