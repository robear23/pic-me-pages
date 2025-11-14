import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 2;
const BASE_DELAY = 1000;

async function generateImageWithRetry(
  prompt: any,
  contentParts: any[],
  LOVABLE_API_KEY: string,
  pageIndex: number,
  totalPages: number
): Promise<any> {
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Generating image ${pageIndex + 1}/${totalPages} (attempt ${attempt}/${MAX_RETRIES})`);
      
      const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
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
        const delay = BASE_DELAY * Math.pow(2, attempt - 1);
        console.log(`Rate limited on page ${pageIndex + 1}, waiting ${delay}ms before retry ${attempt}/${MAX_RETRIES}`);
        
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          throw new Error('Rate limit exceeded after all retries');
        }
      }

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text();
        console.error(`HTTP error ${imageResponse.status} for page ${pageIndex + 1} (attempt ${attempt}):`, errorText);
        
        if (attempt < MAX_RETRIES) {
          const delay = 3000;
          console.log(`Retrying page ${pageIndex + 1} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          throw new Error(`Generation failed after ${MAX_RETRIES} attempts: ${errorText}`);
        }
      }

      const imageData = await imageResponse.json();
      const generatedImage = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      
      if (!generatedImage) {
        console.error(`No image in response for page ${pageIndex + 1} (attempt ${attempt})`);
        
        if (attempt < MAX_RETRIES) {
          const delay = 2000;
          console.log(`Retrying page ${pageIndex + 1} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          throw new Error('No image returned after all retries');
        }
      }

      console.log(`Successfully generated image ${pageIndex + 1}/${totalPages} on attempt ${attempt}`);
      return {
        pageNumber: prompt.pageNumber || pageIndex + 1,
        imageUrl: generatedImage,
        prompt: prompt.prompt
      };

    } catch (error) {
      console.error(`Error generating image ${pageIndex + 1} (attempt ${attempt}/${MAX_RETRIES}):`, error);
      
      if (attempt < MAX_RETRIES) {
        const delay = 3000;
        console.log(`Retrying page ${pageIndex + 1} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
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
  
  return {
    pageNumber: prompt.pageNumber || pageIndex + 1,
    imageUrl: '',
    prompt: prompt.prompt,
    error: 'Unexpected error in retry loop'
  };
}

serve(async (req) => {
  console.log(`[HEALTH] generate-images called at ${new Date().toISOString()}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompts, characters, complexity, artStyle, consistentCharacters } = await req.json();
    
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
    
    const complexityStyles = {
      simple: 'Ultra simple thick lines (4-6px). Only 5-8 large basic shapes. Minimal detail. Very easy for young children to color.',
      medium: 'Moderate line weight (2-3px). 10-15 medium shapes. Balanced detail with some texture. Good for elementary age.',
      detailed: 'Fine intricate lines (1-2px). 20+ shapes with patterns and textures. Rich decorative detail. Challenging for older kids.'
    };

    const generatedPages = [];
    
    // Process images in parallel batches of 3 for faster generation
    const BATCH_SIZE = 3;
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
          
          // Art style guide for non-character elements
          const artStyleGuide: Record<string, string> = {
            cartoon: 'Fun, playful cartoon style with exaggerated features',
            realistic: 'Lifelike proportions and natural details',
            minimalist: 'Clean, simple lines with minimal detail',
            whimsical: 'Magical, imaginative style with creative flourishes',
            photorealistic: 'Ultra-realistic photograph quality with natural lighting'
          };
          
          // Build styling instructions based on whether characters have photos
          const stylingInstructions = hasCharacterPhotos
            ? `HYBRID LINE ART STYLING:

CHARACTER RENDERING (${characterNames}):
- Line Art Style: PHOTOREALISTIC DETAIL with exact feature matching
- Study the reference photos with EXTREME PRECISION to capture:
  * EXACT face shape (round, oval, heart-shaped, square, etc.)
  * PRECISE eye shape, size, spacing, and angle (almond, round, hooded, etc.)
  * SPECIFIC nose shape (button, straight, wide, narrow, etc.)
  * EXACT mouth shape and lip proportions
  * ACCURATE facial proportions (distance between eyes, nose to mouth, etc.)
  * DISTINCTIVE facial features (dimples, freckles, birthmarks, eyebrow shape, etc.)
  * PRECISE hair texture, style, part, and volume
  * EXACT age appearance (toddler, young child, older child features)
  * SPECIFIC body type and proportions for their age
  * Any unique identifying characteristics (glasses style, smile characteristics, etc.)
- Render as HIGHLY DETAILED LINE ART with maximum precision
- This should look like a line art TRACING of the actual photograph
- Capture EVERY distinctive feature that makes this person recognizable
- Use fine, precise lines to capture subtle facial details
- Generate NEW dynamic poses, expressions, and angles that fit each scene
- Maintain the EXACT SAME PERSON across all pages - same face structure, features, proportions
- The character should be immediately recognizable as the person in the reference photos
- DO NOT simplify or stylize the character - capture photorealistic accuracy
- DO NOT apply ${artStyle} styling to the character - maintain photorealistic detail
- Character line work should be detailed but still suitable for coloring

BACKGROUND/SCENE/ENVIRONMENT:
- Line Art Style: ${artStyle.toUpperCase()}
- Apply ${artStyle} characteristics to: setting, scenery, props, objects, animals, vehicles
- Background elements follow ${artStyle} artistic conventions
- Clear visual distinction: realistic character proportions vs. styled background elements

CRITICAL REQUIREMENTS:
- ALL elements must be black and white LINE ART suitable for coloring
- NO photorealistic rendering, NO shading, NO gradients anywhere
- Character maintains realistic proportions and recognizable features from reference
- Background follows ${artStyle} artistic style
- Character naturally interacts with environment
- Each page shows the character in different pose/expression but always recognizable`
            : `UNIFORM STYLING:
- Art Style: ${artStyle} (apply to entire image)
- ${artStyleGuide[artStyle] || 'Consistent artistic style throughout'}`;

          const enhancedPrompt = `Create a black and white coloring book page.

CHARACTERS: ${characterNames}
${hasCharacterPhotos 
  ? `CRITICAL - PHOTOREALISTIC CHARACTER REFERENCE:
The reference photos below show the REAL PERSON you must draw. This is NOT a generic character.

STUDY THESE PHOTOS CAREFULLY:
1. Examine EVERY facial feature in detail - eyes, nose, mouth, face shape, proportions
2. Note UNIQUE identifying features - dimples, freckles, smile, eyebrow shape, etc.
3. Memorize the EXACT appearance of this specific person
4. Create a detailed mental model of their face structure and features

RENDERING REQUIREMENTS:
- Draw THIS EXACT PERSON with maximum photorealistic accuracy
- Capture their distinctive features precisely - not a generic interpretation
- The character should be immediately recognizable as the person in the photos
- Generate NEW poses/expressions for this scene, but SAME PERSON
- Use detailed line work to capture the subtle features that make them unique
- This is a line art portrait of a real person, not a stylized cartoon`
  : ''
}
SCENE: ${prompt.prompt}

STYLE REQUIREMENTS:
- Complexity: ${complexity} - ${complexityStyles[complexity as keyof typeof complexityStyles] || complexityStyles.medium}
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
- Age-appropriate and friendly
- ${complexity === 'simple' ? 'Very thick lines, very simple shapes' : ''}
${complexity === 'medium' ? 'Medium lines, moderate detail' : ''}
${complexity === 'detailed' ? 'Fine lines, intricate patterns' : ''}`;
          
          const contentParts: any[] = [
            {
              type: 'text',
              text: enhancedPrompt
            }
          ];
          
          if (consistentCharacters && characters.length > 0) {
            for (const character of characters) {
              if (character.photos && character.photos.length > 0) {
                contentParts.push({
                  type: 'image_url',
                  image_url: {
                    url: character.photos[0]
                  }
                });
              }
            }
            
            if (contentParts.length > 1) {
              console.log(`Added ${contentParts.length - 1} character reference photo(s) for page ${i + 1}`);
            }
          }
          
          const result = await generateImageWithRetry(
            prompt,
            contentParts,
            LOVABLE_API_KEY,
            i,
            prompts.length
          );
          
          return result;
          
        } catch (error) {
          console.error(`Error processing page ${i + 1}:`, error);
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
