import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🎨 Retry Cover: Starting cover regeneration...');
    
    const { bookId } = await req.json();
    
    if (!bookId) {
      return new Response(
        JSON.stringify({ error: 'bookId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch book data
    console.log(`📖 Fetching book ${bookId}...`);
    const { data: book, error: fetchError } = await supabaseClient
      .from('books')
      .select('*')
      .eq('id', bookId)
      .single();

    if (fetchError || !book) {
      console.error('❌ Book fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Book not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we have pages to work with
    const pages = book.pages as any[];
    if (!pages || pages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Book has no pages to generate covers from' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use first page image as reference
    const firstPageUrl = pages[0]?.imageUrl;
    if (!firstPageUrl) {
      return new Response(
        JSON.stringify({ error: 'First page has no image' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare data for cover generation
    const characters = book.character_name ? [{ name: book.character_name }] : [];
    const interests = book.interests || [];

    console.log('🎨 Calling generate-cover function...');
    
    // Call the generate-cover edge function
    const { data: coverData, error: coverError } = await supabaseClient.functions.invoke(
      'generate-cover',
      {
        body: {
          characterName: book.character_name,
          interests,
          pageImageUrl: firstPageUrl,
          characters,
        },
      }
    );

    if (coverError || !coverData) {
      console.error('❌ Cover generation failed:', coverError);
      
      // Update book with last attempt timestamp
      await supabaseClient
        .from('books')
        .update({ 
          last_cover_attempt_at: new Date().toISOString(),
          missing_covers: true,
          missing_components: ['front_cover', 'back_cover', 'cover_pdf']
        })
        .eq('id', bookId);
      
      return new Response(
        JSON.stringify({ 
          error: 'Cover generation failed',
          details: coverError?.message || 'Unknown error'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Covers generated successfully');

    // Upload covers to storage
    let frontCoverUrl: string | null = null;
    let backCoverUrl: string | null = null;

    if (coverData.frontCover) {
      const frontBlob = await fetch(coverData.frontCover).then(r => r.blob());
      const frontPath = `${book.user_id}/${Date.now()}-retry-front-cover.png`;
      
      const { error: uploadError } = await supabaseClient.storage
        .from('generated-pages')
        .upload(frontPath, frontBlob, { contentType: 'image/png' });
      
      if (!uploadError) {
        const { data: urlData } = supabaseClient.storage
          .from('generated-pages')
          .getPublicUrl(frontPath);
        frontCoverUrl = urlData.publicUrl;
      }
    }

    if (coverData.backCover) {
      const backBlob = await fetch(coverData.backCover).then(r => r.blob());
      const backPath = `${book.user_id}/${Date.now()}-retry-back-cover.png`;
      
      const { error: uploadError } = await supabaseClient.storage
        .from('generated-pages')
        .upload(backPath, backBlob, { contentType: 'image/png' });
      
      if (!uploadError) {
        const { data: urlData } = supabaseClient.storage
          .from('generated-pages')
          .getPublicUrl(backPath);
        backCoverUrl = urlData.publicUrl;
      }
    }

    // Update book record
    const updateData: any = {
      last_cover_attempt_at: new Date().toISOString(),
    };

    if (frontCoverUrl) {
      updateData.cover_image_url = frontCoverUrl;
    }
    if (backCoverUrl) {
      updateData.back_cover_image_url = backCoverUrl;
    }

    // Determine if covers are now complete
    const hasFrontCover = frontCoverUrl || book.cover_image_url;
    const hasBackCover = backCoverUrl || book.back_cover_image_url;
    
    if (hasFrontCover && hasBackCover) {
      updateData.missing_covers = false;
      updateData.missing_components = [];
    } else {
      const missing = [];
      if (!hasFrontCover) missing.push('front_cover');
      if (!hasBackCover) missing.push('back_cover');
      updateData.missing_covers = true;
      updateData.missing_components = missing;
    }

    const { error: updateError } = await supabaseClient
      .from('books')
      .update(updateData)
      .eq('id', bookId);

    if (updateError) {
      console.error('❌ Book update error:', updateError);
    }

    console.log('✅ Cover retry completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        frontCoverUrl,
        backCoverUrl,
        missingCovers: updateData.missing_covers
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Retry cover error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
