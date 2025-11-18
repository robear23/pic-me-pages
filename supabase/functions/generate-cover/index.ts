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

interface CoverResponse {
  frontCover: string;
  backCover: string;
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

    console.log('Generating front and back covers for:', characterName, interests);

    const interestsText = interests.slice(0, 3).join(', ');
    const hasPhotos = characters && characters.length > 0 && characters[0].photos && characters[0].photos.length > 0;
    
    // Generate front cover with character photo
    let frontCoverPrompt = '';
    let frontContentParts: any[] = [];
    
    if (hasPhotos && characters && characters[0].photos) {
      // Use character photo for front cover
      const characterPhoto = characters[0].photos[0];
      frontCoverPrompt = `Create a vibrant, colorful children's coloring book front cover design featuring this child.

DESIGN REQUIREMENTS:
- Feature the child prominently in the center or slightly off-center
- Add a decorative, colorful border frame with playful elements related to: ${interestsText}
- Background should be colorful and inviting with gentle patterns or themes related to the interests
- Professional children's book cover aesthetic with bright, appealing colors
- Leave space at top for title text (will be added separately)
- The child should be the clear focal point
- Style: Photo-based collage with decorative illustrated elements around the photo
- DO NOT include any text or words in the image

IMPORTANT: This is a COVER (not line art) - use full color, make it vibrant and eye-catching for retail display.`;

      frontContentParts = [
        { type: 'text', text: frontCoverPrompt },
        { type: 'image_url', image_url: { url: characterPhoto } }
      ];
    } else {
      // Create illustrated front cover without photo
      frontCoverPrompt = `Create a vibrant, colorful children's coloring book front cover design for "${characterName}'s Coloring Book".

DESIGN REQUIREMENTS:
- Feature decorative elements and playful imagery related to: ${interestsText}
- Colorful decorative border frame
- Central illustration area with inviting, child-friendly artwork
- Professional children's book cover aesthetic with bright, appealing colors
- Pleasant, natural composition suitable for ages 3-12
- DO NOT include any text or words in the image

IMPORTANT: This is a COVER (not line art) - use full color, make it vibrant and eye-catching for retail display.`;

      frontContentParts = [{ type: 'text', text: frontCoverPrompt }];
    }

    console.log('Generating front cover...');
    
    const frontCoverResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: frontContentParts
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!frontCoverResponse.ok) {
      const errorText = await frontCoverResponse.text();
      console.error('Front cover AI error:', errorText);
      throw new Error(`Front cover generation failed: ${errorText}`);
    }

    const frontCoverData = await frontCoverResponse.json();
    const frontCover = frontCoverData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!frontCover) {
      throw new Error('No front cover image generated');
    }

    console.log('Front cover generated, generating back cover...');

    // Generate back cover
    const backCoverPrompt = `Create a simple, clean back cover design for "${characterName}'s Coloring Book".

DESIGN REQUIREMENTS:
- Simple, elegant design with plenty of white/light space
- Decorative border matching the front cover style
- Subtle decorative elements related to: ${interestsText}
- Color scheme should complement the front cover
- Leave clear space in these areas (will be filled with text/barcode later):
  * Top third: for title and subtitle text
  * Bottom right corner: for barcode placement
  * Center area: for book description text
- Professional children's book back cover aesthetic
- DO NOT include any text or words in the image

STYLE: Clean, minimal design with decorative accents - this is background artwork for text overlay.`;

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
