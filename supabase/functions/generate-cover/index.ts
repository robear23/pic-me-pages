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
  pageImageUrl: string;
  characters?: Character[];
}

interface CoverResponse {
  frontCover: string;
  backCover: string;
}

serve(async (req) => {
  console.log(`[${new Date().toISOString()}] generate-cover started - Method: ${req.method}`);
  
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const { characterName, interests, pageImageUrl, characters }: GenerateCoverRequest = await req.json();

    console.log('Generating front and back covers for:', characterName, interests);
    console.log('Using page image for cover:', pageImageUrl);

    const interestsText = interests.slice(0, 3).join(', ');
    
    // OPTIMIZED: Combine coloring + border in ONE call (saves 33% on cover costs)
    console.log('Step 1: Generating front cover (colored + bordered)...');
    
    const frontCoverPrompt = `Transform this coloring page into a vibrant book cover with border.
COLOR: Fill with rich colors matching theme: ${interestsText}. Professional, age-appropriate.
BORDER: Add playful decorative border (10-15% width) with theme elements. Eye-catching, child-friendly. NO text.
OUTPUT: Complete front cover ready for print.`;

    const frontResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: [
              { type: 'text', text: frontCoverPrompt },
              { type: 'image_url', image_url: { url: pageImageUrl } }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!frontResponse.ok) {
      const errorText = await frontResponse.text();
      console.error('Front cover AI error:', errorText);
      throw new Error(`Front cover generation failed: ${errorText}`);
    }

    const frontData = await frontResponse.json();
    const frontCover = frontData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!frontCover) {
      throw new Error('No front cover generated');
    }

    console.log('Front cover completed');

    // STEP 2: Generate complementary back cover
    console.log('Step 2: Generating back cover...');
    
    const backCoverPrompt = `Create back cover for children's book. Theme: ${interestsText}.
Simple elegant design, complementary colors, matching border style. Space for text (NO actual text). Clean, professional, age-appropriate.`;

    const backCoverResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: backCoverPrompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!backCoverResponse.ok) {
      const errorText = await backCoverResponse.text();
      console.error('Back cover AI error:', errorText);
      throw new Error(`Back cover generation failed: ${errorText}`);
    }

    const backCoverData = await backCoverResponse.json();
    const backCover = backCoverData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!backCover) {
      throw new Error('No back cover image generated');
    }

    console.log('Both covers generated successfully');

    return new Response(
      JSON.stringify({ frontCover, backCover }),
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
