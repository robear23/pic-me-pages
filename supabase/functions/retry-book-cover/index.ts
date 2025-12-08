import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log(`[${new Date().toISOString()}] retry-book-cover started - Method: ${req.method}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { bookId } = await req.json();
    
    if (!bookId) {
      throw new Error('bookId is required');
    }

    console.log('Retrying cover generation for book:', bookId);

    // Fetch book data
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .eq('user_id', user.id)
      .single();

    if (bookError || !book) {
      throw new Error('Book not found or unauthorized');
    }

    if (!book.pages || book.pages.length === 0) {
      throw new Error('Cannot generate covers without pages');
    }

    const firstPageImageUrl = book.pages[0]?.imageUrl;
    if (!firstPageImageUrl) {
      throw new Error('First page image not found');
    }

    // Call generate-cover function
    const { data: coverData, error: coverError } = await supabase.functions.invoke('generate-cover', {
      body: {
        characterName: book.character_name,
        interests: book.interests,
        firstPageImageUrl,
      }
    });

    if (coverError) {
      throw new Error(`Cover generation failed: ${coverError.message}`);
    }

    if (!coverData?.frontCover || !coverData?.backCover) {
      throw new Error('Cover generation did not return images');
    }

    // Convert base64 to blobs and upload to storage
    const frontCoverBlob = await fetch(coverData.frontCover).then(r => r.blob());
    const backCoverBlob = await fetch(coverData.backCover).then(r => r.blob());

    const timestamp = Date.now();
    const frontCoverPath = `${user.id}/${timestamp}-cover.png`;
    const backCoverPath = `${user.id}/${timestamp}-back-cover.png`;

    // Upload front cover
    const { error: frontUploadError } = await supabase.storage
      .from('generated-pages')
      .upload(frontCoverPath, frontCoverBlob, {
        contentType: 'image/png',
        upsert: true,
      });

    if (frontUploadError) {
      throw new Error(`Failed to upload front cover: ${frontUploadError.message}`);
    }

    // Upload back cover
    const { error: backUploadError } = await supabase.storage
      .from('generated-pages')
      .upload(backCoverPath, backCoverBlob, {
        contentType: 'image/png',
        upsert: true,
      });

    if (backUploadError) {
      throw new Error(`Failed to upload back cover: ${backUploadError.message}`);
    }

    // Get public URLs
    const { data: { publicUrl: frontCoverUrl } } = supabase.storage
      .from('generated-pages')
      .getPublicUrl(frontCoverPath);

    const { data: { publicUrl: backCoverUrl } } = supabase.storage
      .from('generated-pages')
      .getPublicUrl(backCoverPath);

    // Update book record (increment cover_regeneration_count)
    const { error: updateError } = await supabase
      .from('books')
      .update({
        cover_image_url: frontCoverUrl,
        back_cover_image_url: backCoverUrl,
        missing_covers: false,
        missing_components: [],
        last_cover_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookId);

    if (updateError) {
      throw new Error(`Failed to update book: ${updateError.message}`);
    }

    console.log('✓ Cover regeneration completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        frontCoverUrl,
        backCoverUrl,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in retry-book-cover:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to regenerate cover',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
