import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      console.log(`Generating image ${i + 1}/${prompts.length}: ${prompt.prompt?.substring(0, 50)}...`);
      
      try {
        const enhancedPrompt = `Create a black and white coloring book page.

CHARACTERS: ${characterNames}
SCENE: ${prompt.prompt}

STYLE REQUIREMENTS:
- Complexity: ${complexity} - ${complexityStyles[complexity as keyof typeof complexityStyles] || complexityStyles.medium}
- Art Style: ${artStyle}
${consistentCharacters ? '- CRITICAL: Keep character appearance EXACTLY consistent with previous pages (same face, hair, clothing, proportions)' : ''}
- Black and white line art ONLY
- NO shading, NO gradients, NO gray tones
- Pure white background
- Clear outlines suitable for children to color
- Age-appropriate and friendly
- ${complexity === 'simple' ? 'Very thick lines, very simple shapes' : ''}
${complexity === 'medium' ? 'Medium lines, moderate detail' : ''}
${complexity === 'detailed' ? 'Fine lines, intricate patterns' : ''}`;
        
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
                content: enhancedPrompt
              }
            ],
            modalities: ['image', 'text']
          }),
        });

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          console.error(`Image generation error for page ${i + 1}:`, imageResponse.status, errorText);
          
          if (imageResponse.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            generatedPages.push({
              pageNumber: prompt.pageNumber || i + 1,
              imageUrl: '',
              prompt: prompt.prompt,
              error: 'Rate limit - will retry'
            });
            continue;
          }
          
          generatedPages.push({
            pageNumber: prompt.pageNumber || i + 1,
            imageUrl: '',
            prompt: prompt.prompt,
            error: 'Generation failed'
          });
          continue;
        }

        const imageData = await imageResponse.json();
        const generatedImage = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (!generatedImage) {
          console.error(`No image in response for page ${i + 1}`);
          generatedPages.push({
            pageNumber: prompt.pageNumber || i + 1,
            imageUrl: '',
            prompt: prompt.prompt,
            error: 'No image returned'
          });
          continue;
        }

        generatedPages.push({
          pageNumber: prompt.pageNumber || i + 1,
          imageUrl: generatedImage,
          prompt: prompt.prompt
        });
        
        console.log(`Successfully generated image ${i + 1}/${prompts.length}`);
        
        // Delay between requests
        if (i < prompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`Error generating image ${i + 1}:`, error);
        generatedPages.push({
          pageNumber: prompt.pageNumber || i + 1,
          imageUrl: '',
          prompt: prompt.prompt,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = generatedPages.filter(p => p.imageUrl).length;
    console.log(`Generated ${successCount}/${prompts.length} images successfully`);
    
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
