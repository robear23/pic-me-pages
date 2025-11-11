import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const BASE_DELAY = 2000;

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

    const characterNames = characters.map((c: any) => c.name).join(' and ');
    
    const complexityStyles = {
      simple: 'Ultra simple thick lines (4-6px). Only 5-8 large basic shapes. Minimal detail. Very easy for young children to color.',
      medium: 'Moderate line weight (2-3px). 10-15 medium shapes. Balanced detail with some texture. Good for elementary age.',
      detailed: 'Fine intricate lines (1-2px). 20+ shapes with patterns and textures. Rich decorative detail. Challenging for older kids.'
    };

    const generatedPages = [];
    
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log(`Processing page ${i + 1}/${prompts.length}: ${prompt.prompt?.substring(0, 50)}...`);
      
      try {
        const hasCharacterPhotos = consistentCharacters && characters.some((c: any) => c.photos && c.photos.length > 0);
        
        const enhancedPrompt = `Create a black and white coloring book page.

CHARACTERS: ${characterNames}
${hasCharacterPhotos 
  ? `IMPORTANT: Reference photos of the characters are provided below. Study each character's facial features, hairstyle, clothing style, body proportions, and age carefully. Maintain EXACT consistency with these visual references.`
  : ''
}
SCENE: ${prompt.prompt}

STYLE REQUIREMENTS:
- Complexity: ${complexity} - ${complexityStyles[complexity as keyof typeof complexityStyles] || complexityStyles.medium}
- Art Style: ${artStyle}
${consistentCharacters 
  ? `- CRITICAL: Keep character appearance EXACTLY as shown in reference photos (same face shape, eyes, nose, mouth, hair, clothing, proportions, age)
- DO NOT age up or change the character's appearance in any way
- Match the exact age, features, and styling from the provided photos
- Maintain perfect consistency across all pages`
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
        
        generatedPages.push(result);
        
        if (i < prompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`Error processing page ${i + 1}:`, error);
        generatedPages.push({
          pageNumber: prompt.pageNumber || i + 1,
          imageUrl: '',
          prompt: prompt.prompt,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
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
