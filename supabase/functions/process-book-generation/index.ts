import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerationJob {
  id: string;
  user_id: string;
  book_id: string | null;
  status: string;
  progress: {
    currentPage: number;
    totalPages: number;
    currentStep: string;
  };
  generation_data: {
    characters: any[];
    interests: string[];
    consistentCharacters: boolean;
    complexityLevel: string;
    selectedPageCount: number;
    isReworkMode?: boolean;
    selectedPagesForRework?: number[];
    generatedBookId?: string;
  };
}

Deno.serve(async (req) => {
  console.log('=== process-book-generation invoked ===');
  console.log('Method:', req.method);
  console.log('Time:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get next pending job
    console.log('Fetching pending jobs...');
    const { data: jobs, error: fetchError } = await supabase
      .from('book_generation_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError) {
      console.error('Error fetching jobs:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!jobs || jobs.length === 0) {
      console.log('No pending jobs found');
      return new Response(JSON.stringify({ message: 'No pending jobs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const job = jobs[0] as GenerationJob;
    console.log(`Found pending job ${job.id} for user ${job.user_id}`);

    // Mark job as processing
    await supabase
      .from('book_generation_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        progress: { currentPage: 0, totalPages: job.generation_data.selectedPageCount, currentStep: 'generating_prompts' }
      })
      .eq('id', job.id);

    // Process the job
    await processBookGeneration(supabase, job);

    return new Response(JSON.stringify({ success: true, jobId: job.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in process-book-generation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processBookGeneration(supabase: any, job: GenerationJob) {
  try {
    const { generation_data } = job;
    const { characters, interests, consistentCharacters, complexityLevel, selectedPageCount, isReworkMode, selectedPagesForRework, generatedBookId } = generation_data;

    // Step 1: Generate prompts
    await updateJobProgress(supabase, job.id, { currentStep: 'generating_prompts', currentPage: 0, totalPages: selectedPageCount });
    
    const promptsResponse = await supabase.functions.invoke('generate-prompts', {
      body: {
        characters,
        interests,
        consistentCharacters,
        targetPageCount: selectedPageCount,
        complexityLevel,
      }
    });

    if (promptsResponse.error) throw new Error(`Prompt generation failed: ${promptsResponse.error.message}`);
    const prompts = promptsResponse.data.prompts;

    // Step 2: Generate images batch-by-batch to avoid CPU timeout
    await updateJobProgress(supabase, job.id, { 
      currentStep: 'generating_images', 
      currentPage: 0, 
      totalPages: selectedPageCount 
    });

    const PAGES_PER_BATCH = 2; // Process 2 pages per batch to stay within CPU limit
    const totalBatches = Math.ceil(prompts.length / PAGES_PER_BATCH);
    const generatedPages = [];
    
    console.log(`Starting batch processing: ${totalBatches} batches, ${PAGES_PER_BATCH} pages per batch`);

    // Process each batch separately
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * PAGES_PER_BATCH;
      const end = Math.min(start + PAGES_PER_BATCH, prompts.length);
      const batchPrompts = prompts.slice(start, end);
      
      const batchStartTime = Date.now();
      console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches} (pages ${start + 1}-${end})`);

      // Retry logic for this batch
      let batchAttempts = 0;
      const MAX_BATCH_ATTEMPTS = 2;
      let batchSuccess = false;

      while (batchAttempts < MAX_BATCH_ATTEMPTS && !batchSuccess) {
        batchAttempts++;
        console.log(`  Attempt ${batchAttempts}/${MAX_BATCH_ATTEMPTS} for batch ${batchIndex + 1}`);

        try {
          const imageResponse = await supabase.functions.invoke('generate-images', {
            body: {
              prompts: batchPrompts, // Only this batch's prompts
              characters,
              consistentCharacters,
              complexity: complexityLevel,
              isReworkMode: false,
              batchSize: 2,
            }
          });

          if (imageResponse.error) {
            console.error(`  Batch ${batchIndex + 1} attempt ${batchAttempts} failed:`, imageResponse.error);
            if (batchAttempts < MAX_BATCH_ATTEMPTS) {
              await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s before retry
              continue;
            }
          } else if (imageResponse.data?.pages) {
            generatedPages.push(...imageResponse.data.pages);
            batchSuccess = true;
            const batchTime = Date.now() - batchStartTime;
            console.log(`  ✓ Batch ${batchIndex + 1} succeeded with ${imageResponse.data.pages.length} pages (${batchTime}ms)`);
            console.log(`  Progress: ${generatedPages.length}/${prompts.length} pages generated`);
          }
        } catch (error) {
          console.error(`  Batch ${batchIndex + 1} attempt ${batchAttempts} exception:`, error);
          if (batchAttempts < MAX_BATCH_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }
        }
      }

      if (!batchSuccess) {
        console.error(`  ❌ Batch ${batchIndex + 1} failed after ${MAX_BATCH_ATTEMPTS} attempts`);
        // Continue to next batch instead of failing entire job
      }

      // Update progress after each batch
      await updateJobProgress(supabase, job.id, {
        currentStep: 'generating_images',
        currentPage: generatedPages.length,
        totalPages: selectedPageCount
      });
    }

    // Determine final status based on results
    const totalExpected = prompts.length;
    const totalGenerated = generatedPages.length;

    console.log(`\n=== Generation Summary ===`);
    console.log(`Total pages generated: ${totalGenerated}/${totalExpected}`);
    console.log(`Successful batches: ${Math.floor(totalGenerated / PAGES_PER_BATCH)}/${totalBatches}`);

    if (totalGenerated === 0) {
      throw new Error('Failed to generate any pages after processing all batches');
    }
    
    if (totalGenerated < totalExpected) {
      console.warn(`⚠️ Partial generation: ${totalGenerated}/${totalExpected} pages. Some batches failed.`);
    } else {
      console.log(`✓ Complete generation: All ${totalGenerated} pages generated successfully`);
    }

    // Step 3: Generate cover (only if we have pages)
    await updateJobProgress(supabase, job.id, { currentStep: 'generating_cover', currentPage: selectedPageCount, totalPages: selectedPageCount });
    
    const characterName = characters[0]?.name || 'Child';
    const firstPageImageUrl = generatedPages[0]?.imageUrl || null;
    
    const coverResponse = await supabase.functions.invoke('generate-cover', {
      body: {
        characterName,
        interests,
        photoUrl: characters[0]?.photos?.[0] || null,
        pageCount: selectedPageCount,
        firstPageImageUrl, // Pass first page image for cover generation
      }
    });

    let coverImageUrl = null;
    let backCoverImageUrl = null;

    if (coverResponse.error) {
      console.error('Cover generation failed:', coverResponse.error);
      // Continue without cover - don't fail the entire job
    } else if (coverResponse.data?.frontCover && coverResponse.data?.backCover) {
      try {
        console.log('Cover generated successfully, uploading to storage...');
        
        // Convert base64 data URLs to blobs
        const frontCoverBlob = await fetch(coverResponse.data.frontCover).then(r => r.blob());
        const backCoverBlob = await fetch(coverResponse.data.backCover).then(r => r.blob());
        
        // Generate unique filenames with timestamp
        const timestamp = Date.now();
        const frontCoverPath = `${job.user_id}/${timestamp}-cover.png`;
        const backCoverPath = `${job.user_id}/${timestamp}-back-cover.png`;
        
        // Upload front cover
        const { error: frontUploadError } = await supabase.storage
          .from('generated-pages')
          .upload(frontCoverPath, frontCoverBlob, {
            contentType: 'image/png',
            cacheControl: '3600',
            upsert: false
          });
        
        if (frontUploadError) {
          console.error('Front cover upload failed:', frontUploadError);
        } else {
          const { data: frontUrlData } = supabase.storage
            .from('generated-pages')
            .getPublicUrl(frontCoverPath);
          coverImageUrl = frontUrlData.publicUrl;
          console.log('Front cover uploaded:', coverImageUrl);
        }
        
        // Upload back cover
        const { error: backUploadError } = await supabase.storage
          .from('generated-pages')
          .upload(backCoverPath, backCoverBlob, {
            contentType: 'image/png',
            cacheControl: '3600',
            upsert: false
          });
        
        if (backUploadError) {
          console.error('Back cover upload failed:', backUploadError);
        } else {
          const { data: backUrlData } = supabase.storage
            .from('generated-pages')
            .getPublicUrl(backCoverPath);
          backCoverImageUrl = backUrlData.publicUrl;
          console.log('Back cover uploaded:', backCoverImageUrl);
        }
        
      } catch (uploadError) {
        console.error('Error uploading covers to storage:', uploadError);
        // Continue without covers - don't fail the entire job
      }
    }

    // Step 4: Save book to database
    await updateJobProgress(supabase, job.id, { currentStep: 'saving_book', currentPage: selectedPageCount, totalPages: selectedPageCount });

    // Determine book status - book is 'processing' until client generates PDFs
    // Client will update status to 'completed', 'partial', or 'failed' after PDF generation
    const hasCovers = !!(coverImageUrl && backCoverImageUrl);
    const bookStatus = 'processing'; // Always processing until PDFs are generated client-side
    const missingComponents = [];
    if (!hasCovers) {
      if (!coverImageUrl) missingComponents.push('front_cover');
      if (!backCoverImageUrl) missingComponents.push('back_cover');
    }

    const bookData: any = {
      user_id: job.user_id,
      character_name: characterName,
      interests,
      pages: generatedPages,
      photo_urls: characters[0]?.photos || [],
      consistent_characters: consistentCharacters,
      complexity: complexityLevel,
      selected_page_count: selectedPageCount,
      status: bookStatus,
      cover_image_url: coverImageUrl,
      back_cover_image_url: backCoverImageUrl,
      missing_covers: !hasCovers,
      missing_components: missingComponents,
    };

    let bookId = job.book_id;
    if (!bookId) {
      const { data: newBook, error: insertError } = await supabase
        .from('books')
        .insert(bookData)
        .select()
        .single();

      if (insertError) throw new Error(`Failed to save book: ${insertError.message}`);
      bookId = newBook.id;
    } else {
      const { error: updateError } = await supabase
        .from('books')
        .update(bookData)
        .eq('id', bookId);

      if (updateError) throw new Error(`Failed to update book: ${updateError.message}`);
    }

    // Mark job as completed with message that client must generate PDFs
    const finalStatus = totalGenerated === totalExpected ? 'completed' : 'partial';
    const statusMessage = totalGenerated < totalExpected 
      ? `Generated ${totalGenerated}/${totalExpected} pages. Some batches failed. Client will generate PDFs.`
      : 'Pages generated successfully. Client will generate PDFs.';

    await supabase
      .from('book_generation_jobs')
      .update({
        status: finalStatus,
        book_id: bookId,
        completed_at: new Date().toISOString(),
        error_message: totalGenerated < totalExpected ? statusMessage : null,
        progress: { 
          currentStep: finalStatus, 
          currentPage: totalGenerated, 
          totalPages: totalExpected 
        }
      })
      .eq('id', job.id);

    console.log(`Job ${job.id} ${finalStatus}. Book ID: ${bookId} (${totalGenerated}/${totalExpected} pages)`);
    console.log(`Note: Book status is 'processing' - client will generate PDFs and update to final status`);

  } catch (error) {
    console.error(`Job ${job.id} failed:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await supabase
      .from('book_generation_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  }
}

async function updateJobProgress(supabase: any, jobId: string, progress: any) {
  await supabase
    .from('book_generation_jobs')
    .update({ progress })
    .eq('id', jobId);
}
