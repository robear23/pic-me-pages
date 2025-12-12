import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetryOptions {
  bookId: string;
  fromBeginning: boolean;
  useSafePrompts?: boolean;
  grantRetryCredit?: boolean;
  skipProblematicPages?: number[];
}

// Risky activities that commonly trigger MODEL_REFUSED
const RISKY_ACTIVITIES = [
  'rock climbing', 'climbing', 'cliff', 
  'cycling', 'biking', 'bike', 
  'swimming', 'diving', 'water',
  'skiing', 'snowboarding', 
  'skateboarding', 'skating',
  'football', 'soccer', 'rugby',
  'martial arts', 'karate', 'boxing',
  'gymnastics', 'acrobatics',
  'horse riding', 'horseback',
  'archery', 'hunting',
  'surfing', 'wakeboarding'
];

// Safe replacement activities
const SAFE_ACTIVITIES = [
  'reading a wonderful book',
  'painting a colorful picture',
  'playing with building blocks',
  'having a picnic in the park',
  'looking at beautiful flowers',
  'feeding friendly ducks',
  'playing with a ball in the garden',
  'exploring nature',
  'making music',
  'drawing pictures'
];

function sanitizePromptForSafety(prompt: string): string {
  let safePrompt = prompt;
  
  // Replace risky activities with safe alternatives
  for (const activity of RISKY_ACTIVITIES) {
    const regex = new RegExp(`\\b${activity}\\b`, 'gi');
    if (regex.test(safePrompt)) {
      const safeAlt = SAFE_ACTIVITIES[Math.floor(Math.random() * SAFE_ACTIVITIES.length)];
      safePrompt = safePrompt.replace(regex, safeAlt);
      console.log(`🔄 Replaced "${activity}" with "${safeAlt}"`);
    }
  }
  
  // Add safety context to the prompt
  if (!safePrompt.includes('safe') && !safePrompt.includes('wholesome')) {
    safePrompt += ' Safe, wholesome, child-friendly scene.';
  }
  
  return safePrompt;
}

Deno.serve(async (req) => {
  console.log('=== retry-failed-book invoked ===');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Authenticate admin
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const options: RetryOptions = await req.json();
    const { bookId, fromBeginning, useSafePrompts, grantRetryCredit, skipProblematicPages } = options;

    console.log('Retry options:', options);

    // Get the book
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .single();

    if (bookError || !book) {
      return new Response(JSON.stringify({ error: 'Book not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Grant retry credit if requested
    if (grantRetryCredit) {
      const { error: creditError } = await supabase
        .from('retry_credits')
        .insert({
          user_id: book.user_id,
          book_id: bookId,
          reason: 'Admin granted retry credit due to generation failure',
          created_by: user.id,
        });
      
      if (creditError) {
        console.error('Failed to grant retry credit:', creditError);
      } else {
        console.log('✅ Retry credit granted to user', book.user_id);
      }
    }

    // If useSafePrompts, sanitize the stored prompts
    let updatedPrompts = book.generated_prompts;
    if (useSafePrompts && book.generated_prompts) {
      console.log('🔒 Sanitizing prompts for safety...');
      updatedPrompts = book.generated_prompts.map((prompt: any, index: number) => {
        if (skipProblematicPages?.includes(index + 1)) {
          console.log(`⏭️ Skipping page ${index + 1} (marked as problematic)`);
          return { ...prompt, skip: true };
        }
        return {
          ...prompt,
          prompt: sanitizePromptForSafety(prompt.prompt || prompt.text || ''),
          safe_mode: true,
        };
      });
    }

    // Find existing job
    const { data: existingJob } = await supabase
      .from('book_generation_jobs')
      .select('*')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Determine starting page
    let startPage = 0;
    if (!fromBeginning && book.pages) {
      const completedPages = book.pages.filter((p: any) => p?.imageUrl);
      startPage = completedPages.length;
      console.log(`📍 Resuming from page ${startPage + 1}`);
    }

    // Update book for retry
    const bookUpdate: any = {
      status: 'processing',
      last_error_message: null,
      last_error_timestamp: null,
      failed_step: null,
    };
    
    if (fromBeginning) {
      bookUpdate.pages = null;
      bookUpdate.generation_attempts = 0;
      bookUpdate.error_log = [];
    }
    
    if (useSafePrompts) {
      bookUpdate.generated_prompts = updatedPrompts;
    }

    await supabase
      .from('books')
      .update(bookUpdate)
      .eq('id', bookId);

    // Reset or create job
    if (existingJob) {
      console.log('📝 Resetting existing job:', existingJob.id);
      
      // Update generation_data with safe mode flag
      const updatedGenerationData = {
        ...existingJob.generation_data,
        useSafePrompts: useSafePrompts || false,
        skipProblematicPages: skipProblematicPages || [],
        retryFromBeginning: fromBeginning,
      };
      
      await supabase
        .from('book_generation_jobs')
        .update({
          status: 'pending',
          error_message: null,
          failure_reason: null,
          started_at: null,
          completed_at: null,
          last_heartbeat: null,
          retry_count: (existingJob.retry_count || 0) + 1,
          progress: {
            currentPage: fromBeginning ? 0 : startPage,
            totalPages: book.selected_page_count || 12,
            currentStep: useSafePrompts ? 'Retrying with safe prompts' : 'Retrying generation',
          },
          generation_data: updatedGenerationData,
        })
        .eq('id', existingJob.id);
    } else {
      console.log('📝 Creating new job for retry');
      
      await supabase
        .from('book_generation_jobs')
        .insert({
          user_id: book.user_id,
          book_id: bookId,
          status: 'pending',
          generation_data: {
            characters: [{ name: book.character_name, photos: book.photo_urls }],
            interests: book.interests,
            customPrompt: book.custom_prompt,
            consistentCharacters: book.consistent_characters,
            complexityLevel: book.complexity || 'medium',
            selectedPageCount: book.selected_page_count || 12,
            useSafePrompts: useSafePrompts || false,
            skipProblematicPages: skipProblematicPages || [],
          },
          progress: {
            currentPage: fromBeginning ? 0 : startPage,
            totalPages: book.selected_page_count || 12,
            currentStep: useSafePrompts ? 'Retrying with safe prompts' : 'Retrying generation',
          },
        });
    }

    // Trigger queue worker
    console.log('🚀 Triggering queue worker...');
    try {
      await supabase.functions.invoke('queue-worker', {});
    } catch (e) {
      console.log('Queue worker trigger response (may be async):', e);
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: useSafePrompts 
        ? 'Book queued for retry with safe prompts' 
        : 'Book queued for retry',
      bookId,
      startPage: fromBeginning ? 1 : startPage + 1,
      retryCredit: grantRetryCredit ? 'granted' : 'not requested',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in retry-failed-book:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
