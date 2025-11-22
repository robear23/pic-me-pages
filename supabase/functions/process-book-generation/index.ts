import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
import jsPDF from 'https://esm.sh/jspdf@2.5.1';
import { encode } from 'https://deno.land/std@0.190.0/encoding/base64.ts';

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

const FUNCTION_TIMEOUT_MS = 240000; // 4 minutes - leave buffer before edge function timeout

// Heartbeat system to keep job alive
function startHeartbeat(supabase: any, jobId: string): () => void {
  const intervalId = setInterval(async () => {
    await supabase
      .from('book_generation_jobs')
      .update({ 
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
    console.log(`💓 Heartbeat sent for job ${jobId}`);
  }, 30000); // Every 30 seconds
  
  return () => clearInterval(intervalId);
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

    // Get next pending job with atomic locking
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
    console.log('=== Job Details ===');
    console.log('Job ID:', job.id);
    console.log('User ID:', job.user_id);
    console.log('Created:', job.created_at);
    console.log('Page count:', job.generation_data.selectedPageCount);
    console.log('Complexity:', job.generation_data.complexityLevel);

    // Atomically claim the job (prevents race conditions)
    const { data: claimedJob, error: claimError } = await supabase
      .from('book_generation_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
        progress: { currentPage: 0, totalPages: job.generation_data.selectedPageCount, currentStep: 'Preparing generation' }
      })
      .eq('id', job.id)
      .eq('status', 'pending') // Only claim if still pending (prevents race condition)
      .select()
      .single();

    if (claimError || !claimedJob) {
      console.log('Job was claimed by another instance');
      return new Response(JSON.stringify({ message: 'Job already claimed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✓ Successfully claimed job ${job.id}`);

    // Process the job with comprehensive error handling
    const startTime = Date.now();
    const stopHeartbeat = startHeartbeat(supabase, job.id);
    
    try {
      await processBookGeneration(supabase, job, startTime);
    } catch (processError) {
      // ALWAYS mark job as failed if something goes wrong
      console.error(`Job ${job.id} processing error:`, processError);
      const errorMessage = processError instanceof Error ? processError.message : 'Unknown error during processing';
      
      // Determine if this is a system error (grant retry credit)
      const isSystemError = errorMessage.includes('timeout') || 
                            errorMessage.includes('Edge Function') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('fetch failed');
      
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

      return new Response(JSON.stringify({ error: errorMessage, jobId: job.id }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

async function processBookGeneration(supabase: any, job: GenerationJob, startTime: number) {
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

    // Step 1: Generate prompts with error handling
    console.log('📝 Starting prompt generation...');
    await updateJobProgress(supabase, job.id, { currentStep: 'Creating story prompts', currentPage: 0, totalPages: selectedPageCount });
    
    let prompts;
    try {
      const promptsResponse = await supabase.functions.invoke('generate-prompts', {
        body: {
          characters,
          interests,
          consistentCharacters,
          targetPageCount: selectedPageCount,
          complexityLevel,
        }
      });

      if (promptsResponse.error) {
        await logError('Prompt Generation', promptsResponse.error);
        throw new Error(`Prompt generation failed: ${promptsResponse.error.message}`);
      }
      prompts = promptsResponse.data.prompts;
      console.log(`✓ Generated ${prompts.length} prompts`);
    } catch (error) {
      await logError('Prompt Generation', error);
      throw error;
    }

    // Step 2: Generate images batch-by-batch to avoid CPU timeout
    checkTimeout(); // Check before starting image generation
    
    await updateJobProgress(supabase, job.id, { 
      currentStep: 'Generating coloring pages', 
      currentPage: 0, 
      totalPages: selectedPageCount 
    });

    const PAGES_PER_BATCH = 2; // Process 2 pages per batch to stay within CPU limit
    const totalBatches = Math.ceil(prompts.length / PAGES_PER_BATCH);
    const generatedPages = [];
    
    console.log(`Starting batch processing: ${totalBatches} batches, ${PAGES_PER_BATCH} pages per batch`);

    // Process each batch separately
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      checkTimeout(); // Check timeout before each batch
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
            // Upload each page image to storage before saving to database
            const pagesWithStorageUrls = [];
            for (const page of imageResponse.data.pages) {
              try {
                if (page.imageUrl?.startsWith('data:')) {
                  console.log(`  Uploading page ${page.pageNumber} to storage...`);
                  
                  // Convert base64 data URL to blob
                  const blob = await fetch(page.imageUrl).then(r => r.blob());
                  
                  // Generate unique filename
                  const timestamp = Date.now();
                  const pagePath = `${job.user_id}/${timestamp}-page-${page.pageNumber}.png`;
                  
                  // Upload to storage
                  const { error: uploadError } = await supabase.storage
                    .from('generated-pages')
                    .upload(pagePath, blob, {
                      contentType: 'image/png',
                      cacheControl: '3600',
                      upsert: false
                    });
                  
                  if (uploadError) {
                    console.error(`  Failed to upload page ${page.pageNumber}:`, uploadError);
                    // Keep original base64 URL as fallback
                    pagesWithStorageUrls.push(page);
                  } else {
                    // Get public URL
                    const { data: urlData } = supabase.storage
                      .from('generated-pages')
                      .getPublicUrl(pagePath);
                    
                    console.log(`  ✓ Page ${page.pageNumber} uploaded to storage`);
                    // Replace with storage URL
                    pagesWithStorageUrls.push({
                      ...page,
                      imageUrl: urlData.publicUrl
                    });
                  }
                } else {
                  // Already a storage URL
                  pagesWithStorageUrls.push(page);
                }
              } catch (uploadError) {
                console.error(`  Error uploading page ${page.pageNumber}:`, uploadError);
                // Keep original URL as fallback
                pagesWithStorageUrls.push(page);
              }
            }
            
            generatedPages.push(...pagesWithStorageUrls);
            batchSuccess = true;
            const batchTime = Date.now() - batchStartTime;
            console.log(`  ✓ Batch ${batchIndex + 1} succeeded with ${pagesWithStorageUrls.length} pages (${batchTime}ms)`);
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

    // PHASE 1: Generate covers EARLY (right after first page is ready)
    let coverImageUrl = null;
    let backCoverImageUrl = null;
    let coverUrl = null;
    
    if (generatedPages.length > 0) {
      checkTimeout();
      console.log('\n=== Early Cover Generation (after first page) ===');
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
          // PHASE 2: Inline cover generation logic (no separate function call)
          console.log('Fetching first page for cover generation...');
          
          // Fetch and convert first page to base64
          let base64Data: string;
          let mimeType: string;
          
          if (firstPageUrl.startsWith('http://') || firstPageUrl.startsWith('https://')) {
            const imageResponse = await fetch(firstPageUrl);
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
          
          // Generate front cover
          console.log('Generating front cover with AI...');
          const frontCoverPrompt = `Transform this coloring page into a vibrant book cover with border and title.

CRITICAL - PRESERVE CHARACTER: Keep the EXACT character appearance from the source image - especially hair color, facial features, skin tone, clothing, and ALL visual details EXACTLY as shown. DO NOT change hair color or any character features.

COLOR: Fill with rich, vibrant colors matching theme: ${interestsText}. Professional, age-appropriate coloring.

BORDER: Add playful decorative border (10-15% width) with theme elements (${interestsText}). Eye-catching, child-friendly design.

CHARACTER NAME: Add the name "${characterName}" in a super stylized, fun, decorative font near the character. Make it prominent, playful, and integrated into the design. Use creative lettering that matches the book's theme.

OUTPUT: High resolution 2588x3375 pixels complete front cover ready for print at 300 DPI.`;

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
                    { inlineData: { mimeType, data: base64Data } }
                  ]
                }],
                generationConfig: { responseModalities: ['IMAGE'] }
              }),
            }
          );

          if (frontResponse.ok) {
            const frontData = await frontResponse.json();
            const frontImagePart = frontData.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            
            if (frontImagePart?.inlineData?.data) {
              const frontMimeType = frontImagePart.inlineData.mimeType || 'image/png';
              const frontCoverBase64 = `data:${frontMimeType};base64,${frontImagePart.inlineData.data}`;
              
              // Upload front cover
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
                console.log('✓ Front cover uploaded:', coverImageUrl);
              }
            }
          }
          
          // Generate back cover
          console.log('Generating back cover with AI...');
          const backCoverPrompt = `Create a BLANK back cover for children's book printing.
High resolution 2588x3375 pixels at 300 DPI. Simple solid color background (soft pastel matching theme: ${interestsText}).
Minimal or no decorative elements. Clean, professional, ready for text overlay if needed.`;

          const backResponse = await fetch(
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
            }
          );

          if (backResponse.ok) {
            const backData = await backResponse.json();
            const backImagePart = backData.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            
            if (backImagePart?.inlineData?.data) {
              const backMimeType = backImagePart.inlineData.mimeType || 'image/png';
              const backCoverBase64 = `data:${backMimeType};base64,${backImagePart.inlineData.data}`;
              
              // Upload back cover
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
                console.log('✓ Back cover uploaded:', backCoverImageUrl);
              }
            }
          }
          
          // PHASE 3: Generate cover PDF immediately after cover images
          if (coverImageUrl && backCoverImageUrl) {
            console.log('Generating print-ready cover PDF...');
            console.log('Cover image URL:', coverImageUrl);
            console.log('Back cover URL:', backCoverImageUrl);
            
            try {
              // Validate cover images are accessible
              console.log('Validating cover images...');
              const frontTest = await fetch(coverImageUrl);
              if (!frontTest.ok) {
                throw new Error(`Front cover not accessible: ${frontTest.status}`);
              }
              console.log('✓ Front cover accessible');
              
              const backTest = await fetch(backCoverImageUrl);
              if (!backTest.ok) {
                throw new Error(`Back cover not accessible: ${backTest.status}`);
              }
              console.log('✓ Back cover accessible');
              
              // Convert URLs to data URLs to avoid CORS issues
              console.log('Converting cover images to data URLs...');
              const frontArrayBuffer = await frontTest.arrayBuffer();
              const frontBase64 = encode(frontArrayBuffer);
              const frontDataUrl = `data:image/png;base64,${frontBase64}`;
              
              const backArrayBuffer = await backTest.arrayBuffer();
              const backBase64 = encode(backArrayBuffer);
              const backDataUrl = `data:image/png;base64,${backBase64}`;
              
              console.log('✓ Cover images converted to data URLs');
              
              const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'in',
                format: [17.176, 8.625], // Lulu cover wrap dimensions
              });
              
              console.log('Adding images to PDF...');
              // Add back cover (left side)
              doc.addImage(backDataUrl, 'PNG', 0, 0, 8.588, 8.625);
              
              // Add front cover (right side)
              doc.addImage(frontDataUrl, 'PNG', 8.588, 0, 8.588, 8.625);
              
              console.log('✓ Images added to PDF');
              
              // Convert to blob and upload
              const pdfOutput = doc.output('arraybuffer');
              const pdfBlob = new Blob([pdfOutput], { type: 'application/pdf' });
              const coverPdfPath = `${job.user_id}/${Date.now()}-cover.pdf`;
              
              console.log('Uploading cover PDF to storage...');
              const { error: pdfUploadError } = await supabase.storage
                .from('pdfs')
                .upload(coverPdfPath, pdfBlob, { contentType: 'application/pdf' });
              
              if (!pdfUploadError) {
                const { data: pdfUrlData } = supabase.storage
                  .from('pdfs')
                  .getPublicUrl(coverPdfPath);
                coverUrl = pdfUrlData.publicUrl;
                console.log('✓ Cover PDF generated and uploaded:', coverUrl);
              } else {
                console.error('Cover PDF upload failed:', pdfUploadError);
                throw pdfUploadError;
              }
            } catch (pdfError) {
              console.error('Cover PDF generation failed:', pdfError);
              console.error('Cover error details:', {
                message: pdfError instanceof Error ? pdfError.message : 'Unknown error',
                stack: pdfError instanceof Error ? pdfError.stack : undefined
              });
              // Don't set coverUrl so book will be marked as partial
            }
          }
        }
      } catch (coverError) {
        console.error('⚠️ Early cover generation failed:', coverError);
        // Don't fail the entire job - covers can be retried later
      }
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

    // Cover generation moved to after first page (above) - no separate step needed here

    // Step 4: Save book to database
    await updateJobProgress(supabase, job.id, { currentStep: 'Finalizing your book', currentPage: selectedPageCount, totalPages: selectedPageCount });

    // Determine book status based on generation results - include cover PDF check
    const hasCovers = !!(coverImageUrl && backCoverImageUrl);
    const hasCoverPdf = !!coverUrl;
    const hasPages = generatedPages.length > 0;
    
    let bookStatus: string;
    const missingComponents = [];
    
    if (hasPages && hasCovers && hasCoverPdf) {
      // Everything generated successfully - fully complete
      bookStatus = 'completed';
      console.log('✓ Book generation complete - all components present');
    } else if (hasPages && hasCovers && !hasCoverPdf) {
      // Pages and cover images but no cover PDF - partial
      bookStatus = 'partial';
      console.warn('⚠️ Partial book generation - missing cover PDF');
      missingComponents.push('cover_pdf');
    } else if (hasPages && !hasCovers) {
      // Pages generated but covers failed - partial success
      bookStatus = 'partial';
      console.warn('⚠️ Partial book generation - pages complete but covers missing');
      if (!coverImageUrl) missingComponents.push('front_cover');
      if (!backCoverImageUrl) missingComponents.push('back_cover');
      if (!hasCoverPdf) missingComponents.push('cover_pdf');
    } else {
      // No pages - this should not happen as we check earlier
      bookStatus = 'failed';
      console.error('❌ Book generation failed - no pages generated');
    }

    const characterName = characters[0]?.name || 'Child';
    
    // Process character photos: upload base64 to storage
    let photoUrls: string[] = [];
    if (characters[0]?.photos && Array.isArray(characters[0].photos)) {
      console.log('Processing character photos...');
      for (let i = 0; i < characters[0].photos.length; i++) {
        const photo = characters[0].photos[i];
        if (!photo) continue;
        
        try {
          // Check if it's a base64 data URL
          if (typeof photo === 'string' && photo.startsWith('data:image')) {
            console.log(`Uploading photo ${i + 1} to storage...`);
            
            // Convert base64 to blob
            const blob = await fetch(photo).then(r => r.blob());
            
            // Generate unique filename
            const timestamp = Date.now();
            const photoPath = `${job.user_id}/${timestamp}-character-photo-${i}.png`;
            
            // Upload to storage
            const { error: uploadError } = await supabase.storage
              .from('user-photos')
              .upload(photoPath, blob, {
                contentType: 'image/png',
                cacheControl: '3600',
                upsert: false
              });
            
            if (uploadError) {
              console.error(`Failed to upload photo ${i + 1}:`, uploadError);
            } else {
              // Get public URL
              const { data: urlData } = supabase.storage
                .from('user-photos')
                .getPublicUrl(photoPath);
              
              photoUrls.push(urlData.publicUrl);
              console.log(`✓ Photo ${i + 1} uploaded:`, urlData.publicUrl);
            }
          } else if (typeof photo === 'string' && photo.startsWith('http')) {
            // Already a URL
            photoUrls.push(photo);
          }
        } catch (photoError) {
          console.error(`Error processing photo ${i + 1}:`, photoError);
        }
      }
      console.log(`Processed ${photoUrls.length} character photos`);
    }
    
    const bookData: any = {
      user_id: job.user_id,
      character_name: characterName,
      interests,
      pages: generatedPages,
      photo_urls: photoUrls, // Now contains storage URLs
      consistent_characters: consistentCharacters,
      complexity: complexityLevel,
      selected_page_count: selectedPageCount,
      status: bookStatus,
      cover_image_url: coverImageUrl,
      back_cover_image_url: backCoverImageUrl,
      cover_url: coverUrl, // Cover PDF now generated in edge function
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
