import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 2;
const BASE_DELAY = 1000;

// System message for Step 1: Generate realistic, photogenic image
const REALISTIC_SYSTEM_MESSAGE = `You are creating photorealistic images for a personalized children's book.

TASK: Generate a realistic, photogenic image that MUST look like a real photograph taken with a camera.

CHARACTER CONSISTENCY (CRITICAL):
- Study the reference photo carefully to capture EXACT character appearance
- Preserve EXACT facial features: eye color, eye shape, nose shape, mouth, face structure
- Keep hairstyle, hair color, hair texture EXACTLY as shown in reference
- Maintain skin tone, age, and ALL distinctive characteristics precisely
- The character MUST be recognizable as the same person from the reference photo
- Generate natural poses and expressions appropriate for the scene
- This should look like a real photograph of this specific child

STYLE REQUIREMENTS:
- PHOTOREALISTIC - This MUST look like an actual photograph, NOT an illustration
- Shot like a professional children's portrait photographer
- Soft, natural lighting with flattering angles
- Clean, pleasant background that fits the scene
- Natural colors and authentic skin tones
- Real-world appearance as if captured with a professional camera
- Child-friendly and age-appropriate content

CRITICAL: This is NOT line art yet - create a realistic photo-style image first that looks indistinguishable from a real photograph.`;

// System message for Step 2: Convert realistic image to line art
const LINE_ART_SYSTEM_MESSAGE = `You are converting a realistic image into black and white line art for a children's coloring book.

TASK: Transform the provided image into PURE BLACK AND WHITE line art suitable for coloring.

CHARACTER RECOGNITION (CRITICAL):
- MAINTAIN the character's recognizable facial structure and proportions
- Keep distinctive features clearly identifiable: hairstyle, face shape, eye shape, nose, mouth
- The character MUST be recognizable from the reference photo after conversion
- Preserve exact facial proportions and feature placement
- Keep the character's unique characteristics visible in line art form

LINE ART REQUIREMENTS - MUST BE FOLLOWED EXACTLY:
- ONLY pure black lines (#000000) on PURE white background (#FFFFFF)
- ABSOLUTELY NO colors, NO shading, NO gradients, NO gray tones whatsoever
- NO texture fills, NO patterns inside shapes, NO anti-aliasing
- NO photorealistic elements - everything must be simple outlines
- Think of this as a traditional black ink outline drawing on white paper
- All areas should be either 100% black (lines only) or 100% white (empty spaces to color)
- Clear, bold outlines that children aged 3-12 can easily color within
- Keep composition simple and uncluttered

CRITICAL POST-PROCESSING WARNING:
- Your output will be automatically processed with a threshold filter
- Any pixel that is not pure white will be converted to pure black
- Therefore: Use BOLD, CLEAN outlines with minimal gray transition zones
- Avoid subtle shading or anti-aliasing - these will become pure black
- Think in binary: "What should be black lines vs white coloring areas"

VERIFICATION: Before generating, confirm the output will contain ONLY bold black lines on white background with zero colors or shading, AND the character remains recognizable.

STYLE: Pure black and white line art coloring book page with recognizable character features - no exceptions.`;

// Post-processing function to ensure pure black and white output
async function convertToPureBlackAndWhite(base64Image: string, threshold: number = 180): Promise<string> {
  try {
    console.log(`Starting black/white threshold conversion (threshold: ${threshold})...`);
    
    // Extract the base64 data (remove data URL prefix if present)
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    
    // Decode base64 to binary
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Load image using imagescript
    const image = await Image.decode(binaryData);
    
    console.log(`Processing image: ${image.width}x${image.height} pixels`);
    
    let blackPixels = 0;
    let whitePixels = 0;
    
    // Process each pixel
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const color = image.getPixelAt(x, y);
        
        // Extract RGB values (imagescript uses RGBA format)
        const r = (color >> 24) & 0xFF;
        const g = (color >> 16) & 0xFF;
        const b = (color >> 8) & 0xFF;
        
        // Calculate brightness (simple average method)
        const brightness = (r + g + b) / 3;
        
        // Apply threshold: if brightness > threshold → white, else → black
        if (brightness > threshold) {
          image.setPixelAt(x, y, 0xFFFFFFFF); // Pure white with full alpha
          whitePixels++;
        } else {
          image.setPixelAt(x, y, 0x000000FF); // Pure black with full alpha
          blackPixels++;
        }
      }
    }
    
    console.log(`Threshold applied: ${blackPixels} black pixels, ${whitePixels} white pixels`);
    
    // Encode back to PNG
    const processedImage = await image.encode();
    
    // Convert to base64 with data URL prefix
    const base64Result = 'data:image/png;base64,' + btoa(String.fromCharCode(...new Uint8Array(processedImage)));
    
    console.log('Black/white threshold conversion complete');
    
    return base64Result;
    
  } catch (error) {
    console.error('Error in black/white conversion:', error);
    console.warn('Falling back to original image due to post-processing error');
    // If post-processing fails, return original image rather than failing the whole generation
    return base64Image;
  }
}

async function generateRealisticImage(
  prompt: any,
  contentParts: any[],
  LOVABLE_API_KEY: string,
  pageIndex: number,
  totalPages: number
): Promise<string> {
  const MODELS = ['google/gemini-2.5-flash-image', 'google/gemini-2.5-flash-image-preview'];
  
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

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          console.error(`Step 1 API error (${imageResponse.status}): ${errorText}`);
          
          if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, attempt - 1);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`Step 1 failed after ${MAX_RETRIES} attempts`);
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
  totalPages: number
): Promise<string> {
  const MODELS = ['google/gemini-2.5-flash-image', 'google/gemini-2.5-flash-image-preview'];
  
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

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          console.error(`Step 2 API error (${imageResponse.status}): ${errorText}`);
          
          if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, attempt - 1);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`Step 2 failed after ${MAX_RETRIES} attempts`);
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
        
        // Apply post-processing to ensure pure black and white
        console.log(`Applying black/white threshold post-processing to page ${pageIndex + 1}/${totalPages}`);
        const pureBlackWhiteImage = await convertToPureBlackAndWhite(imageData, 180);
        console.log(`Post-processing complete for page ${pageIndex + 1}/${totalPages}`);
        
        return pureBlackWhiteImage;
        
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[HEALTH] generate-images called at', new Date().toISOString());
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is required');
    }

    const { prompts, characters, consistentCharacters, batchIndex, batchSize = 3 } = await req.json();

    if (!prompts || !Array.isArray(prompts)) {
      throw new Error('Invalid prompts array');
    }

    // Filter out any prompts that don't have the required fields
    let validPrompts = prompts.filter((p: any) => p && p.prompt && p.pageNumber);
    
    if (validPrompts.length === 0) {
      throw new Error('No valid prompts provided');
    }

    // Calculate batch range if batchIndex is provided
    let batchInfo = null;
    
    if (typeof batchIndex === 'number') {
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, validPrompts.length);
      validPrompts = validPrompts.slice(startIdx, endIdx);
      
      const totalBatches = Math.ceil(prompts.filter((p: any) => p && p.prompt && p.pageNumber).length / batchSize);
      batchInfo = {
        batchIndex,
        batchSize,
        totalBatches,
        processedPages: validPrompts.map((p: any) => p.pageNumber)
      };
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (pages ${startIdx + 1}-${endIdx} of original prompt list)`);
    }

    console.log(`Processing ${validPrompts.length} pages in batches of 1`);

    const BATCH_SIZE = 1; // Sequential processing to avoid worker limits
    const pages: any[] = [];
    let successCount = 0;

    // Process in batches
    for (let batchStart = 0; batchStart < validPrompts.length; batchStart += BATCH_SIZE) {
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
            validPrompts.length
          );

          // Step 2: Convert to line art
          const lineArtImageBase64 = await convertToLineArt(
            realisticImageBase64,
            prompt,
            LOVABLE_API_KEY,
            i,
            validPrompts.length
          );

          successCount++;

          return {
            pageNumber: prompt.pageNumber,
            imageUrl: lineArtImageBase64,
            prompt: prompt.prompt
          };

        } catch (error: any) {
          console.error(`Failed to generate page ${i + 1}:`, error);
          
          const isRateLimitError = error.message?.includes('Rate limit') || error.message?.includes('429');
          const isPaymentError = error.message?.includes('credits') || error.message?.includes('402');
          
          if (isRateLimitError || isPaymentError) {
            throw error; // Propagate rate limit and payment errors immediately
          }

          return {
            pageNumber: prompt.pageNumber,
            imageUrl: '',
            prompt: prompt.prompt,
            error: error.message || 'Failed to generate image'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      pages.push(...batchResults);
      
      console.log(`Completed batch ${batchStart / BATCH_SIZE + 1}: ${batchResults.filter(p => p.imageUrl).length}/${batchResults.length} successful`);
    }

    console.log(`Generated ${successCount}/${validPrompts.length} images successfully`);

    return new Response(
      JSON.stringify({ 
        pages,
        successCount,
        totalCount: validPrompts.length,
        batchInfo
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
