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

const callEdgeFunction = async (functionName: string, body: any, retries = 3) => {
  const { supabase } = await import('@/integrations/supabase/client');
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Always send the backend API key; only send Authorization when we have a user session.
  // (Using the publishable key as a Bearer token can cause requests to look "logged out".)
  const headersBase: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };

  if (session?.access_token) {
    headersBase.Authorization = `Bearer ${session.access_token}`;
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
        {
          method: 'POST',
          headers: headersBase,
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        if (response.status === 429) {
          const errorData = await response.json().catch(() => ({}));
          const isRateLimitError = errorData.isRateLimitError || errorData.error?.includes('Rate limit');
          
          if (isRateLimitError) {
            throw new Error('Rate limit exceeded. Please wait 1-2 minutes and try again.');
          }
        }
        if (response.status === 402) {
          throw new Error('AI credits depleted. Please add credits in Settings → Workspace → Usage to continue.');
        }
        
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }
      
      return response.json();
    } catch (error: any) {
      console.error(`Attempt ${attempt + 1}/${retries} failed for ${functionName}:`, error);
      
      // If this is the last retry, throw a more helpful error
      if (attempt === retries - 1) {
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
          throw new Error(
            `Unable to connect to the generation service. This may be due to:\n` +
            `• Temporary network issues\n` +
            `• Service deployment in progress\n` +
            `• Internet connection problems\n\n` +
            `Please wait a moment and try again.`
          );
        }
        throw error;
      }
      
      // Wait before retrying (exponential backoff: 1s, 2s, 4s)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error('Max retries exceeded');
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
  batchSize?: number,
  complexity?: string,
  isRework: boolean = false
): Promise<{ 
  pages: GeneratedPage[]; 
  successCount: number; 
  totalCount: number; 
  batchInfo?: any;
  partialResult?: boolean;
  timeoutWarning?: boolean;
  executionTime?: number;
}> => {
  // Determine if this is a rework call (no batch parameters)
  const isReworkMode = isRework || (batchIndex === undefined && batchSize === undefined && prompts.length < 12);
  
  console.log(`[API] generateImages called with ${prompts.length} prompts. Page numbers: [${prompts.map(p => p.pageNumber).join(', ')}]`);
  console.log(`[API] Rework mode: ${isReworkMode}, batchIndex: ${batchIndex}, batchSize: ${batchSize}, complexity: ${complexity || 'default'}`);
  console.log(`💰 Estimated cost for this batch: ${prompts.length} pages × 2 calls × $${complexity === 'simple' ? '0.053' : complexity === 'detailed' ? '0.177' : '0.106'}`);
  
  return callEdgeFunction('generate-images', {
    prompts, 
    characters,
    consistentCharacters,
    batchIndex,
    batchSize,
    isReworkMode,
    complexity
  }, 1); // Only 1 retry for expensive AI calls to prevent credit burning
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
  pageImageUrl: string,
  characters?: Character[]
): Promise<{ frontCover: string; backCover: string }> => {
  console.log(`💰 Generating cover with 2 AI calls`);
  return callEdgeFunction('generate-cover', { 
    characterName, 
    interests,
    pageImageUrl,
    characters
  }, 1); // Only 1 retry for expensive AI calls
};
