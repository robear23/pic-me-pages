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
  console.log(`[HEALTH] generate-cover called at ${new Date().toISOString()}`);
  
  if (req.method === 'OPTIONS') {
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
    
    // STEP 1: Color in the black & white coloring page
    console.log('Step 1: Coloring the page...');
    
    const colorPrompt = `Take this black and white coloring page line art and fill it in with vibrant, professional colors.

COLORING REQUIREMENTS:
- Fill in all areas with beautiful, rich colors
- Use colors that complement the theme of: ${interestsText}
- Make it look professionally colored - vibrant but not garish
- Keep the line art visible and crisp
- Use color harmony and good contrast
- Age-appropriate color choices for children aged 3-12
- Maintain all details from the original line art

IMPORTANT: This should look like a beautifully completed coloring page, ready for a book cover.`;

    const colorResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              { type: 'text', text: colorPrompt },
              { type: 'image_url', image_url: { url: pageImageUrl } }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!colorResponse.ok) {
      const errorText = await colorResponse.text();
      console.error('Color step AI error:', errorText);
      throw new Error(`Coloring failed: ${errorText}`);
    }

    const colorData = await colorResponse.json();
    const coloredImage = colorData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!coloredImage) {
      throw new Error('No colored image generated');
    }

    console.log('Colored image generated, adding border...');

    // STEP 2: Add decorative border around the colored image
    const borderPrompt = `Add a decorative, colorful border frame around this image.

BORDER REQUIREMENTS:
- Vibrant, playful border with elements related to: ${interestsText}
- Border should complement the colors in the image
- Professional children's book cover aesthetic
- Border should frame the image nicely without overwhelming it
- Include whimsical, interest-related decorative elements
- Eye-catching and suitable for retail display
- NO text, words, or blank spaces for text
- Border should be approximately 10-15% of the total image width on each side

STYLE: Fun, colorful, child-friendly border that makes this perfect for a book cover.`;

    const borderResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              { type: 'text', text: borderPrompt },
              { type: 'image_url', image_url: { url: coloredImage } }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!borderResponse.ok) {
      const errorText = await borderResponse.text();
      console.error('Border step AI error:', errorText);
      throw new Error(`Border generation failed: ${errorText}`);
    }

    const borderData = await borderResponse.json();
    const frontCover = borderData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!frontCover) {
      throw new Error('No front cover image generated');
    }

    console.log('Front cover generated, generating back cover...');

    // Generate back cover with simple decorative pattern
    const backCoverPrompt = `Create a simple, clean back cover design with a decorative border.

DESIGN REQUIREMENTS:
- Simple decorative border frame matching the style of the front cover
- Subtle patterns or elements related to: ${interestsText}
- Plenty of white/light space in the center for text
- Color scheme should complement the front cover colors
- Professional children's book back cover aesthetic
- Leave clear space for text and barcode
- NO text or words in the image

STYLE: Clean, minimal design with decorative border - background artwork for text overlay.`;

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
