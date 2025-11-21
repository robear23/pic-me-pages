import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

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
  pageImageUrl?: string;
  firstPageImageUrl?: string;
  characters?: Character[];
}

interface CoverResponse {
  frontCover: string;
  backCover: string;
}

// Note: Upscaling removed to prevent CPU timeout errors in edge function
// Client-side PDF generation handles any necessary resolution adjustments

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

    const { characterName, interests, pageImageUrl, firstPageImageUrl, characters }: GenerateCoverRequest = await req.json();
    
    // Use firstPageImageUrl if provided, otherwise pageImageUrl
    const imageUrl = firstPageImageUrl || pageImageUrl;

    console.log('Generating front and back covers for:', characterName, interests);
    console.log('Using page image for cover:', imageUrl);
    
    if (!imageUrl) {
      throw new Error('No page image provided for cover generation');
    }

    const interestsText = interests.slice(0, 3).join(', ');
    
    // OPTIMIZED: Combine coloring + border in ONE call (saves 33% on cover costs)
    console.log('Step 1: Generating front cover (colored + bordered)...');
    
    const frontCoverPrompt = `Transform this coloring page into a vibrant book cover with border and title.

CRITICAL - PRESERVE CHARACTER: Keep the EXACT character appearance from the source image - especially hair color, facial features, skin tone, clothing, and ALL visual details EXACTLY as shown. DO NOT change hair color or any character features.

COLOR: Fill with rich, vibrant colors matching theme: ${interestsText}. Professional, age-appropriate coloring.

BORDER: Add playful decorative border (10-15% width) with theme elements (${interestsText}). Eye-catching, child-friendly design.

CHARACTER NAME: Add the name "${characterName}" in a super stylized, fun, decorative font near the character. Make it prominent, playful, and integrated into the design. Use creative lettering that matches the book's theme.

OUTPUT: High resolution 2588x3375 pixels complete front cover ready for print at 300 DPI.`;

    // Transform image to Google's native format - handle both storage URLs and base64 data URLs
    let base64Data: string;
    let mimeType: string;
    
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      // It's a public storage URL - fetch and convert to base64
      console.log('Fetching image from storage URL:', imageUrl);
      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image from storage: ${imageResponse.status} ${imageResponse.statusText}`);
        }
        
        const arrayBuffer = await imageResponse.arrayBuffer();
        
        // Use Deno's built-in base64 encoding - handles large files efficiently without stack overflow
        base64Data = encode(arrayBuffer);
        mimeType = imageResponse.headers.get('content-type') || 'image/png';
        
        console.log(`Successfully fetched and converted image (${(arrayBuffer.byteLength / 1024).toFixed(2)} KB)`);
        console.log(`Image dimensions: ~${Math.sqrt(arrayBuffer.byteLength / 3).toFixed(0)}px (estimated)`);
      } catch (fetchError) {
        console.error('Error fetching image from storage:', fetchError);
        throw new Error(`Failed to fetch page image for cover generation: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
      }
    } else if (imageUrl.startsWith('data:')) {
      // It's already a base64 data URL
      console.log('Using provided base64 data URL');
      base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
      mimeType = imageUrl.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    } else {
      throw new Error('Invalid image URL format - must be either a public URL (http/https) or base64 data URL');
    }

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

    console.log('Front cover generated successfully');

    // STEP 2: Generate complementary back cover
    console.log('Step 2: Generating back cover...');
    
    const backCoverPrompt = `Create a BLANK back cover for children's book printing.
High resolution 2588x3375 pixels at 300 DPI. Simple solid color background (soft pastel matching theme: ${interestsText}).
Minimal or no decorative elements. Clean, professional, ready for text overlay if needed.`;

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
