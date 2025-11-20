import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { decode } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

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

// Upscale image to print-quality resolution with progressive fallback
// Default to 200 DPI (Lulu's minimum) to prevent memory errors
async function upscaleToHighResWithFallback(
  base64Image: string,
  widthInches: number,
  heightInches: number
): Promise<string> {
  // Try progressively lower DPI levels if memory errors occur
  const dpiLevels = [200, 150]; // Start at 200 DPI (Lulu minimum)
  
  for (let i = 0; i < dpiLevels.length; i++) {
    const targetDPI = dpiLevels[i];
    try {
      console.log(`[UPSCALE] Attempting upscale to ${targetDPI} DPI...`);
      
      // Decode base64
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      // Load image
      const image = await decode(imageBuffer);
      const originalDPI = Math.round(image.width / widthInches);
      
      console.log(`[COVER QUALITY]`);
      console.log(`  Original: ${image.width}x${image.height} (~${originalDPI} DPI)`);
      console.log(`  Required by Lulu: minimum 200 DPI`);
      console.log(`  Target: ${targetDPI} DPI`);
      
      // Skip upscaling if already high enough resolution
      if (originalDPI >= 200) {
        console.log(`✓ Image already meets quality requirements (${originalDPI} DPI), skipping upscale`);
        return base64Image;
      }
      
      if (originalDPI < 100) {
        console.warn(`⚠️ AI generated low resolution image (${originalDPI} DPI) - upscaling to ${targetDPI} DPI`);
      }
      
      // Calculate target dimensions
      const targetWidth = Math.round(widthInches * targetDPI);
      const targetHeight = Math.round(heightInches * targetDPI);
      
      console.log(`  Upscaling to: ${targetWidth}x${targetHeight}`);
      
      // Resize using high-quality bicubic interpolation (mutates the image)
      image.resize(targetWidth, targetHeight);
      
      // Encode back to PNG
      const pngBuffer = await image.encode();
      const base64Upscaled = btoa(String.fromCharCode(...new Uint8Array(pngBuffer)));
      
      console.log(`✓ Successfully upscaled to ${targetWidth}x${targetHeight} (${targetDPI} DPI)`);
      
      return `data:image/png;base64,${base64Upscaled}`;
      
    } catch (error: any) {
      const isMemoryError = error.message?.includes('memory') || 
                           error.message?.includes('Memory') ||
                           error.name === 'RangeError';
      
      if (isMemoryError && i < dpiLevels.length - 1) {
        console.warn(`⚠️ Memory error at ${targetDPI} DPI, trying lower quality (${dpiLevels[i + 1]} DPI)...`);
        continue;
      }
      
      // If it's the last attempt or not a memory error, throw
      throw error;
    }
  }
  
  throw new Error('Failed to upscale image at any quality level');
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
OUTPUT: High resolution 2000x2666 pixels complete front cover ready for print.`;

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
    const frontCoverOriginal = `data:${frontMimeType};base64,${frontImagePart.inlineData.data}`;

    // UPSCALE to print quality with progressive fallback (200 DPI minimum for Lulu)
    const frontCover = await upscaleToHighResWithFallback(frontCoverOriginal, 8.5, 11.25);

    console.log('Front cover completed and upscaled');

    // STEP 2: Generate complementary back cover
    console.log('Step 2: Generating back cover...');
    
    const backCoverPrompt = `Create high resolution 2000x2666 pixels back cover for children's book. Theme: ${interestsText}.
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
    const backCoverOriginal = `data:${backMimeType};base64,${backImagePart.inlineData.data}`;

    // UPSCALE to print quality with progressive fallback
    const backCover = await upscaleToHighResWithFallback(backCoverOriginal, 8.5, 11.25);

    console.log('Both covers generated and upscaled successfully');

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
