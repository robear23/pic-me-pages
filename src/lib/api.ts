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
  const { supabase } = await import('@/integrations/supabase/client');
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
  consistentCharacters: boolean,
  targetPageCount: number = 12
): Promise<{ prompts: GeneratedPrompt[] }> => {
  return callEdgeFunction('generate-prompts', { 
    characters, 
    interests,
    consistentCharacters,
    targetPageCount
  });
};

export const generateImages = async (
  prompts: GeneratedPrompt[], 
  characters: Character[],
  consistentCharacters: boolean,
  batchIndex?: number,
  batchSize?: number
): Promise<{ pages: GeneratedPage[]; successCount: number; totalCount: number; batchInfo?: any }> => {
  return callEdgeFunction('generate-images', { 
    prompts, 
    characters,
    consistentCharacters,
    batchIndex,
    batchSize
  });
};

export const uploadPhotos = async (
  photos: Array<{ base64: string; filename: string }>
): Promise<{ optimizedPhotos: string[]; count: number; totalSize: number }> => {
  return callEdgeFunction('upload-character-photos', { photos });
};

export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  phoneNumber: string;
  country: string;
}

export const createPrintOrder = async (
  bookId: string,
  shippingAddress: ShippingAddress
): Promise<{ success: boolean; order: any; luluOrderId: string; environment?: string; shippingLevel?: string }> => {
  return callEdgeFunction('create-print-order', { bookId, shippingAddress });
};

export const generateCover = async (
  characterName: string,
  interests: string[],
  characters?: Character[]
): Promise<{ frontCover: string; backCover: string }> => {
  return callEdgeFunction('generate-cover', { 
    characterName, 
    interests,
    characters
  });
};
