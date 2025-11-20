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
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!googleApiKey) {
      throw new Error('GOOGLE_API_KEY not configured');
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

    // Transform image to Google's native format
    const base64Data = pageImageUrl.replace(/^data:image\/\w+;base64,/, '');
    const mimeType = pageImageUrl.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

    const frontResponse = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': googleApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: frontCoverPrompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              }
            ]
          }],
          generationConfig: {
            responseModalities: ['IMAGE']
          }
        }),
      }
    );

    if (!frontResponse.ok) {
      const errorData = await frontResponse.json();
      const errorMessage = errorData.error?.message || 'Unknown error';
      console.error('Front cover AI error:', errorMessage);
      throw new Error(`Front cover generation failed: ${errorMessage}`);
    }

    const frontData = await frontResponse.json();
    
    // Extract base64 image from Google's response format
    const frontImagePart = frontData.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData
    );
    
    if (!frontImagePart?.inlineData?.data) {
      throw new Error('No front cover generated');
    }
    
    // Convert to data URL
    const frontMimeType = frontImagePart.inlineData.mimeType || 'image/png';
    const frontCover = `data:${frontMimeType};base64,${frontImagePart.inlineData.data}`;

    console.log('Front cover completed');

    // STEP 2: Generate complementary back cover
    console.log('Step 2: Generating back cover...');
    
    const backCoverPrompt = `Create back cover for children's book. Theme: ${interestsText}.
Simple elegant design, complementary colors, matching border style. Space for text (NO actual text). Clean, professional, age-appropriate.`;

    const backCoverResponse = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': googleApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: backCoverPrompt }
            ]
          }],
          generationConfig: {
            responseModalities: ['IMAGE']
          }
        }),
      }
    );

    if (!backCoverResponse.ok) {
      const errorData = await backCoverResponse.json();
      const errorMessage = errorData.error?.message || 'Unknown error';
      console.error('Back cover AI error:', errorMessage);
      throw new Error(`Back cover generation failed: ${errorMessage}`);
    }

    const backCoverData = await backCoverResponse.json();
    
    // Extract base64 image from Google's response format
    const backImagePart = backCoverData.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData
    );
    
    if (!backImagePart?.inlineData?.data) {
      throw new Error('No back cover image generated');
    }
    
    // Convert to data URL
    const backMimeType = backImagePart.inlineData.mimeType || 'image/png';
    const backCover = `data:${backMimeType};base64,${backImagePart.inlineData.data}`;

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
