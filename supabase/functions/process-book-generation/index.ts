import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
import jsPDF from 'https://esm.sh/jspdf@2.5.1';
import { encode } from 'https://deno.land/std@0.190.0/encoding/base64.ts';

// ============================================
// PHASE 1: EMERGENCY ERROR RECOVERY
// ============================================

// Catch process termination signals
Deno.addSignalListener("SIGTERM", () => {
  console.error("🛑 SIGTERM received - edge function being terminated");
  console.error("Stack trace:", new Error().stack);
});

// Catch unhandled promise rejections
globalThis.addEventListener("unhandledrejection", (e) => {
  console.error("🚨 UNHANDLED PROMISE REJECTION:", e.reason);
  console.error("Promise:", e.promise);
  if (e.reason instanceof Error) {
    console.error("Stack:", e.reason.stack);
  }
});

// Catch uncaught errors
globalThis.addEventListener("error", (e) => {
  console.error("🚨 UNCAUGHT ERROR:", e.error || e.message);
  console.error("Filename:", e.filename);
  console.error("Line:", e.lineno, "Col:", e.colno);
  if (e.error instanceof Error) {
    console.error("Stack:", e.error.stack);
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerationJob {
  id: string;
  user_id: string;
  book_id: string | null;
  status: string;
  created_at: string;
  started_at: string | null;
  last_heartbeat: string | null;  // Added for FIX 2
  retry_count: number; // PHASE 5: Track retries for graceful degradation
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

const FUNCTION_TIMEOUT_MS = 840000; // 14 minutes (leave 1 min buffer before 15 min edge function timeout)

// ============================================
// PHASE 2: API TIMEOUT WRAPPER
// ============================================

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`⏱️ Timeout after ${timeoutMs}ms for ${url}`);
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  }
}

// ============================================
// PHASE 5: MEMORY MONITORING
// ============================================

function logMemoryUsage(label: string) {
  try {
    const memUsage = Deno.memoryUsage();
    const rss = (memUsage.rss / 1024 / 1024).toFixed(2);
    const heapTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const heapUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const external = (memUsage.external / 1024 / 1024).toFixed(2);
    
    console.log(`📊 [${label}] Memory: RSS=${rss}MB, Heap=${heapUsed}/${heapTotal}MB, External=${external}MB`);
    
    // Warn if memory usage is high
    if (memUsage.heapUsed / memUsage.heapTotal > 0.9) {
      console.warn(`⚠️ [${label}] High memory usage: ${(memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(1)}%`);
    }
  } catch (e) {
    console.warn(`Could not get memory usage for ${label}:`, e);
  }
}

// Heartbeat system to keep job alive
function startHeartbeat(supabase: any, jobId: string): () => void {
  const intervalId = setInterval(async () => {
    try {
      await supabase
        .from('book_generation_jobs')
        .update({ 
          last_heartbeat: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
      console.log(`💓 Heartbeat sent for job ${jobId}`);
    } catch (error) {
      console.error(`❌ Heartbeat failed for job ${jobId}:`, error);
    }
  }, 30000); // Every 30 seconds
  
  return () => {
    clearInterval(intervalId);
    console.log(`💔 Heartbeat stopped for job ${jobId}`);
  };
}

Deno.serve(async (req) => {
  console.log('=== process-book-generation invoked ===');
  console.log('Method:', req.method);
  console.log('Time:', new Date().toISOString());
  logMemoryUsage('Function Start');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let stopHeartbeat: (() => void) | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // FIX 3: Improved orphaned job detection - catch stalled jobs more aggressively
  console.log('Fetching pending or orphaned jobs...');
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data: jobs, error: fetchError } = await supabase
    .from('book_generation_jobs')
    .select('*')
    .or(`status.eq.pending,and(status.eq.processing,started_at.is.null),and(status.eq.processing,last_heartbeat.lt.${threeMinutesAgo},started_at.lt.${fiveMinutesAgo})`)
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
      console.log('❌ No pending jobs found');
      console.log('Query used:', {
        pending: true,
        processing_no_start: 'started_at is null',
        processing_stale: `heartbeat < ${threeMinutesAgo}, start < ${fiveMinutesAgo}`
      });
      return new Response(JSON.stringify({ message: 'No pending jobs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const job = jobs[0] as GenerationJob;
    
    console.log('=== Job Details ===');
    console.log('Job ID:', job.id);
    console.log('User ID:', job.user_id);
    console.log('Status:', job.status);
    console.log('Started at:', job.started_at);
    console.log('Last heartbeat:', job.last_heartbeat);
    console.log('Progress:', job.progress);
    console.log('Book ID:', job.book_id);
    console.log('Created:', job.created_at);
    console.log('Page count:', job.generation_data.selectedPageCount);
    console.log('Complexity:', job.generation_data.complexityLevel);

    // PHASE 3: Atomically claim the job with optimistic locking (pending OR orphaned processing jobs)
    // This prevents multiple function instances from processing the same job
    console.log('🔒 Attempting to claim job...');
    const currentTime = new Date().toISOString();
    const { data: claimedJob, error: claimError } = await supabase
      .from('book_generation_jobs')
      .update({
        status: 'processing',
        started_at: job.started_at || currentTime, // Keep original start time if resuming
        last_heartbeat: currentTime,
        progress: job.progress || { currentPage: 0, totalPages: job.generation_data.selectedPageCount, currentStep: 'Preparing generation' },
      })
      .eq('id', job.id)
      .in('status', ['pending', 'processing'])  // CRITICAL: Claim both pending AND orphaned processing jobs
      .select()
      .single();

    if (claimError || !claimedJob) {
      console.log('⏭️ Job', job.id, 'could not be claimed');
      console.log('Claim error:', claimError);
      console.log('Current job status was:', job.status);
      console.log('Another instance likely claimed this job first');
      return new Response(JSON.stringify({ 
        message: 'Job already being processed',
        jobId: job.id,
        reason: claimError?.message || 'Concurrency check failed'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Successfully claimed job ${job.id}`);


    // Process the job with comprehensive error handling
    const startTime = Date.now();
    stopHeartbeat = startHeartbeat(supabase, job.id);
    
    try {
      // Add timeout recovery with Promise.race
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Edge function timeout - exceeded 14 minutes')), FUNCTION_TIMEOUT_MS);
      });

      // FIX 1: Capture the actual response from processBookGeneration
      const generationResponse: Response = await Promise.race([
        processBookGeneration(supabase, job, startTime, stopHeartbeat),
        timeoutPromise
      ]) as Response;
      
      // Check if job was paused for memory or actually completed
      const responseBody = await generationResponse.clone().json();
      if (responseBody.message === 'Paused for memory cleanup') {
        console.log(`⏸️ Job ${job.id} paused for memory cleanup - will resume from page ${responseBody.pages_completed + 1}`);
      } else if (responseBody.message === 'Batch complete, continuing generation') {
        console.log(`🔄 Job ${job.id} batch complete - continuing generation from page ${responseBody.pages_completed + 1}`);
      } else {
        console.log(`✓ Job ${job.id} completed successfully`);
      }
      logMemoryUsage('Job Completed');
      
      // FIX 2: Return the actual response instead of generic success
      return generationResponse;
      
    } catch (processError) {
      // ALWAYS mark job as failed if something goes wrong
      console.error(`❌ Job ${job.id} processing error:`, processError);
      const errorMessage = processError instanceof Error ? processError.message : 'Unknown error during processing';
      
      // Determine if this is a system error (grant retry credit)
      const isSystemError = errorMessage.includes('timeout') || 
                            errorMessage.includes('Edge Function') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('crashed') ||
                            errorMessage.includes('fetch failed') ||
                            errorMessage.includes('SIGTERM') ||
                            errorMessage.includes('unhandled');
      
      await supabase
        .from('book_generation_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          failure_reason: isSystemError ? 'system_error' : 'generation_error',
          completed_at: new Date().toISOString(),
          processing_duration_ms: Date.now() - startTime,
        })
        .eq('id', job.id);

      // FIX #1: Update book status to 'failed' if book was created
      if (job.book_id) {
        await supabase
          .from('books')
          .update({ status: 'failed' })
          .eq('id', job.book_id);
        console.log(`✓ Book ${job.book_id} status updated to failed`);
      }

      // Grant retry credit if system error
      if (isSystemError) {
        try {
          await supabase
            .from('retry_credits')
            .insert({
              user_id: job.user_id,
              book_id: job.book_id,
              reason: `System error: ${errorMessage}`,
            });
          console.log('✓ Retry credit granted for system error');
        } catch (creditError) {
          console.error('Failed to grant retry credit:', creditError);
        }
      }

      logMemoryUsage('Job Failed');

      return new Response(JSON.stringify({ error: errorMessage, jobId: job.id }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      // CRITICAL: Always stop heartbeat in finally block
      if (stopHeartbeat) {
        stopHeartbeat();
      }
    }

    // FIX 2: This line is now removed - response is returned from within try block above

  } catch (error) {
    console.error('Error in process-book-generation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Stop heartbeat if error occurred before finally block
    if (stopHeartbeat) {
      stopHeartbeat();
    }
    
    logMemoryUsage('Function Error');
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processBookGeneration(supabase: any, job: GenerationJob, startTime: number, stopHeartbeat: (() => void) | null): Promise<Response> {
  // Check for timeout before starting
  const checkTimeout = () => {
    const elapsed = Date.now() - startTime;
    if (elapsed > FUNCTION_TIMEOUT_MS) {
      throw new Error(`Job timeout: exceeded ${FUNCTION_TIMEOUT_MS / 1000} seconds`);
    }
  };

  // Enhanced error logging function
  const logError = async (step: string, error: any) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [${step}] Error:`, errorMessage);
    console.error(`❌ [${step}] Stack:`, error instanceof Error ? error.stack : 'No stack trace');
    logMemoryUsage(`Error at ${step}`);
    
    // Update job with error details
    await supabase
      .from('book_generation_jobs')
      .update({
        error_message: `${step}: ${errorMessage}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id);
  };

  try {
    const { generation_data } = job;
    const { characters, interests, consistentCharacters, complexityLevel, selectedPageCount, isReworkMode, selectedPagesForRework, generatedBookId } = generation_data;

    // CRITICAL: Validate rework mode parameters
    if (isReworkMode) {
      if (!selectedPagesForRework || selectedPagesForRework.length === 0) {
        throw new Error('Rework mode requires at least one page to be selected. Please select pages to rework before continuing.');
      }
      console.log(`🔄 Rework mode: regenerating ${selectedPagesForRework.length} page(s): ${selectedPagesForRework.join(', ')}`);
    }

    // Step 1: Generate prompts with error handling
    console.log('📝 Starting prompt generation...');
    logMemoryUsage('Before Prompts');
    await updateJobProgress(supabase, job.id, { currentStep: 'Creating story prompts', currentPage: 0, totalPages: selectedPageCount });
    
    let prompts;
    try {
      const promptStartTime = Date.now();
      const promptsResponse = await supabase.functions.invoke('generate-prompts', {
        body: {
          characters,
          interests,
          consistentCharacters,
          targetPageCount: selectedPageCount,
          complexityLevel,
        }
      });

      // FIX #3: Log the full response for debugging
      console.log('Prompts response:', {
        error: promptsResponse.error,
        data: promptsResponse.data ? 'present' : 'missing',
        status: (promptsResponse as any).status
      });

      if (promptsResponse.error) {
        // Extract more details from the error
        const errorDetails = {
          message: promptsResponse.error.message,
          status: (promptsResponse.error as any).status,
          statusCode: (promptsResponse.error as any).statusCode,
          details: (promptsResponse.error as any).details || JSON.stringify(promptsResponse.error)
        };
        
        console.error('❌ Prompt generation error details:', errorDetails);
        await logError('Prompt Generation', errorDetails);
        
        throw new Error(`Prompt generation failed: ${errorDetails.message} (Status: ${errorDetails.statusCode || errorDetails.status || 'unknown'})`);
      }
      
      if (!promptsResponse.data || !promptsResponse.data.prompts) {
        throw new Error('No prompts returned from generate-prompts function');
      }
      
      prompts = promptsResponse.data.prompts;
      console.log(`✓ Generated ${prompts.length} prompts in ${Date.now() - promptStartTime}ms`);
      logMemoryUsage('After Prompts');
    } catch (error) {
      console.error('❌ Prompt generation failed:', error);
      await logError('Prompt Generation', error);
      throw error;
    }

    // PHASE 1: Create book record early to enable incremental saves
    let bookId = job.book_id;
    if (!bookId) {
      console.log('📚 Creating book record early for incremental saves...');
      const characterName = characters[0]?.name || 'Child';
      const { data: newBook, error: insertError } = await supabase
        .from('books')
        .insert({
          user_id: job.user_id,
          character_name: characterName,
          interests,
          pages: [],
          photo_urls: [],
          consistent_characters: consistentCharacters,
          complexity: complexityLevel,
          selected_page_count: selectedPageCount,
          status: 'generating',
          cover_image_url: null,
          back_cover_image_url: null,
          cover_url: null,
        })
        .select()
        .single();

      if (insertError) throw new Error(`Failed to create book: ${insertError.message}`);
      bookId = newBook.id;
      
      // Update job with book_id immediately
      await supabase
        .from('book_generation_jobs')
        .update({ book_id: bookId })
        .eq('id', job.id);
      
      console.log(`📚 Book record created: ${bookId}`);
    }

    // Step 2: Generate images one-by-one with timeout protection
    checkTimeout();
    
    await updateJobProgress(supabase, job.id, { 
      currentStep: 'Generating coloring pages', 
      currentPage: 0, 
      totalPages: selectedPageCount 
    });

    // ============================================
    // PHASE 1: Check for existing progress (resume logic)
    // ============================================
    let generatedPages = [];
    let startPageIndex = 0;
    
    // PHASE 5: Graceful degradation - reduce page count on retry
    let adjustedPageCount = selectedPageCount;
    if (job.retry_count >= 2) {
      adjustedPageCount = Math.min(6, selectedPageCount);
      console.warn(`⚠️ Retry #${job.retry_count}: Reducing page count from ${selectedPageCount} to ${adjustedPageCount} pages to avoid memory exhaustion`);
    }
    
    // Check for rework mode vs. resume mode
    if (isReworkMode && selectedPagesForRework && selectedPagesForRework.length > 0) {
      // REWORK MODE: Load existing pages but DON'T resume - we'll replace specific pages
      console.log(`🔄 Rework mode: will regenerate ${selectedPagesForRework.length} specific page(s): ${selectedPagesForRework.join(', ')}`);
      
      if (bookId) {
        const { data: bookData } = await supabase
          .from('books')
          .select('pages')
          .eq('id', bookId)
          .single();
        
        if (bookData?.pages && Array.isArray(bookData.pages)) {
          generatedPages = bookData.pages;
          console.log(`✅ Loaded ${generatedPages.length} existing pages for rework`);
        }
      }
      // DO NOT set startPageIndex in rework mode - we process specific pages only
    } else {
      // RESUME MODE: Normal recovery logic for interrupted generations
      if (bookId) {
        console.log(`🔄 Checking for existing progress...`);
        
        const { data: bookData } = await supabase
          .from('books')
          .select('pages')
          .eq('id', bookId)
          .single();
        
        if (bookData?.pages && Array.isArray(bookData.pages) && bookData.pages.length > 0) {
          generatedPages = bookData.pages;
          startPageIndex = generatedPages.length;
          console.log(`✅ Recovered ${generatedPages.length} pages, resuming from page ${startPageIndex + 1}`);
        }
      }
    }
    
    // Determine which pages to process
    const pagesToProcess = isReworkMode && selectedPagesForRework 
      ? selectedPagesForRework.map(p => p - 1) // Convert to 0-indexed
      : Array.from({length: adjustedPageCount - startPageIndex}, (_, i) => startPageIndex + i);
    
    console.log(`Starting page-by-page generation: ${pagesToProcess.length} page(s) - indices: [${pagesToProcess.map(i => i + 1).join(', ')}]`);
    logMemoryUsage('Before Image Generation');

    // ============================================
    // PHASE 2: Circuit Breaker - Exit every 3 pages to clear memory
    // PHASE 3 & 4: Process ONE page at a time
    // Save progress incrementally, clear memory
    // ============================================
    
    // Dynamic memory-based circuit breaker (not fixed page count)
    let processedCount = 0; // Track how many pages we've processed in this run
    const MIN_PAGES_BEFORE_CHECK = 1; // Process at least 1 page before checking
    const PAUSE_MEMORY_THRESHOLD = 88; // Graceful pause at 88% (before 92% emergency limit)
    
    for (const pageIndex of pagesToProcess) {
      checkTimeout();
      
      // FIX 1: Memory monitoring before each page
      const memUsage = Deno.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const percentUsed = (heapUsedMB / heapTotalMB) * 100;
      
      console.log(`📊 Memory before page ${pageIndex + 1}: ${heapUsedMB.toFixed(1)}MB / ${heapTotalMB.toFixed(1)}MB (${percentUsed.toFixed(1)}%)`);
      
      // Emergency exit if memory critically high (92% threshold - modern V8 handles this safely)
      if (percentUsed > 92) {
        console.error(`⚠️ MEMORY CRITICAL: ${percentUsed.toFixed(1)}% - Gracefully exiting`);
        
        // Stop heartbeat
        if (stopHeartbeat) stopHeartbeat();
        
        // FIX #2: Add detailed logging with correct counters for rework mode
        const progressMessage = isReworkMode 
          ? `Processed ${processedCount}/${selectedPagesForRework?.length || 0} rework pages`
          : `${generatedPages.length}/${adjustedPageCount} pages complete`;
        
        console.log(`🔄 Job ${job.id} paused: ${progressMessage}`);
        console.log(`📊 Memory: ${percentUsed.toFixed(1)}% - will resume from page ${generatedPages.length + 1}`);
        console.log(`📚 Book ID: ${bookId} - progress saved to database`);
        
        // Mark job for retry (will resume from where we left off)
        const errorMessage = isReworkMode
          ? `Memory limit reached - processed ${processedCount}/${selectedPagesForRework?.length || 0} rework pages. Will resume automatically.`
          : `Memory limit reached at page ${generatedPages.length}/${adjustedPageCount}. Will resume automatically.`;
        
        await supabase
          .from('book_generation_jobs')
          .update({
            status: 'pending',
            book_id: bookId,  // Make sure book_id is set
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
            started_at: null,  // ✅ FIX 1: Clear started_at so stall detection resets
            last_heartbeat: null,  // ✅ FIX 1: Clear heartbeat too
            progress: {
              currentStep: 'paused_for_memory',
              currentPage: generatedPages.length,
              totalPages: adjustedPageCount
            }
          })
          .eq('id', job.id);
        
        return new Response(
          JSON.stringify({ 
            message: 'Paused for memory cleanup',
            pages_completed: generatedPages.length 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Dynamic circuit breaker - check memory after processing at least 1 page
      if (processedCount >= MIN_PAGES_BEFORE_CHECK && percentUsed > PAUSE_MEMORY_THRESHOLD) {
        console.log(`💤 Graceful pause: ${percentUsed.toFixed(1)}% memory after ${processedCount} pages`);
        
        // FIX 5: Add detailed logging before pausing
        console.log(`🔄 Job ${job.id} paused: ${generatedPages.length}/${adjustedPageCount} pages complete`);
        console.log(`📊 Memory: ${percentUsed.toFixed(1)}% - will resume from page ${generatedPages.length + 1}`);
        
        await updateJobProgress(supabase, job.id, {
          currentStep: 'pausing_for_memory_cleanup',
          currentPage: generatedPages.length,
          totalPages: adjustedPageCount
        });
        
        if (stopHeartbeat) stopHeartbeat();
        
        // Reset to pending so it gets picked up again
        await supabase
          .from('book_generation_jobs')
          .update({
            status: 'pending',
            book_id: bookId,  // Make sure book_id is set
            updated_at: new Date().toISOString(),
            started_at: null,  // ✅ FIX 1: Clear started_at so stall detection resets
            last_heartbeat: null,  // ✅ FIX 1: Clear heartbeat too
            progress: {
              currentStep: 'paused_for_memory',
              currentPage: generatedPages.length,
              totalPages: adjustedPageCount
            }
          })
          .eq('id', job.id);
        
        return new Response(
          JSON.stringify({ message: 'Paused for memory cleanup', pages_completed: generatedPages.length }),
          { headers: corsHeaders }
        );
      }
      
      const pageStartTime = Date.now();
      const prompt = prompts[pageIndex];
      
      console.log(`\n📄 [${Date.now() - startTime}ms] Processing page ${pageIndex + 1}/${prompts.length}`);
      console.log(`📊 Progress: ${((pageIndex / prompts.length) * 100).toFixed(1)}% complete`);
      logMemoryUsage(`Before Page ${pageIndex + 1}`);

      let pageSuccess = false;
      const MAX_PAGE_ATTEMPTS = 2;

      for (let attempt = 1; attempt <= MAX_PAGE_ATTEMPTS && !pageSuccess; attempt++) {
        try {
          console.log(`  Attempt ${attempt}/${MAX_PAGE_ATTEMPTS} for page ${pageIndex + 1}`);
          
          // PHASE 2: Use timeout wrapper for image generation (60 second timeout)
          const imageResponse = await Promise.race([
            supabase.functions.invoke('generate-images', {
              body: {
                prompts: [prompt], // ONLY this one page
                characters,
                consistentCharacters,
                complexity: complexityLevel,
                isReworkMode: false,
                batchSize: 1,
              }
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Image generation timeout for page ${pageIndex + 1}`)), 60000)
            )
          ]) as any;

          if (imageResponse.error) {
            console.error(`  Page ${pageIndex + 1} attempt ${attempt} failed:`, imageResponse.error);
            if (attempt < MAX_PAGE_ATTEMPTS) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
            throw imageResponse.error;
          }

          if (imageResponse.data?.pages?.[0]) {
            const page = imageResponse.data.pages[0];
            
            // PHASE 4: Upload immediately and clear from memory
            if (page.imageUrl?.startsWith('data:')) {
              console.log(`  ⬆️ Uploading page ${pageIndex + 1} to storage...`);
              
              const blob = await fetch(page.imageUrl).then(r => r.blob());
              const timestamp = Date.now();
              const pagePath = `${job.user_id}/${timestamp}-page-${pageIndex + 1}.png`;
              
              const { error: uploadError } = await supabase.storage
                .from('generated-pages')
                .upload(pagePath, blob, {
                  contentType: 'image/png',
                  cacheControl: '3600',
                  upsert: false
                });
              
              if (uploadError) {
                console.error(`  Failed to upload page ${pageIndex + 1}:`, uploadError);
                generatedPages.push(page);
              } else {
                const { data: urlData } = supabase.storage
                  .from('generated-pages')
                  .getPublicUrl(pagePath);
                
                console.log(`  ✅ Page ${pageIndex + 1} uploaded`);
                
                // In rework mode, REPLACE the page at the specific index
                // In normal mode, PUSH the page to the end
                const pageData = {
                  pageNumber: page.pageNumber,
                  prompt: page.prompt,
                  imageUrl: urlData.publicUrl
                };
                
                if (isReworkMode) {
                  generatedPages[pageIndex] = pageData;
                  console.log(`  🔄 Replaced page ${pageIndex + 1} in rework mode`);
                  
                  // ✅ DEFENSIVE: Ensure no null pages exist in array after replacement
                  generatedPages = generatedPages.filter((p: any) => p != null && p.imageUrl);
                } else {
                  generatedPages.push(pageData);
                }
              }
            } else {
              if (isReworkMode) {
                generatedPages[pageIndex] = page;
                console.log(`  🔄 Replaced page ${pageIndex + 1} in rework mode`);
              } else {
                generatedPages.push(page);
              }
            }
            
            pageSuccess = true;
            processedCount++; // Increment processed count
            const pageTime = Date.now() - pageStartTime;
            console.log(`  ✅ Page ${pageIndex + 1} complete in ${pageTime}ms`);
            logMemoryUsage(`After Page ${pageIndex + 1}`);
            
            // PHASE 3: Save progress to database immediately after each page
            await updateJobProgress(supabase, job.id, {
              currentStep: 'generating_images',
              currentPage: generatedPages.length,
              totalPages: selectedPageCount
            });
            
            // PHASE 1: Create clean copy WITHOUT base64 data for database
            const dbPages = generatedPages
              .filter((p: any) => p != null && p.imageUrl)
              .map((p: any) => ({
                pageNumber: p.pageNumber,
                prompt: p.prompt,
                imageUrl: p.imageUrl
              }));
            
            // Save clean data to database (no base64 bloat)
            await supabase
              .from('books')
              .update({ 
                pages: dbPages,
                updated_at: new Date().toISOString()
              })
              .eq('id', bookId);
            console.log(`  💾 Progress saved to database: ${dbPages.length}/${prompts.length} pages`);
            
            // PHASE 2: NOW clear from memory (after saving clean version)
            generatedPages[pageIndex] = null as any;
            
            // FIX 4: Force multiple GC passes for better cleanup
            for (let i = 0; i < 3; i++) {
              if ((globalThis as any).gc) {
                (globalThis as any).gc();
              }
            }
            
            // Add small delay to allow GC to complete
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`  ❌ Page ${pageIndex + 1} attempt ${attempt} exception:`, error);
          if (attempt < MAX_PAGE_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          // Don't fail entire job, continue to next page
          console.error(`  ⚠️ Skipping page ${pageIndex + 1} after ${MAX_PAGE_ATTEMPTS} attempts`);
        }
      }
    }

    logMemoryUsage('After All Images');

    // Generate covers (if we have at least one page)
    // CRITICAL: Skip cover generation in rework mode - only regenerate covers for NEW books
    let coverImageUrl = null;
    let backCoverImageUrl = null;
    let coverUrl = null;
    
    if (generatedPages.length > 0 && !isReworkMode) {
      checkTimeout();
      console.log(`\n[${Date.now() - startTime}ms] === Cover Generation Starting ===`);
      logMemoryUsage('Before Covers');
      await updateJobProgress(supabase, job.id, { 
        currentStep: 'Creating book cover', 
        currentPage: generatedPages.length, 
        totalPages: selectedPageCount 
      });
      
      try {
        const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
        const characterName = characters[0]?.name || 'Child';
        const interestsText = interests.slice(0, 3).join(', ');
        const firstPageUrl = generatedPages[0]?.imageUrl;
        
        if (firstPageUrl && googleApiKey) {
          console.log('Fetching first page for cover generation...');
          
          let base64Data: string;
          let mimeType: string;
          
          if (firstPageUrl.startsWith('http://') || firstPageUrl.startsWith('https://')) {
            // PHASE 2: Use timeout for fetching first page (30 second timeout)
            const imageResponse = await fetchWithTimeout(firstPageUrl, {}, 30000);
            if (imageResponse.ok) {
              const arrayBuffer = await imageResponse.arrayBuffer();
              base64Data = encode(arrayBuffer);
              mimeType = imageResponse.headers.get('content-type') || 'image/png';
              console.log(`✓ First page fetched (${(arrayBuffer.byteLength / 1024).toFixed(2)} KB)`);
            } else {
              throw new Error('Failed to fetch first page');
            }
          } else if (firstPageUrl.startsWith('data:')) {
            base64Data = firstPageUrl.replace(/^data:image\/\w+;base64,/, '');
            mimeType = firstPageUrl.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';
          } else {
            throw new Error('Invalid image URL format');
          }
          
          // Generate front cover with 90-second timeout
          console.log('Generating front cover with AI...');
          const frontCoverPrompt = `Transform this coloring page into a vibrant book cover with border and title.

CRITICAL - PRESERVE CHARACTER: Keep the EXACT character appearance from the source image - especially hair color, facial features, skin tone, clothing, and ALL visual details EXACTLY as shown. DO NOT change hair color or any character features.

COLOR: Fill with rich, vibrant colors matching theme: ${interestsText}. Professional, age-appropriate coloring.

BORDER: Add playful decorative border (10-15% width) with theme elements (${interestsText}). Eye-catching, child-friendly design.

CHARACTER NAME: Add the name "${characterName}" in a super stylized, fun, decorative font near the character. Make it prominent, playful, and integrated into the design. Use creative lettering that matches the book's theme.

OUTPUT: High resolution 2588x3375 pixels complete front cover ready for print at 300 DPI.`;

          const frontCoverStartTime = Date.now();
          // PHASE 2: Use timeout wrapper for front cover (90 second timeout)
          const frontResponse = await fetchWithTimeout(
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
                    { inlineData: { mimeType, data: base64Data } }
                  ]
                }],
                generationConfig: { responseModalities: ['IMAGE'] }
              }),
            },
            90000 // 90 second timeout
          );

          if (frontResponse.ok) {
            const frontData = await frontResponse.json();
            const frontImagePart = frontData.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            
            if (frontImagePart?.inlineData?.data) {
              const frontMimeType = frontImagePart.inlineData.mimeType || 'image/png';
              const frontCoverBase64 = `data:${frontMimeType};base64,${frontImagePart.inlineData.data}`;
              
              const frontBlob = await fetch(frontCoverBase64).then(r => r.blob());
              const timestamp = Date.now();
              const frontPath = `${job.user_id}/${timestamp}-cover.png`;
              
              const { error: frontUploadError } = await supabase.storage
                .from('generated-pages')
                .upload(frontPath, frontBlob, { contentType: 'image/png' });
              
              if (!frontUploadError) {
                const { data: frontUrlData } = supabase.storage
                  .from('generated-pages')
                  .getPublicUrl(frontPath);
                coverImageUrl = frontUrlData.publicUrl;
                console.log(`✅ Front cover uploaded in ${Date.now() - frontCoverStartTime}ms`);
              }
            }
          }
          
          // Generate back cover with 90-second timeout
          console.log('Generating back cover with AI...');
          const backCoverPrompt = `Create a BLANK back cover for children's book printing.
High resolution 2588x3375 pixels at 300 DPI. Simple solid color background (soft pastel matching theme: ${interestsText}).
Minimal or no decorative elements. Clean, professional, ready for text overlay if needed.`;

          const backCoverStartTime = Date.now();
          // PHASE 2: Use timeout wrapper for back cover (90 second timeout)
          const backResponse = await fetchWithTimeout(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
            {
              method: 'POST',
              headers: {
                'x-goog-api-key': googleApiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents: [{ parts: [{ text: backCoverPrompt }] }],
                generationConfig: { responseModalities: ['IMAGE'] }
              }),
            },
            90000 // 90 second timeout
          );

          if (backResponse.ok) {
            const backData = await backResponse.json();
            const backImagePart = backData.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            
            if (backImagePart?.inlineData?.data) {
              const backMimeType = backImagePart.inlineData.mimeType || 'image/png';
              const backCoverBase64 = `data:${backMimeType};base64,${backImagePart.inlineData.data}`;
              
              const backBlob = await fetch(backCoverBase64).then(r => r.blob());
              const timestamp = Date.now();
              const backPath = `${job.user_id}/${timestamp}-back-cover.png`;
              
              const { error: backUploadError } = await supabase.storage
                .from('generated-pages')
                .upload(backPath, backBlob, { contentType: 'image/png' });
              
              if (!backUploadError) {
                const { data: backUrlData } = supabase.storage
                  .from('generated-pages')
                  .getPublicUrl(backPath);
                backCoverImageUrl = backUrlData.publicUrl;
                console.log(`✅ Back cover uploaded in ${Date.now() - backCoverStartTime}ms`);
              }
            }
          }
          
          // Generate cover PDF if we have both covers
          if (coverImageUrl && backCoverImageUrl) {
            console.log('Generating print-ready cover PDF...');
            
            try {
              const frontTest = await fetchWithTimeout(coverImageUrl, {}, 30000);
              if (!frontTest.ok) {
                throw new Error(`Front cover not accessible: ${frontTest.status}`);
              }
              
              const backTest = await fetchWithTimeout(backCoverImageUrl, {}, 30000);
              if (!backTest.ok) {
                throw new Error(`Back cover not accessible: ${backTest.status}`);
              }
              
              const frontArrayBuffer = await frontTest.arrayBuffer();
              const frontBase64 = encode(frontArrayBuffer);
              const frontDataUrl = `data:image/png;base64,${frontBase64}`;
              
              const backArrayBuffer = await backTest.arrayBuffer();
              const backBase64 = encode(backArrayBuffer);
              const backDataUrl = `data:image/png;base64,${backBase64}`;
              
              const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'in',
                format: [17.176, 8.625],
              });
              
              doc.addImage(backDataUrl, 'PNG', 0, 0, 8.588, 8.625);
              doc.addImage(frontDataUrl, 'PNG', 8.588, 0, 8.588, 8.625);
              
              const pdfOutput = doc.output('arraybuffer');
              const pdfBlob = new Blob([pdfOutput], { type: 'application/pdf' });
              const coverPdfPath = `${job.user_id}/${Date.now()}-cover.pdf`;
              
              const { error: pdfUploadError } = await supabase.storage
                .from('pdfs')
                .upload(coverPdfPath, pdfBlob, { contentType: 'application/pdf' });
              
              if (!pdfUploadError) {
                const { data: pdfUrlData } = supabase.storage
                  .from('pdfs')
                  .getPublicUrl(coverPdfPath);
                coverUrl = pdfUrlData.publicUrl;
                console.log('✅ Cover PDF generated and uploaded');
              }
            } catch (pdfError) {
              console.error('⚠️ Cover PDF generation failed:', pdfError);
            }
          }
        }
      } catch (coverError) {
        console.error('⚠️ Cover generation failed:', coverError);
      }
      
      logMemoryUsage('After Covers');
    }

    // Determine final status
    const totalExpected = prompts.length;
    const totalGenerated = generatedPages.length;

    console.log(`\n=== Generation Summary ===`);
    console.log(`Total pages generated: ${totalGenerated}/${totalExpected}`);
    console.log(`Success rate: ${(totalGenerated / totalExpected * 100).toFixed(1)}%`);
    console.log(`Total time: ${((Date.now() - startTime) / 1000 / 60).toFixed(2)} minutes`);

    if (totalGenerated === 0) {
      throw new Error('Failed to generate any pages');
    }
    
    if (totalGenerated < totalExpected) {
      console.warn(`⚠️ Partial generation: ${totalGenerated}/${totalExpected} pages`);
    } else {
      console.log(`✅ Complete generation: All ${totalGenerated} pages generated successfully`);
    }

    // Save final book to database
    await updateJobProgress(supabase, job.id, { 
      currentStep: 'Finalizing your book', 
      currentPage: selectedPageCount, 
      totalPages: selectedPageCount 
    });

    const hasCovers = !!(coverImageUrl && backCoverImageUrl);
    const hasCoverPdf = !!coverUrl;
    const hasPages = generatedPages.length > 0;
    
    let bookStatus: string;
    const missingComponents = [];
    
    if (hasPages && hasCovers && hasCoverPdf) {
      bookStatus = 'completed';
      console.log('✅ Book generation complete - all components present');
    } else if (hasPages && hasCovers && !hasCoverPdf) {
      bookStatus = 'partial';
      console.warn('⚠️ Partial book generation - missing cover PDF');
      missingComponents.push('cover_pdf');
    } else if (hasPages && !hasCovers) {
      bookStatus = 'partial';
      console.warn('⚠️ Partial book generation - pages complete but covers missing');
      if (!coverImageUrl) missingComponents.push('front_cover');
      if (!backCoverImageUrl) missingComponents.push('back_cover');
      if (!hasCoverPdf) missingComponents.push('cover_pdf');
    } else {
      bookStatus = 'failed';
      console.error('❌ Book generation failed - no pages generated');
    }

    const characterName = characters[0]?.name || 'Child';
    
    // Process character photos
    let photoUrls: string[] = [];
    if (characters[0]?.photos && Array.isArray(characters[0].photos)) {
      for (let i = 0; i < characters[0].photos.length; i++) {
        const photo = characters[0].photos[i];
        if (!photo) continue;
        
        try {
          if (typeof photo === 'string' && photo.startsWith('data:image')) {
            const blob = await fetch(photo).then(r => r.blob());
            const timestamp = Date.now();
            const photoPath = `${job.user_id}/${timestamp}-character-photo-${i}.png`;
            
            const { error: uploadError } = await supabase.storage
              .from('user-photos')
              .upload(photoPath, blob, {
                contentType: 'image/png',
                cacheControl: '3600',
                upsert: false
              });
            
            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from('user-photos')
                .getPublicUrl(photoPath);
              photoUrls.push(urlData.publicUrl);
            }
          } else if (typeof photo === 'string' && photo.startsWith('http')) {
            photoUrls.push(photo);
          }
        } catch (photoError) {
          console.error(`Error processing photo ${i + 1}:`, photoError);
        }
      }
    }
    
    const bookData: any = {
      user_id: job.user_id,
      character_name: characterName,
      interests,
      pages: generatedPages,
      photo_urls: photoUrls,
      consistent_characters: consistentCharacters,
      complexity: complexityLevel,
      selected_page_count: selectedPageCount,
      status: bookStatus,
      cover_image_url: coverImageUrl,
      back_cover_image_url: backCoverImageUrl,
      cover_url: coverUrl,
      missing_covers: !hasCovers,
      missing_components: missingComponents,
    };

    // PHASE 1: Book already created early, just update with final data
    const { error: updateError } = await supabase
      .from('books')
      .update(bookData)
      .eq('id', bookId);

    if (updateError) throw new Error(`Failed to update book: ${updateError.message}`);

    // Update reworked_page_numbers to track credits
    if (isReworkMode && selectedPagesForRework && selectedPagesForRework.length > 0) {
      const { data: currentBook } = await supabase
        .from('books')
        .select('reworked_page_numbers')
        .eq('id', bookId)
        .single();
      
      const existingReworked = currentBook?.reworked_page_numbers || [];
      const newReworked = [...new Set([...existingReworked, ...selectedPagesForRework])];
      
      await supabase
        .from('books')
        .update({ reworked_page_numbers: newReworked })
        .eq('id', bookId);
      
      console.log(`✅ Updated reworked_page_numbers: ${existingReworked.length} → ${newReworked.length}`);
    }

    // Mark job as completed
    const finalStatus = totalGenerated === totalExpected ? 'completed' : 'partial';
    const statusMessage = totalGenerated < totalExpected 
      ? `Generated ${totalGenerated}/${totalExpected} pages. Some pages failed.`
      : null;

    await supabase
      .from('book_generation_jobs')
      .update({
        status: finalStatus,
        book_id: bookId,
        completed_at: new Date().toISOString(),
        processing_duration_ms: Date.now() - startTime,
        error_message: statusMessage,
        progress: { 
          currentStep: finalStatus, 
          currentPage: totalGenerated, 
          totalPages: totalExpected 
        }
      })
      .eq('id', job.id);

    console.log(`✅ Job ${job.id} ${finalStatus}. Book ID: ${bookId} (${totalGenerated}/${totalExpected} pages)`);
    logMemoryUsage('Final');
    
    // FIX 1: Return success response for completed job
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: job.id, 
        bookId: bookId,
        pages: totalGenerated,
        status: finalStatus
      }),
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error(`❌ Job ${job.id} failed:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await supabase
      .from('book_generation_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
        processing_duration_ms: Date.now() - startTime,
      })
      .eq('id', job.id);
    
    throw error;
  }
}

async function updateJobProgress(supabase: any, jobId: string, progress: any) {
  await supabase
    .from('book_generation_jobs')
    .update({ progress })
    .eq('id', jobId);
}
