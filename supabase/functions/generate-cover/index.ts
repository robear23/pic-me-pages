import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Character {
  name: string;
  photos?: string[];
}

interface GenerateCoverRequest {
  characterName: string;
  interests: string[];
  characters?: Character[];
}

serve(async (req) => {
  console.log(`[HEALTH] generate-cover called at ${new Date().toISOString()}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const { characterName, interests, characters }: GenerateCoverRequest = await req.json();

    console.log('Generating cover for:', characterName, interests);

    // Create a detailed prompt for the cover
    const interestsText = interests.slice(0, 3).join(', ');
    const coverPrompt = `Create a vibrant, child-friendly coloring book cover design for "${characterName}'s Coloring Book". The cover should feature decorative elements and imagery related to: ${interestsText}. Style: Photogenic illustrated style with soft, inviting composition and a colorful decorative border frame. The center should have an attractive illustration suitable for a children's coloring book with pleasant, natural tones and gentle depth. Important: Do not include any text or words in the image - this is purely decorative artwork for the cover background.`;

    console.log('Cover prompt:', coverPrompt);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [
          {
            role: 'user',
            content: coverPrompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', errorText);
      throw new Error(`AI generation failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const coverImage = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!coverImage) {
      throw new Error('No cover image generated');
    }

    console.log('Cover generated successfully');

    return new Response(
      JSON.stringify({ coverImage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error generating cover:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
