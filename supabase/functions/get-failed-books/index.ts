import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FailedBook {
  id: string;
  user_id: string;
  character_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  error_log: any[];
  generation_attempts: number;
  last_error_message: string | null;
  last_error_timestamp: string | null;
  failed_step: string | null;
  generation_duration_seconds: number | null;
  complexity: string | null;
  interests: string[];
  selected_page_count: number;
  pages: any[];
  job?: {
    id: string;
    error_message: string | null;
    failure_reason: string | null;
    retry_count: number;
    attempts: number;
    progress: any;
    generation_data: any;
  } | null;
}

Deno.serve(async (req) => {
  console.log('=== get-failed-books invoked ===');

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

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const timeRange = body.timeRange || '7d';
    const offset = body.offset || 0;
    const limit = Math.min(body.limit || 50, 100);

    // Calculate date filter based on timeRange
    const now = new Date();
    let dateFilter: string | null = null;
    
    if (timeRange === '24h') {
      dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    } else if (timeRange === '7d') {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (timeRange === '30d') {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (timeRange === 'all') {
      dateFilter = null;
    } else if (typeof timeRange === 'object' && timeRange.from) {
      dateFilter = timeRange.from;
    }

    console.log('Fetching failed books with params:', { timeRange, dateFilter, offset, limit });

    // Build query for failed books - include both 'failed' status AND 'generating' books with failed jobs
    let query = supabase
      .from('books')
      .select('id, user_id, character_name, status, created_at, updated_at, error_log, generation_attempts, last_error_message, last_error_timestamp, failed_step, generation_duration_seconds, complexity, interests, selected_page_count, pages', { count: 'exact' })
      .in('status', ['failed', 'generating']) // Include stuck 'generating' books
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (dateFilter) {
      query = query.gte('updated_at', dateFilter);
    }

    const { data: allBooks, count: totalCount, error: booksError } = await query;

    if (booksError) {
      console.error('Error fetching failed books:', booksError);
      throw new Error(booksError.message);
    }

    // Enrich with job data and filter to only include books with failed jobs
    const enrichedBooksPromises = (allBooks || []).map(async (book: any) => {
      // Get associated job
      const { data: jobData } = await supabase
        .from('book_generation_jobs')
        .select('id, error_message, failure_reason, retry_count, attempts, progress, generation_data, status')
        .eq('book_id', book.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // For 'generating' books, only include if job has failed
      if (book.status === 'generating' && (!jobData || jobData.status !== 'failed')) {
        return null; // Filter out - not actually failed
      }

      return {
        ...book,
        error_log: book.error_log || [],
        generation_attempts: book.generation_attempts || 0,
        pages: book.pages || [],
        job: jobData || null,
      };
    });

    const enrichedBooksRaw = await Promise.all(enrichedBooksPromises);
    const enrichedBooks: FailedBook[] = enrichedBooksRaw.filter((b): b is FailedBook => b !== null);

    // Get accurate count including stuck 'generating' books with failed jobs
    const actualCount = enrichedBooks.length;

    const response = {
      books: enrichedBooks,
      pagination: {
        offset,
        limit,
        total: actualCount,
        hasMore: (offset + limit) < (totalCount || 0), // Use totalCount for pagination hint
      },
      stats: {
        totalFailed: actualCount,
        timeRange,
      }
    };

    console.log(`Returning ${enrichedBooks.length} failed/stuck books`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-failed-books:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
