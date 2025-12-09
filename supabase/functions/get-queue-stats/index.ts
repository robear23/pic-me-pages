import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  console.log('=== get-queue-stats invoked ===');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

    // Get queue statistics
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    // Job counts
    const { count: pendingCount } = await supabase
      .from('book_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: processingCount } = await supabase
      .from('book_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing');

    const { count: completedToday } = await supabase
      .from('book_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', oneDayAgo);

    const { count: failedToday } = await supabase
      .from('book_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('completed_at', oneDayAgo);

    // Count partial jobs (books that completed with issues)
    const { count: partialToday } = await supabase
      .from('book_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'partial')
      .gte('completed_at', oneDayAgo);

    // Average duration
    const { data: durationData } = await supabase
      .from('book_generation_jobs')
      .select('processing_duration_ms')
      .eq('status', 'completed')
      .gte('completed_at', oneDayAgo)
      .not('processing_duration_ms', 'is', null);

    const avgDurationMs = durationData && durationData.length > 0
      ? durationData.reduce((sum, j) => sum + (j.processing_duration_ms || 0), 0) / durationData.length
      : 0;

    // Daily spend
    const { data: spendData } = await supabase
      .from('api_usage_logs')
      .select('estimated_cost_usd')
      .gte('created_at', oneDayAgo);

    const dailySpend = spendData 
      ? spendData.reduce((sum, log) => sum + (Number(log.estimated_cost_usd) || 0), 0)
      : 0;

    // Get system config
    const { data: configData } = await supabase
      .from('system_config')
      .select('key, value');

    const config: Record<string, any> = {};
    configData?.forEach(c => {
      config[c.key] = c.value;
    });

    // Get failed jobs for the table
    const { data: failedJobs } = await supabase
      .from('book_generation_jobs')
      .select('id, user_id, error_message, failure_reason, completed_at, retry_count, generation_data')
      .eq('status', 'failed')
      .gte('completed_at', oneDayAgo)
      .order('completed_at', { ascending: false })
      .limit(20);

    // Get stale/processing jobs
    const { data: staleJobs } = await supabase
      .from('book_generation_jobs')
      .select('id, user_id, status, started_at, last_heartbeat, retry_count, worker_id, generation_data')
      .eq('status', 'processing')
      .or(`last_heartbeat.is.null,last_heartbeat.lt.${fiveMinutesAgo}`)
      .order('started_at', { ascending: true })
      .limit(20);

    // Get partial jobs (books that completed with issues)
    const { data: partialJobs } = await supabase
      .from('book_generation_jobs')
      .select('id, user_id, error_message, completed_at, retry_count, generation_data, book_id')
      .eq('status', 'partial')
      .gte('completed_at', oneDayAgo)
      .order('completed_at', { ascending: false })
      .limit(20);

    // Enrich partial jobs with book status to identify mismatches
    const enrichedPartialJobs = await Promise.all(
      (partialJobs || []).map(async (job) => {
        if (job.book_id) {
          const { data: book } = await supabase
            .from('books')
            .select('status')
            .eq('id', job.book_id)
            .single();
          return { ...job, book_status: book?.status || 'unknown' };
        }
        return { ...job, book_status: null };
      })
    );

    const stats = {
      pending_jobs: pendingCount || 0,
      processing_jobs: processingCount || 0,
      completed_today: completedToday || 0,
      failed_today: failedToday || 0,
      partial_today: partialToday || 0,
      daily_spend_usd: Math.round(dailySpend * 100) / 100,
      daily_limit_usd: parseFloat(config.daily_spend_limit_usd || '50'),
      max_concurrent_jobs: parseInt(config.max_concurrent_jobs || '3'),
      avg_generation_time_minutes: Math.round(avgDurationMs / 60000 * 10) / 10,
      success_rate: (completedToday || 0) + (failedToday || 0) + (partialToday || 0) > 0
        ? Math.round(((completedToday || 0) / ((completedToday || 0) + (failedToday || 0) + (partialToday || 0))) * 100)
        : 100,
      failed_jobs: failedJobs || [],
      stale_jobs: staleJobs || [],
      partial_jobs: enrichedPartialJobs || [],
    };

    console.log('Queue stats:', stats);

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-queue-stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
