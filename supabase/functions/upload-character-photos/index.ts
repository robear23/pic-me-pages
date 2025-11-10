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
    const { photos } = await req.json();
    
    if (!photos || !Array.isArray(photos)) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: photos array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (photos.length < 1 || photos.length > 3) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: 1-3 photos required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const optimizedPhotos = [];
    let totalSize = 0;
    const MAX_SIZE_PER_PHOTO = 5 * 1024 * 1024; // 5MB
    const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      
      if (!photo.base64 || typeof photo.base64 !== 'string') {
        return new Response(
          JSON.stringify({ error: `Invalid photo ${i + 1}: base64 string required` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if it's a valid base64 data URL
      if (!photo.base64.startsWith('data:image/')) {
        return new Response(
          JSON.stringify({ error: `Invalid photo ${i + 1}: must be a valid image data URL` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract image format
      const formatMatch = photo.base64.match(/data:image\/(jpeg|jpg|png|webp);base64,/);
      if (!formatMatch) {
        return new Response(
          JSON.stringify({ error: `Invalid photo ${i + 1}: unsupported format (use JPG, PNG, or WEBP)` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Estimate size (base64 is ~33% larger than binary)
      const base64Data = photo.base64.split(',')[1];
      const estimatedSize = (base64Data.length * 3) / 4;
      
      if (estimatedSize > MAX_SIZE_PER_PHOTO) {
        return new Response(
          JSON.stringify({ error: `Photo ${i + 1} exceeds 5MB limit` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      totalSize += estimatedSize;
      
      if (totalSize > MAX_TOTAL_SIZE) {
        return new Response(
          JSON.stringify({ error: 'Total photo size exceeds 20MB limit' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // For MVP, we'll pass through the base64 directly
      // In production, you might want to resize/compress here
      optimizedPhotos.push(photo.base64);
    }

    console.log(`Validated ${photos.length} photos, total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

    return new Response(
      JSON.stringify({ 
        optimizedPhotos,
        count: optimizedPhotos.length,
        totalSize: Math.round(totalSize)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in upload-character-photos function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
