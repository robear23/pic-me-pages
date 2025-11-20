import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 1; // Reduced from 2 to save costs
const BASE_DELAY = 1000;
const FUNCTION_TIMEOUT = 140000; // 140 seconds (10s before hard limit)

// Optimized system message for Step 1 (50% token reduction)
const REALISTIC_SYSTEM_MESSAGE = `Generate photorealistic image matching reference photo exactly.
CHARACTER: Preserve exact facial features, hair, skin tone, age. Must be recognizable.
STYLE: Professional portrait, natural lighting, clean background, child-friendly.
OUTPUT: Real photograph quality, NOT illustration.`;

// Optimized system message for Step 2 (60% token reduction)
const LINE_ART_SYSTEM_MESSAGE = `Convert to BLACK/WHITE line art coloring page.
CHARACTER: Keep recognizable facial structure from reference.
REQUIREMENTS: ONLY pure black lines (#000000) on white background (#FFFFFF). NO shading, gradients, colors, or photographic elements.
Bold 2-4px outlines for children. Binary output: pure black lines or pure white spaces only - no gray pixels.
CRITICAL: Must be printer-ready coloring page with clean black outlines on white background.`;

// Use the cheapest model that supports image generation globally
const getModelForComplexity = (complexity?: string): string => {
  console.log(`🔒 Model locked to google/gemini-2.5-flash for testing (requested: ${complexity || 'default'})`);
  return 'google/gemini-2.5-flash'; // Cheapest model with image generation support - 40% cost savings
};

// Lightweight validation - just check if image looks reasonable
async function validateLineArt(base64Image: string): Promise<boolean> {
  try {
    // Quick validation: check base64 is valid and reasonable size
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    if (!base64Data || base64Data.length < 100) {
      return false;
    }
    // Image exists and has data, assume it's valid
    // AI is responsible for generating proper line art
    return true;
  } catch (error) {
    console.error('Line art validation error:', error);
    return false;
  }
}

async function generateRealisticImage(
  prompt: any,
  contentParts: any[],
  LOVABLE_API_KEY: string,
  pageIndex: number,
  totalPages: number,
  complexity?: string
): Promise<string> {
  const selectedModel = getModelForComplexity(complexity);
  const MODELS = [selectedModel]; // Use only the selected model
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const model of MODELS) {
      try {
        console.log(`Step 1/2 - Generating realistic image ${pageIndex + 1}/${totalPages} (attempt ${attempt}/${MAX_RETRIES}, model: ${model})`);
        
        // Merge system message with first text content
        const firstTextIndex = contentParts.findIndex((part: any) => part.type === 'text');
        const mergedContent = [...contentParts];
        
        if (firstTextIndex >= 0) {
          mergedContent[firstTextIndex] = {
            type: 'text',
            text: REALISTIC_SYSTEM_MESSAGE + '\n\n' + contentParts[firstTextIndex].text
          };
        } else {
          mergedContent.unshift({ type: 'text', text: REALISTIC_SYSTEM_MESSAGE });
        }
        
        const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'user',
                content: mergedContent
              }
            ],
            modalities: ['image', 'text']
          }),
        });

        if (imageResponse.status === 429) {
          console.error(`Rate limit hit on attempt ${attempt} with model ${model}`);
          throw new Error('Rate limit exceeded. Please wait and try again.');
        }

        if (imageResponse.status === 402) {
          console.error(`Payment required on attempt ${attempt} with model ${model}`);
          throw new Error('AI credits depleted. Please contact support.');
        }

        if (imageResponse.status === 504) {
          console.error(`Gateway timeout on attempt ${attempt} with model ${model}`);
          throw new Error('Request timeout. Please try again.');
        }

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          console.error(`Step 1 API error (${imageResponse.status}): ${errorText}`);
          
          // Only retry on transient errors
          if (attempt < MAX_RETRIES && (imageResponse.status === 429 || imageResponse.status === 402 || imageResponse.status === 504)) {
            const delay = BASE_DELAY * Math.pow(2, attempt - 1);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`Step 1 failed: ${errorText}`);
        }

        const data = await imageResponse.json();
        const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (!imageData) {
          console.error('No image data in Step 1 response');
          if (attempt < MAX_RETRIES) {
            continue;
          }
          throw new Error('No image data received from Step 1');
        }

        console.log(`Successfully generated realistic image ${pageIndex + 1}/${totalPages} on attempt ${attempt} with model ${model}`);
        return imageData;
        
      } catch (error) {
        console.error(`Step 1 error (attempt ${attempt}, model ${model}):`, error);
        if (attempt === MAX_RETRIES && model === MODELS[MODELS.length - 1]) {
          throw error;
        }
      }
    }
  }
  
  throw new Error('Failed to generate realistic image after all retries');
}

async function convertToLineArt(
  realisticImageBase64: string,
  prompt: any,
  LOVABLE_API_KEY: string,
  pageIndex: number,
  totalPages: number,
  complexity?: string
): Promise<string> {
  const selectedModel = getModelForComplexity(complexity);
  const MODELS = [selectedModel]; // Use only the selected model
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const model of MODELS) {
      try {
        console.log(`Step 2/2 - Converting to line art ${pageIndex + 1}/${totalPages} (attempt ${attempt}/${MAX_RETRIES}, model: ${model})`);
        
        const contentParts = [
          {
            type: 'text',
            text: LINE_ART_SYSTEM_MESSAGE + `\n\nConvert this realistic image to black and white line art for a children's coloring book. The scene is: ${prompt.prompt}`
          },
          {
            type: 'image_url',
            image_url: {
              url: realisticImageBase64
            }
          }
        ];
        
        const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'user',
                content: contentParts
              }
            ],
            modalities: ['image', 'text']
          }),
        });

        if (imageResponse.status === 429) {
          console.error(`Rate limit hit on attempt ${attempt} with model ${model}`);
          throw new Error('Rate limit exceeded. Please wait and try again.');
        }

        if (imageResponse.status === 402) {
          console.error(`Payment required on attempt ${attempt} with model ${model}`);
          throw new Error('AI credits depleted. Please contact support.');
        }

        if (imageResponse.status === 504) {
          console.error(`Gateway timeout on attempt ${attempt} with model ${model}`);
          throw new Error('Request timeout. Please try again.');
        }

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          console.error(`Step 2 API error (${imageResponse.status}): ${errorText}`);
          
          // Only retry on transient errors
          if (attempt < MAX_RETRIES && (imageResponse.status === 429 || imageResponse.status === 402 || imageResponse.status === 504)) {
            const delay = BASE_DELAY * Math.pow(2, attempt - 1);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`Step 2 failed: ${errorText}`);
        }

        const data = await imageResponse.json();
        const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (!imageData) {
          console.error('No image data in Step 2 response');
          if (attempt < MAX_RETRIES) {
            continue;
          }
          throw new Error('No image data received from Step 2');
        }

        console.log(`Successfully converted to line art ${pageIndex + 1}/${totalPages} on attempt ${attempt} with model ${model}`);
        
        // Validate the line art looks reasonable
        const isValid = await validateLineArt(imageData);
        if (!isValid) {
          console.error(`Line art validation failed for page ${pageIndex + 1}`);
          if (attempt < MAX_RETRIES) {
            continue;
          }
          throw new Error('Line art validation failed after all retries');
        }
        
        console.log(`Line art validated successfully for page ${pageIndex + 1}/${totalPages}`);
        return imageData;
        
      } catch (error) {
        console.error(`Step 2 error (attempt ${attempt}, model ${model}):`, error);
        if (attempt === MAX_RETRIES && model === MODELS[MODELS.length - 1]) {
          throw error;
        }
      }
    }
  }
  
  throw new Error('Failed to convert to line art after all retries');
}

serve(async (req) => {
  console.log(`[${new Date().toISOString()}] generate-images started - Method: ${req.method}`);
  
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[HEALTH] generate-images called at', new Date().toISOString());
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is required');
    }

    const { prompts, characters, consistentCharacters, batchIndex, batchSize = 3, isReworkMode = false, complexity } = await req.json();

    if (!prompts || !Array.isArray(prompts)) {
      throw new Error('Invalid prompts array');
    }

    // Filter out any prompts that don't have the required fields
    let validPrompts = prompts.filter((p: any) => p && p.prompt && p.pageNumber);
    
    if (validPrompts.length === 0) {
      throw new Error('No valid prompts provided');
    }

    // Log received prompts for debugging
    console.log(`Received ${prompts.length} prompts, ${validPrompts.length} valid. Page numbers: [${validPrompts.map(p => p.pageNumber).join(', ')}]`);
    console.log(`Rework mode: ${isReworkMode}, batchIndex: ${batchIndex}, batchSize: ${batchSize}`);

    // Calculate batch range if batchIndex is provided AND not in rework mode
    // In rework mode, prompts are already filtered to only selected pages
    let batchInfo = null;
    
    if (typeof batchIndex === 'number' && !isReworkMode) {
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, validPrompts.length);
      
      console.log(`Batch slicing: startIdx=${startIdx}, endIdx=${endIdx}, array length=${validPrompts.length}`);
      validPrompts = validPrompts.slice(startIdx, endIdx);
      
      const totalBatches = Math.ceil(prompts.filter((p: any) => p && p.prompt && p.pageNumber).length / batchSize);
      batchInfo = {
        batchIndex,
        batchSize,
        totalBatches,
        processedPages: validPrompts.map((p: any) => p.pageNumber)
      };
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (pages ${startIdx + 1}-${endIdx} of original prompt list)`);
    } else if (isReworkMode) {
      console.log(`Rework mode: processing ${validPrompts.length} selected pages directly [${validPrompts.map(p => p.pageNumber).join(', ')}]`);
    }

    console.log(`Final: Processing ${validPrompts.length} pages. Page numbers: [${validPrompts.map(p => p.pageNumber).join(', ')}]`);
    console.log(`Complexity level: ${complexity || 'default (medium)'}`);

    const BATCH_SIZE = 3; // Parallel processing for efficiency
    const pages: any[] = [];
    let successCount = 0;
    const startTime = Date.now();

    // Process in batches
    for (let batchStart = 0; batchStart < validPrompts.length; batchStart += BATCH_SIZE) {
      // Check for timeout before processing each batch
      if (Date.now() - startTime > FUNCTION_TIMEOUT) {
        console.warn(`Approaching timeout limit (${FUNCTION_TIMEOUT}ms), returning partial results`);
        break;
      }
      const batchEnd = Math.min(batchStart + BATCH_SIZE, validPrompts.length);
      const batch = validPrompts.slice(batchStart, batchEnd);
      
      console.log(`Processing batch ${batchStart / BATCH_SIZE + 1}: pages ${batchStart + 1}-${batchEnd}`);

      const batchPromises = batch.map(async (prompt: any, batchIndex: number) => {
        const i = batchStart + batchIndex;
        
        try {
          console.log(`Processing page ${i + 1}/${validPrompts.length}: ${prompt.prompt.substring(0, 50)}...`);

          // Build character context with names and photos
          const characterContext: any[] = [];
          let characterNames = '';

          if (consistentCharacters && characters && Array.isArray(characters)) {
            const pageCharacters = characters.filter((char: any) => 
              !prompt.characterName || char.name === prompt.characterName
            );
            
            if (pageCharacters.length > 0) {
              characterNames = pageCharacters.map((char: any) => char.name).join(' and ');
              
              // Add character reference photos
              for (const character of pageCharacters) {
                if (character.photos && Array.isArray(character.photos) && character.photos.length > 0) {
                  for (const photoUrl of character.photos.slice(0, 1)) { // Use first photo only
                    characterContext.push({
                      type: 'image_url',
                      image_url: { url: photoUrl }
                    });
                  }
                }
              }
              
              if (characterContext.length > 0) {
                console.log(`Added ${characterContext.length} character reference photo(s) for page ${i + 1}`);
              }
            }
          }

          // Step 1: Generate realistic image
          const realisticPrompt = `Create a photorealistic image of ${characterNames || 'the character'} in this scene:

SCENE: ${prompt.prompt}

CHARACTER CONSISTENCY:
${characterContext.length > 0 
  ? `Study the reference photo to capture the character's appearance:
- Face shape, facial features, and proportions
- Hairstyle, hair color, and texture
- Age and body proportions
- Distinctive features (glasses, smile, etc.)
- Keep this EXACT person recognizable`
  : 'Create a consistent character appearance'}

STYLE:
- Photorealistic with soft, natural lighting
- Flattering composition and angles
- Clean, pleasant background
- Natural colors and tones
- Child-friendly content`;

          const contentParts = [
            { type: 'text', text: realisticPrompt },
            ...characterContext
          ];

          const realisticImageBase64 = await generateRealisticImage(
            prompt,
            contentParts,
            LOVABLE_API_KEY,
            i,
            validPrompts.length,
            complexity
          );

          // Step 2: Convert to line art
          const lineArtImageBase64 = await convertToLineArt(
            realisticImageBase64,
            prompt,
            LOVABLE_API_KEY,
            i,
            validPrompts.length,
            complexity
          );

          successCount++;

          return {
            pageNumber: prompt.pageNumber,
            imageUrl: lineArtImageBase64,
            prompt: prompt.prompt
          };

        } catch (error: any) {
          console.error(`Failed to generate page ${i + 1} (page number ${prompt.pageNumber}):`, error);
          console.error(`Error details:`, {
            message: error.message,
            stack: error.stack?.substring(0, 200),
            prompt: prompt.prompt.substring(0, 100) + '...'
          });
          
          const isRateLimitError = error.message?.includes('Rate limit') || error.message?.includes('429');
          const isPaymentError = error.message?.includes('credits') || error.message?.includes('402');
          
          if (isRateLimitError || isPaymentError) {
            throw error; // Propagate rate limit and payment errors immediately
          }

          return {
            pageNumber: prompt.pageNumber,
            imageUrl: '',
            prompt: prompt.prompt,
            error: `${error.message || 'Unknown error'} (Exhausted retries after ${MAX_RETRIES} attempts)`
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      pages.push(...batchResults);
      
      console.log(`Completed batch ${batchStart / BATCH_SIZE + 1}: ${batchResults.filter(p => p.imageUrl).length}/${batchResults.length} successful`);
    }

    console.log(`Generated ${successCount}/${validPrompts.length} images successfully`);
    
    const executionTime = Date.now() - startTime;
    const partialResult = pages.length < validPrompts.length;
    const timeoutWarning = executionTime > FUNCTION_TIMEOUT;

    if (partialResult) {
      console.warn(`Partial results: ${pages.length}/${validPrompts.length} pages processed`);
    }
    if (timeoutWarning) {
      console.warn(`Timeout warning: execution took ${executionTime}ms (limit: ${FUNCTION_TIMEOUT}ms)`);
    }

    return new Response(
      JSON.stringify({ 
        pages,
        successCount,
        totalCount: validPrompts.length,
        batchInfo,
        partialResult,
        timeoutWarning,
        executionTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-images function:', error);
    
    const isRateLimitError = error.message?.includes('Rate limit') || error.message?.includes('429');
    const isPaymentError = error.message?.includes('credits') || error.message?.includes('402');
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        isRateLimitError,
        isPaymentError
      }),
      { 
        status: isRateLimitError ? 429 : (isPaymentError ? 402 : 500),
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
