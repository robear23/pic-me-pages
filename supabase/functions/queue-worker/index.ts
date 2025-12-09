import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to extract value from JSONB - handles both raw values and wrapped strings
function extractValue(jsonbValue: any): string {
  console.log('extractValue input:', typeof jsonbValue, jsonbValue);
  if (jsonbValue === null || jsonbValue === undefined) return '';
  if (typeof jsonbValue === 'string') {
    return jsonbValue; // Don't parse - just use as-is
  }
  return String(jsonbValue);
}

Deno.serve(async (req) => {
  console.log('=== queue-worker invoked ===');
  console.log('Time:', new Date().toISOString());
  console.log('Method:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique worker ID for this invocation
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log('Worker ID:', workerId);

    // Step 1: Check daily spend limit
    const { data: spendConfig, error: spendError } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'current_daily_spend_usd')
      .single();

    if (spendError) {
      console.log('No spend config found, using defaults');
    }

    const { data: limitConfig } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'daily_spend_limit_usd')
      .single();

    const currentSpend = parseFloat(extractValue(spendConfig?.value) || '0');
    const dailyLimit = parseFloat(extractValue(limitConfig?.value) || '50');

    console.log(`Daily spend: $${currentSpend}/$${dailyLimit}`);

    // Reset daily spend if new day
    const { data: resetConfig } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'daily_spend_reset_at')
      .single();

    const resetValue = extractValue(resetConfig?.value);
    const lastReset = resetValue ? new Date(resetValue) : new Date(0);
    const now = new Date();
    
    if (lastReset.toDateString() !== now.toDateString()) {
      console.log('Resetting daily spend counter for new day');
      await supabase.from('system_config').upsert([
        { key: 'current_daily_spend_usd', value: 0, updated_at: now.toISOString() },
        { key: 'daily_spend_reset_at', value: now.toISOString(), updated_at: now.toISOString() }
      ]);
    }

    if (currentSpend >= dailyLimit) {
      console.log(`⚠️ Daily spend limit reached: $${currentSpend}/$${dailyLimit}`);
      return new Response(JSON.stringify({ 
        message: 'Daily spend limit reached',
        current_spend: currentSpend,
        daily_limit: dailyLimit
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Check current concurrent jobs
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: activeJobs, error: countError } = await supabase
      .from('book_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing')
      .gte('last_heartbeat', fiveMinutesAgo);

    if (countError) {
      console.error('Error counting active jobs:', countError);
      throw countError;
    }

    // Get max concurrent jobs from config
    const { data: concurrentConfig } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'max_concurrent_jobs')
      .single();

    const maxConcurrent = parseInt(extractValue(concurrentConfig?.value) || '3');
    console.log(`Active jobs: ${activeJobs || 0}/${maxConcurrent}`);

    if ((activeJobs || 0) >= maxConcurrent) {
      console.log('Max concurrent jobs reached, waiting for slots');
      return new Response(JSON.stringify({ 
        message: 'Max concurrent jobs reached',
        active_jobs: activeJobs,
        max_concurrent: maxConcurrent
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Claim the oldest pending job with highest priority
    const { data: pendingJobs, error: fetchError } = await supabase
      .from('book_generation_jobs')
      .select('*')
      .eq('status', 'pending')
      .is('worker_id', null)
      .order('priority', { ascending: false })
      .order('scheduled_at', { ascending: true })
      .limit(1);

    if (fetchError) {
      console.error('Error fetching pending jobs:', fetchError);
      throw fetchError;
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('No pending jobs available');
      return new Response(JSON.stringify({ message: 'No pending jobs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const job = pendingJobs[0];
    console.log(`Found job ${job.id}, attempting to claim...`);

    // Atomically claim the job using optimistic locking
    const { data: claimedJob, error: claimError } = await supabase
      .from('book_generation_jobs')
      .update({
        worker_id: workerId,
        attempts: (job.attempts || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .is('worker_id', null)
      .select()
      .single();

    if (claimError || !claimedJob) {
      console.log(`Job ${job.id} was claimed by another worker`);
      return new Response(JSON.stringify({ 
        message: 'Job claimed by another worker',
        job_id: job.id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Successfully claimed job ${job.id}`);

    // Step 4: Invoke the process-book-generation function
    console.log('Invoking process-book-generation...');
    
    const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-book-generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ jobId: job.id }),
    });

    const processResult = await processResponse.json();
    console.log('process-book-generation result:', processResult);

    // Release worker claim after completion (job status handled by process-book-generation)
    await supabase
      .from('book_generation_jobs')
      .update({ worker_id: null })
      .eq('id', job.id);

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      worker_id: workerId,
      result: processResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in queue-worker:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
