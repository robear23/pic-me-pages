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

    // Parse request body for time range
    const body = await req.json().catch(() => ({}));
    const timeRange = body.timeRange || '24h';
    
    // Calculate date filter based on timeRange
    const now = new Date();
    let dateFilter: string;
    
    if (timeRange === '24h') {
      dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    } else if (timeRange === '7d') {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (timeRange === '30d') {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (timeRange === 'all') {
      dateFilter = new Date(0).toISOString(); // Beginning of time
    } else {
      dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
    
    console.log('Time range:', timeRange, 'Date filter:', dateFilter);
    
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

    const { count: completedInRange } = await supabase
      .from('book_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', dateFilter);

    const { count: failedInRange } = await supabase
      .from('book_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('completed_at', dateFilter);

    // Count partial jobs (books that completed with issues)
    const { count: partialInRange } = await supabase
      .from('book_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'partial')
      .gte('completed_at', dateFilter);

    // Average duration
    const { data: durationData } = await supabase
      .from('book_generation_jobs')
      .select('processing_duration_ms')
      .eq('status', 'completed')
      .gte('completed_at', dateFilter)
      .not('processing_duration_ms', 'is', null);

    const avgDurationMs = durationData && durationData.length > 0
      ? durationData.reduce((sum, j) => sum + (j.processing_duration_ms || 0), 0) / durationData.length
      : 0;

    // Daily spend (always last 24h for budget tracking)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
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

    // Get failed jobs for the table (include book_id and max_retries)
    const { data: failedJobsRaw } = await supabase
      .from('book_generation_jobs')
      .select('id, user_id, error_message, failure_reason, completed_at, retry_count, max_retries, generation_data, book_id, attempts')
      .eq('status', 'failed')
      .gte('completed_at', dateFilter)
      .order('completed_at', { ascending: false })
      .limit(50);

    // Enrich failed jobs with book status
    const failedJobs = await Promise.all(
      (failedJobsRaw || []).map(async (job) => {
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

    // Get stale/processing jobs (processing with stale heartbeat)
    const { data: staleJobs } = await supabase
      .from('book_generation_jobs')
      .select('id, user_id, status, started_at, last_heartbeat, retry_count, worker_id, generation_data')
      .eq('status', 'processing')
      .or(`last_heartbeat.is.null,last_heartbeat.lt.${fiveMinutesAgo}`)
      .order('started_at', { ascending: true })
      .limit(20);

    // Get ALL currently processing jobs (for real-time monitoring)
    const { data: processingJobsList } = await supabase
      .from('book_generation_jobs')
      .select('id, user_id, status, started_at, last_heartbeat, progress, worker_id, generation_data, book_id')
      .eq('status', 'processing')
      .order('started_at', { ascending: true })
      .limit(20);

    // Get ALL pending jobs (for queue visibility)
    const { data: pendingJobsList } = await supabase
      .from('book_generation_jobs')
      .select('id, user_id, priority, created_at, scheduled_at, generation_data, progress')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('scheduled_at', { ascending: true })
      .limit(20);

    // Get partial jobs (books that completed with issues)
    const { data: partialJobs } = await supabase
      .from('book_generation_jobs')
      .select('id, user_id, error_message, completed_at, retry_count, generation_data, book_id')
      .eq('status', 'partial')
      .gte('completed_at', dateFilter)
      .order('completed_at', { ascending: false })
      .limit(50);

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

    // Count failed books (not just jobs) in range
    let failedBooksQuery = supabase
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed');
    
    if (timeRange !== 'all') {
      failedBooksQuery = failedBooksQuery.gte('updated_at', dateFilter);
    }
    
    const { count: failedBooksCount } = await failedBooksQuery;

    const stats = {
      pending_jobs: pendingCount || 0,
      processing_jobs: processingCount || 0,
      completed_in_range: completedInRange || 0,
      failed_in_range: failedInRange || 0,
      partial_in_range: partialInRange || 0,
      failed_books_count: failedBooksCount || 0,
      daily_spend_usd: Math.round(dailySpend * 100) / 100,
      daily_limit_usd: parseFloat(config.daily_spend_limit_usd || '50'),
      max_concurrent_jobs: parseInt(config.max_concurrent_jobs || '3'),
      avg_generation_time_minutes: Math.round(avgDurationMs / 60000 * 10) / 10,
      success_rate: (completedInRange || 0) + (failedInRange || 0) + (partialInRange || 0) > 0
        ? Math.round(((completedInRange || 0) / ((completedInRange || 0) + (failedInRange || 0) + (partialInRange || 0))) * 100)
        : 100,
      time_range: timeRange,
      failed_jobs: failedJobs || [],
      stale_jobs: staleJobs || [],
      partial_jobs: enrichedPartialJobs || [],
      processing_jobs_list: processingJobsList || [],
      pending_jobs_list: pendingJobsList || [],
    };

    console.log('Queue stats:', {
      ...stats,
      processing_jobs_list: `${stats.processing_jobs_list.length} jobs`,
      pending_jobs_list: `${stats.pending_jobs_list.length} jobs`,
    });

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