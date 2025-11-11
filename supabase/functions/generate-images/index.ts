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
    const { prompts, characterPhotos } = await req.json();
    
    if (!prompts || !Array.isArray(prompts) || prompts.length !== 12) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: 12 prompts required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!characterPhotos || !Array.isArray(characterPhotos) || characterPhotos.length < 1) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: at least 1 character photo required' }),
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

    const generatedPages = [];
    
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log(`Generating image ${i + 1}/12: ${prompt.prompt?.substring(0, 50)}...`);
      
      try {
        // Enhanced prompt for coloring book style with character description
        const characterName = prompt.characterName || 'the character';
        const enhancedPrompt = `Create a black and white coloring book page featuring a child named ${characterName}. Scene: ${prompt.prompt}. Style: Simple clean outlines, no shading, no gradients, thick black lines, white background, suitable for children ages 3-8 to color in. The illustration should be friendly, age-appropriate, and easy to color.`;
        
        console.log(`Generating image ${i + 1} with enhanced prompt for ${characterName}`);
        
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
            // Wait a bit and continue
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
        console.log(`API response for page ${i + 1} structure:`, JSON.stringify(imageData).substring(0, 500));
        
        const generatedImage = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (!generatedImage) {
          console.error(`No image in response for page ${i + 1}`);
          console.error('Full API response:', JSON.stringify(imageData));
          console.error('Response keys:', Object.keys(imageData));
          if (imageData.choices?.[0]?.message) {
            console.error('Message structure:', JSON.stringify(imageData.choices[0].message));
          }
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
        
        console.log(`Successfully generated image ${i + 1}/12`);
        
        // Small delay between requests to avoid rate limiting
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
    console.log(`Generated ${successCount}/12 images successfully`);
    
    return new Response(
      JSON.stringify({ 
        pages: generatedPages,
        successCount,
        totalCount: 12
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
