export interface GeneratedPrompt {
  pageNumber: number;
  interest: string;
  prompt: string;
  characterName?: string;
}

export interface GeneratedPage {
  pageNumber: number;
  imageUrl: string;
  prompt: string;
  error?: string;
}

export interface Character {
  name: string;
  photos?: string[];
}

const callEdgeFunction = async (functionName: string, body: any) => {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    }
  );
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait and try again.');
    }
    if (response.status === 402) {
      throw new Error('AI credits depleted. Please contact support.');
    }
    
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }
  
  return response.json();
};

export const generatePrompts = async (
  characters: Character[],
  interests: string[],
  complexity: 'simple' | 'medium' | 'detailed',
  artStyle: string,
  consistentCharacters: boolean
): Promise<{ prompts: GeneratedPrompt[] }> => {
  return callEdgeFunction('generate-prompts', { 
    characters, 
    interests,
    complexity,
    artStyle,
    consistentCharacters
  });
};

export const generateImages = async (
  prompts: GeneratedPrompt[], 
  characters: Character[],
  complexity: 'simple' | 'medium' | 'detailed',
  artStyle: string,
  consistentCharacters: boolean
): Promise<{ pages: GeneratedPage[]; successCount: number; totalCount: number }> => {
  return callEdgeFunction('generate-images', { 
    prompts, 
    characters,
    complexity,
    artStyle,
    consistentCharacters
  });
};

export const uploadPhotos = async (
  photos: Array<{ base64: string; filename: string }>
): Promise<{ optimizedPhotos: string[]; count: number; totalSize: number }> => {
  return callEdgeFunction('upload-character-photos', { photos });
};
