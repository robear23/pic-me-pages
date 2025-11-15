import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 2;
const BASE_DELAY = 1000;
const ENABLE_LIKENESS_ENHANCEMENT = false; // Disabled: refinement doubles content filter risk with child photos

// System message with family-friendly, safety-compliant rules for coloring book generation
const SYSTEM_MESSAGE = `You are creating pages for a children's coloring book - a fun, safe, educational activity.

TASK: Generate black-and-white line art coloring pages suitable for children.

SAFETY & CONTEXT:
- This is a family-friendly coloring book for kids and parents
- Character photos are provided by parents to personalize their child's coloring book
- The goal is character consistency across pages (same character in different adventures)
- Focus on fun, age-appropriate scenes with recognizable characters

CRITICAL RULES:
1. CHARACTER CONSISTENCY: When reference photos are provided, the character should look like the same person across all pages
2. LINE ART ONLY: Pure black lines on white background - NO shading, NO gradients, NO gray tones
3. COLORING-READY: Clear outlines suitable for children to color in
4. AGE-APPROPRIATE: All content must be suitable for children

CHARACTER CONSISTENCY - This is a coloring book character that should look like the same person across all pages:
- Study the reference photo to understand: overall face shape, hairstyle, age appearance, and any distinctive features (glasses, smile, dimples)
- Capture the character's recognizable appearance and personality
- Keep consistent features: same hair, same face shape, same age, same smile
- Generate age-appropriate poses and expressions for each scene
- This is a friendly coloring book character, not a photographic reproduction
- Line art should be clear, simple enough for coloring, but distinctive
- Focus on character personality and recognizability, not photographic precision

PRIORITY ORDER:
1. Character consistency and recognizability
2. Correct pose/expression for the scene
3. Background style adherence

FORBIDDEN:
- DO NOT add shading or gradients anywhere
- DO NOT make content that isn't appropriate for children`;

async function generateImageWithRetry(
  prompt: any,
  contentParts: any[],
  LOVABLE_API_KEY: string,
  pageIndex: number,
  totalPages: number,
  systemMessage: string = SYSTEM_MESSAGE
): Promise<any> {
  const MODELS = ['google/gemini-2.5-flash-image', 'google/gemini-2.5-flash-image-preview'];
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const model of MODELS) {
      try {
        console.log(`Generating image ${pageIndex + 1}/${totalPages} (attempt ${attempt}/${MAX_RETRIES}, model: ${model})`);
        
        // Merge system message with first text content (no system role for image generation)
        const firstTextIndex = contentParts.findIndex((part: any) => part.type === 'text');
        const mergedContent = [...contentParts];
        
        if (firstTextIndex >= 0) {
          mergedContent[firstTextIndex] = {
            type: 'text',
            text: systemMessage + '\n\n' + contentParts[firstTextIndex].text
          };
        } else {
          mergedContent.unshift({ type: 'text', text: systemMessage });
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
          const delay = BASE_DELAY * Math.pow(2, attempt - 1);
          console.log(`Rate limited on page ${pageIndex + 1} (model: ${model}), waiting ${delay}ms before retry ${attempt}/${MAX_RETRIES}`);
          
          if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, delay));
            break; // Break model loop to retry with first model
          } else {
            throw new Error('Rate limit exceeded after all retries');
          }
        }

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          console.error(`HTTP error ${imageResponse.status} for page ${pageIndex + 1} (model: ${model}, attempt ${attempt}):`, errorText);
          
          if (attempt < MAX_RETRIES || model !== MODELS[MODELS.length - 1]) {
            const delay = 3000;
            console.log(`Retrying page ${pageIndex + 1} with ${model === MODELS[MODELS.length - 1] ? 'next attempt' : 'next model'}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Try next model
          } else {
            throw new Error(`Generation failed after ${MAX_RETRIES} attempts: ${errorText}`);
          }
        }

        const imageData = await imageResponse.json();
        const generatedImage = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (!generatedImage) {
          console.error(`No image in response for page ${pageIndex + 1} (model: ${model}, attempt ${attempt})`);
          console.error('Response payload snippet:', JSON.stringify(imageData).slice(0, 1000));
          
          if (attempt < MAX_RETRIES || model !== MODELS[MODELS.length - 1]) {
            const delay = 2000;
            console.log(`Retrying page ${pageIndex + 1} with ${model === MODELS[MODELS.length - 1] ? 'next attempt' : 'next model'}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Try next model
          } else {
            throw new Error('No image returned after all retries');
          }
        }

        console.log(`Successfully generated image ${pageIndex + 1}/${totalPages} on attempt ${attempt} with model ${model}`);
        return {
          pageNumber: prompt.pageNumber || pageIndex + 1,
          imageUrl: generatedImage,
          prompt: prompt.prompt
        };

      } catch (error) {
        console.error(`Error generating image ${pageIndex + 1} (model: ${model}, attempt ${attempt}/${MAX_RETRIES}):`, error);
        
        // If not last model or not last attempt, continue
        if (model !== MODELS[MODELS.length - 1]) {
          continue; // Try next model
        }
        
        if (attempt < MAX_RETRIES) {
          const delay = 3000;
          console.log(`Retrying page ${pageIndex + 1} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          break; // Break model loop to retry with first model
        } else {
          return {
            pageNumber: prompt.pageNumber || pageIndex + 1,
            imageUrl: '',
            prompt: prompt.prompt,
            error: error instanceof Error ? error.message : 'Generation failed after retries'
          };
        }
      }
    }
  }
  
  return {
    pageNumber: prompt.pageNumber || pageIndex + 1,
    imageUrl: '',
    prompt: prompt.prompt,
    error: 'Unexpected error in retry loop'
  };
}

// Two-pass refinement: edit the generated image to enhance facial likeness
async function refineImageWithRetry(
  baseImageUrl: string,
  referencePhotos: string[],
  LOVABLE_API_KEY: string,
  pageIndex: number,
  totalPages: number
): Promise<string | null> {
  const MODELS = ['google/gemini-2.5-flash-image', 'google/gemini-2.5-flash-image-preview'];
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const model of MODELS) {
      try {
        console.log(`Refining likeness for page ${pageIndex + 1}/${totalPages} using ${referencePhotos.length} reference photo(s) (attempt ${attempt}/${MAX_RETRIES}, model: ${model})`);
        
        const refinementInstruction = `Refine ONLY the character's facial features to EXACTLY match these reference photos. 

CRITICAL INSTRUCTIONS:
- Study the reference photos with EXTREME PRECISION
- Adjust the character's face to capture EXACT photorealistic likeness
- DO NOT change the pose, composition, scene, or background
- DO NOT change body position or clothing
- ONLY refine facial features: eyes, nose, mouth, face shape, hair, proportions
- Keep pure black-and-white line art - NO shading, NO gradients
- Make the face look like a detailed line drawing of the ACTUAL person in the photos
- Character should be immediately recognizable as the person from the references

Focus ONLY on enhancing facial feature accuracy and identity match.`;

        // Merge system message with refinement instruction
        const mergedText = SYSTEM_MESSAGE + '\n\n' + refinementInstruction;

        const contentParts: any[] = [
          { type: 'text', text: mergedText },
          { type: 'image_url', image_url: { url: baseImageUrl } }
        ];
        
        // Add all reference photos
        for (const photoUrl of referencePhotos) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: photoUrl }
          });
        }
        
        const refineResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'user', content: contentParts }
            ],
            modalities: ['image', 'text']
          }),
        });

        if (refineResponse.status === 429) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1);
          console.log(`Rate limited during refinement on page ${pageIndex + 1} (model: ${model}), waiting ${delay}ms`);
          
          if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, delay));
            break; // Break model loop to retry with first model
          } else {
            console.log(`Skipping refinement for page ${pageIndex + 1} due to rate limit`);
            return null;
          }
        }

        if (!refineResponse.ok) {
          const errorText = await refineResponse.text();
          console.error(`Refinement HTTP error ${refineResponse.status} for page ${pageIndex + 1} (model: ${model}):`, errorText);
          
          if (attempt < MAX_RETRIES || model !== MODELS[MODELS.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue; // Try next model
          } else {
            console.log(`Skipping refinement for page ${pageIndex + 1} after ${MAX_RETRIES} attempts`);
            return null;
          }
        }

        const refineData = await refineResponse.json();
        const refinedImage = refineData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (!refinedImage) {
          console.error(`No refined image for page ${pageIndex + 1} (model: ${model}, attempt ${attempt})`);
          console.error('Refinement response payload snippet:', JSON.stringify(refineData).slice(0, 1000));
          
          if (attempt < MAX_RETRIES || model !== MODELS[MODELS.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue; // Try next model
          } else {
            console.log(`Skipping refinement for page ${pageIndex + 1} - no image returned`);
            return null;
          }
        }

        console.log(`Successfully refined likeness for page ${pageIndex + 1}/${totalPages} with model ${model}`);
        return refinedImage;

      } catch (error) {
        console.error(`Error refining page ${pageIndex + 1} (model: ${model}, attempt ${attempt}/${MAX_RETRIES}):`, error);
        
        // If not last model, try next
        if (model !== MODELS[MODELS.length - 1]) {
          continue;
        }
        
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          break; // Break model loop to retry with first model
        } else {
          console.log(`Skipping refinement for page ${pageIndex + 1} after error`);
          return null;
        }
      }
    }
  }
  
  return null;
}

serve(async (req) => {
  console.log(`[HEALTH] generate-images called at ${new Date().toISOString()}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompts, characters, consistentCharacters } = await req.json();
    
    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: prompts array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: at least 1 character required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build character descriptions with photo reference notes
    let characterNames = '';
    if (consistentCharacters && characters && characters.length > 0) {
      const characterDescriptions = characters
        .filter((c: any) => c.name && c.name.trim())
        .map((character: any) => {
          const photoNote = character.photos && character.photos.length > 0
            ? ` (Reference photos provided: Study these images to learn the character's unique facial features, hair style, approximate age, and overall appearance. Generate this character in new poses and expressions that fit each scene.)`
            : '';
          return `${character.name}${photoNote}`;
        });
      
      if (characterDescriptions.length > 0) {
        characterNames = characterDescriptions.join(' and ');
      }
    }
    
    if (!characterNames) {
      characterNames = characters.map((c: any) => c.name).join(' and ');
    }
    
    const generatedPages = [];
    let contentFilterCount = 0; // Track content filter blocks
    
    // Process images sequentially to avoid worker limits
    const BATCH_SIZE = 1;
    console.log(`Processing ${prompts.length} pages in batches of ${BATCH_SIZE}`);
    
    for (let batchStart = 0; batchStart < prompts.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, prompts.length);
      const batch = prompts.slice(batchStart, batchEnd);
      
      console.log(`Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: pages ${batchStart + 1}-${batchEnd}`);
      
      const batchPromises = batch.map(async (prompt, batchIndex) => {
        const i = batchStart + batchIndex;
        console.log(`Processing page ${i + 1}/${prompts.length}: ${prompt.prompt?.substring(0, 50)}...`);
        
        try {
          const hasCharacterPhotos = consistentCharacters && characters.some((c: any) => c.photos && c.photos.length > 0);
          
          // Build photogenic styling instructions
          const stylingInstructions = hasCharacterPhotos
            ? `PHOTOGENIC ILLUSTRATED STYLE - CHARACTER CONSISTENCY:

CHARACTER RENDERING (${characterNames}):
- Photogenic illustrated portrait style with soft, natural lighting
- This is a coloring book character that should be recognizable across all pages
- Study the reference photo to understand the character's overall appearance
- Capture key features: face shape, hairstyle, age, smile, any glasses or distinctive features
- Keep the same character consistent: same hair, same face proportions, same age appearance
- Generate age-appropriate poses and expressions that fit each scene
- Line art should be clear and suitable for children to color
- Focus on making the character recognizable and friendly, not photographic
- The character should feel like the same person across all pages in the book

SCENE & COMPOSITION:
- Photogenic illustrated style: soft lighting, flattering angles, gentle depth
- Simple, uncluttered background that complements the character
- Pleasant colors and natural tones (for reference, will be converted to line art)
- Clean composition with the character as the focal point
- Fun, engaging scenes appropriate for children

COLORING BOOK REQUIREMENTS:
- ALL elements must be black and white LINE ART suitable for coloring
- NO shading, NO gradients, NO gray tones (pure line art)
- Character: Clear, recognizable, consistent across pages with photogenic qualities
- Character: Age-appropriate and friendly appearance
- Background: Photogenic illustrated style with soft, pleasant composition
- Overall: Fun, safe, child-friendly content`
            : `PHOTOGENIC ILLUSTRATED STYLE - UNIFORM:

RENDERING STYLE:
- Photogenic illustrated portrait style throughout
- Soft, natural lighting and flattering angles
- Simple, pleasant composition with gentle depth
- Clean, uncluttered backgrounds
- Natural tones and pleasing color palette (for reference, converted to line art)

COLORING BOOK REQUIREMENTS:
- ALL elements must be black and white LINE ART suitable for coloring
- NO shading, NO gradients, NO gray tones
- Consistent photogenic illustrated style throughout
- Age-appropriate and family-friendly content`;

          const enhancedPrompt = `Create a black and white coloring book page for children.

This is a personalized coloring book where the character should be recognizable across all pages.

PRIORITY ORDER (MOST TO LEAST IMPORTANT):
1. CHARACTER CONSISTENCY - Same recognizable character across pages
2. CORRECT POSE/EXPRESSION - Match the scene requirements
3. BACKGROUND STYLE - Follow chosen art style for environment

CHARACTERS: ${characterNames}
${hasCharacterPhotos 
  ? `CHARACTER REFERENCE PROVIDED:
The reference photo shows the character that should appear in this coloring book.
Study it to understand the character's appearance and keep them consistent across pages:
1. Examine EVERY facial feature in microscopic detail - eyes (shape, size, spacing, angle), nose (bridge, tip, nostrils), mouth (lip shape, width), face shape (jawline, cheekbones), proportions (eye spacing, forehead height, chin length)
2. Note EVERY UNIQUE identifying feature - dimples, freckles, birthmarks, smile characteristics, eyebrow shape/thickness, ear shape/position, hair part/texture/volume
3. Memorize the EXACT appearance - not an approximation, the ACTUAL person
4. Build a detailed mental model of their SPECIFIC face structure and distinctive features
5. This person should be IMMEDIATELY RECOGNIZABLE from the line art alone

RENDERING REQUIREMENTS (TOP PRIORITY):
- Draw THIS EXACT SPECIFIC PERSON with MAXIMUM photorealistic accuracy
- Capture their distinctive features with PRECISION - not a generic interpretation
- Use FINE, DETAILED lines to show subtle facial features that make them unique
- The character MUST be immediately recognizable as the person in the photos
- Generate NEW poses/expressions for this scene, but ALWAYS THE SAME IDENTIFIABLE PERSON
- This is a line art PORTRAIT of a REAL person - treat it like a detailed sketch/tracing
- DO NOT simplify, stylize, or cartoonize - maintain photorealistic facial detail`
  : ''
}
SCENE: ${prompt.prompt}

STYLE REQUIREMENTS:
${stylingInstructions}
${consistentCharacters 
  ? `- CRITICAL: Maintain character identity and recognizability across all pages
- Keep core features consistent (face shape, hair, approximate age, body type)
- Vary poses, expressions, and angles to fit each scene naturally`
  : ''
}
- Black and white line art ONLY
- NO shading, NO gradients, NO gray tones
- Pure white background
- Clear outlines suitable for children to color
- Age-appropriate and friendly`;
          
          const contentParts: any[] = [
            {
              type: 'text',
              text: enhancedPrompt
            }
          ];
          
          // Collect reference photos (use only 1 photo to avoid triggering content filters)
          const allReferencePhotos: string[] = [];
          if (consistentCharacters && characters.length > 0) {
            for (const character of characters) {
              if (character.photos && character.photos.length > 0) {
                // Use only first photo to reduce content filter risk
                contentParts.push({
                  type: 'image_url',
                  image_url: { url: character.photos[0] }
                });
                allReferencePhotos.push(character.photos[0]);
              }
            }
            
            if (allReferencePhotos.length > 0) {
              console.log(`Added ${allReferencePhotos.length} character reference photo(s) for page ${i + 1}`);
            }
          }
          
          // Generate initial image
          let result = await generateImageWithRetry(
            prompt,
            contentParts,
            LOVABLE_API_KEY,
            i,
            prompts.length,
            SYSTEM_MESSAGE
          );
          
          // Two-pass refinement: if we have references and initial generation succeeded, refine the likeness
          if (ENABLE_LIKENESS_ENHANCEMENT && result.imageUrl && allReferencePhotos.length > 0) {
            const refinedImageUrl = await refineImageWithRetry(
              result.imageUrl,
              allReferencePhotos,
              LOVABLE_API_KEY,
              i,
              prompts.length
            );
            
            // Use refined image if available, otherwise keep original
            if (refinedImageUrl) {
              console.log(`Using refined image for page ${i + 1} (enhanced likeness)`);
              result.imageUrl = refinedImageUrl;
            } else {
              console.log(`Using original image for page ${i + 1} (refinement skipped/failed)`);
            }
          }
          
          return result;
          
        } catch (error) {
          console.error(`Error processing page ${i + 1}:`, error);
          
          // Track content filter blocks
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes('content_filter') || errorMsg.includes('PROHIBITED_CONTENT')) {
            contentFilterCount++;
            console.warn(`Content filter triggered for page ${i + 1}. Total: ${contentFilterCount}/${prompts.length}`);
            
            // If multiple pages are being blocked, stop and provide helpful error
            if (contentFilterCount >= 3) {
              console.error('Multiple content filter blocks detected. Character descriptions may need adjustment.');
              return {
                pageNumber: prompt.pageNumber || i + 1,
                imageUrl: '',
                prompt: prompt.prompt,
                error: 'Content generation blocked by safety filters. Try simplifying character descriptions or removing reference photos.'
              };
            }
          }
          
          return {
            pageNumber: prompt.pageNumber || i + 1,
            imageUrl: '',
            prompt: prompt.prompt,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      generatedPages.push(...batchResults);
      
      console.log(`Completed batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: ${batchResults.filter(r => r.imageUrl).length}/${batchResults.length} successful`);
    }

    const successCount = generatedPages.filter(p => p.imageUrl).length;
    const failedCount = prompts.length - successCount;
    
    console.log(`Generated ${successCount}/${prompts.length} images successfully`);
    if (failedCount > 0) {
      console.error(`${failedCount} page(s) failed after all retry attempts`);
    }
    
    return new Response(
      JSON.stringify({ 
        pages: generatedPages,
        successCount,
        totalCount: prompts.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-images function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
