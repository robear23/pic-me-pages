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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get next pending job
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
      return new Response(JSON.stringify({ message: 'No pending jobs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const job = jobs[0] as GenerationJob;
    console.log(`Processing job ${job.id} for user ${job.user_id}`);

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

    // Step 2: Generate images
    const generatedPages = [];
    for (let i = 0; i < prompts.length; i++) {
      await updateJobProgress(supabase, job.id, { 
        currentStep: 'generating_images', 
        currentPage: i + 1, 
        totalPages: selectedPageCount 
      });

      const imageResponse = await supabase.functions.invoke('generate-images', {
        body: {
          prompts: [prompts[i]],
          characters,
          consistentCharacters,
          complexity: complexityLevel,
          isReworkMode: false,
        }
      });

      if (imageResponse.error) {
        console.error(`Failed to generate page ${i + 1}:`, imageResponse.error);
        continue;
      }

      if (imageResponse.data?.pages?.[0]) {
        generatedPages.push(imageResponse.data.pages[0]);
      }
    }

    // Step 3: Generate cover
    await updateJobProgress(supabase, job.id, { currentStep: 'generating_cover', currentPage: selectedPageCount, totalPages: selectedPageCount });
    
    const characterName = characters[0]?.name || 'Child';
    const coverResponse = await supabase.functions.invoke('generate-cover', {
      body: {
        characterName,
        interests,
        photoUrl: characters[0]?.photos?.[0] || null,
        pageCount: selectedPageCount,
      }
    });

    let coverImageUrl = null;
    let backCoverImageUrl = null;
    if (!coverResponse.error && coverResponse.data) {
      coverImageUrl = coverResponse.data.coverImageUrl;
      backCoverImageUrl = coverResponse.data.backCoverImageUrl;
    }

    // Step 4: Save book to database
    await updateJobProgress(supabase, job.id, { currentStep: 'saving_book', currentPage: selectedPageCount, totalPages: selectedPageCount });

    const bookData: any = {
      user_id: job.user_id,
      character_name: characterName,
      interests,
      pages: generatedPages,
      photo_urls: characters[0]?.photos || [],
      consistent_characters: consistentCharacters,
      complexity: complexityLevel,
      selected_page_count: selectedPageCount,
      status: generatedPages.length === selectedPageCount ? 'completed' : 'partial',
      cover_image_url: coverImageUrl,
      back_cover_image_url: backCoverImageUrl,
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

    // Mark job as completed
    await supabase
      .from('book_generation_jobs')
      .update({
        status: 'completed',
        book_id: bookId,
        completed_at: new Date().toISOString(),
        progress: { currentStep: 'completed', currentPage: selectedPageCount, totalPages: selectedPageCount }
      })
      .eq('id', job.id);

    console.log(`Job ${job.id} completed successfully. Book ID: ${bookId}`);

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
