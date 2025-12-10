import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { Navigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle, Clock, DollarSign, RefreshCw, Settings, XCircle, Zap, AlertCircle, Play, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface PartialJob {
  id: string;
  user_id: string;
  error_message: string | null;
  completed_at: string;
  retry_count: number;
  generation_data: any;
  book_id: string | null;
  book_status?: string | null;
}

interface ProcessingJob {
  id: string;
  user_id: string;
  status: string;
  started_at: string;
  last_heartbeat: string | null;
  progress: {
    currentPage: number;
    totalPages: number;
    currentStep: string;
  } | null;
  worker_id: string | null;
  generation_data: any;
  book_id: string | null;
}

interface PendingJob {
  id: string;
  user_id: string;
  priority: number;
  created_at: string;
  scheduled_at: string;
  generation_data: any;
  progress: {
    currentPage: number;
    totalPages: number;
    currentStep: string;
  } | null;
}

interface QueueStats {
  pending_jobs: number;
  processing_jobs: number;
  completed_today: number;
  failed_today: number;
  partial_today: number;
  daily_spend_usd: number;
  daily_limit_usd: number;
  max_concurrent_jobs: number;
  avg_generation_time_minutes: number;
  success_rate: number;
  failed_jobs: FailedJob[];
  stale_jobs: StaleJob[];
  partial_jobs: PartialJob[];
  processing_jobs_list: ProcessingJob[];
  pending_jobs_list: PendingJob[];
}

interface FailedJob {
  id: string;
  user_id: string;
  error_message: string;
  failure_reason: string;
  completed_at: string;
  retry_count: number;
  generation_data: any;
}

interface StaleJob {
  id: string;
  user_id: string;
  status: string;
  started_at: string;
  last_heartbeat: string | null;
  retry_count: number;
  worker_id: string | null;
  generation_data: any;
}

export default function AdminMonitoring() {
  const { isAdmin, loading } = useAdmin();
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [configValues, setConfigValues] = useState({
    max_concurrent_jobs: 3,
    daily_spend_limit_usd: 50,
  });

  const loadStats = async () => {
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('get-queue-stats');
      
      if (response.error) throw response.error;
      
      setStats(response.data);
      setConfigValues({
        max_concurrent_jobs: response.data.max_concurrent_jobs || 3,
        daily_spend_limit_usd: response.data.daily_limit_usd || 50,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
      toast.error('Failed to load monitoring data');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadStats();
      // Auto-refresh every 10 seconds when enabled (faster for active monitoring)
      if (autoRefresh) {
        const interval = setInterval(loadStats, 10000);
        return () => clearInterval(interval);
      }
    }
  }, [isAdmin, autoRefresh]);

  const resetJob = async (jobId: string) => {
    try {
      toast.info('Resetting job...');
      
      const { data: job, error: fetchError } = await supabase
        .from('book_generation_jobs')
        .select('retry_count, error_message')
        .eq('id', jobId)
        .single();

      if (fetchError) {
        console.error('Failed to fetch job:', fetchError);
        throw new Error(`Could not fetch job: ${fetchError.message}`);
      }

      const { error } = await supabase
        .from('book_generation_jobs')
        .update({
          status: 'pending',
          started_at: null,
          last_heartbeat: null,
          worker_id: null,
          error_message: null,
          failure_reason: null,
          retry_count: (job?.retry_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      if (error) throw error;

      toast.success('Job reset to pending - triggering worker...');
      
      // Automatically trigger the queue worker after reset
      await triggerQueueWorker();
      loadStats();
    } catch (error) {
      console.error('Failed to reset job:', error);
      toast.error(`Failed to reset job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const markJobComplete = async (jobId: string, bookId: string) => {
    try {
      toast.info('Syncing job status with book...');
      
      // Verify the book is actually completed
      const { data: book, error: bookError } = await supabase
        .from('books')
        .select('status')
        .eq('id', bookId)
        .single();

      if (bookError) {
        console.error('Book fetch error:', bookError);
        throw new Error(`Could not verify book status: ${bookError.message}`);
      }
      
      if (!book) {
        toast.error('Book not found');
        return;
      }
      
      if (book.status !== 'completed') {
        toast.error(`Book status is "${book.status}", not completed`);
        return;
      }

      // Update job to match book status
      const { error } = await supabase
        .from('book_generation_jobs')
        .update({
          status: 'completed',
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      if (error) throw error;

      toast.success('Job status synced to completed');
      loadStats();
    } catch (error) {
      console.error('Failed to mark job complete:', error);
      toast.error(`Failed to sync status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const bumpPriority = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('book_generation_jobs')
        .update({ priority: 100, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      if (error) throw error;

      toast.success('Job priority increased');
      loadStats();
    } catch (error) {
      console.error('Failed to bump priority:', error);
      toast.error('Failed to update priority');
    }
  };

  const forceStartJob = async (jobId: string) => {
    try {
      toast.info('Force starting job...');
      
      // Bump priority and trigger worker
      await supabase
        .from('book_generation_jobs')
        .update({ priority: 999, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      await triggerQueueWorker();
      loadStats();
    } catch (error) {
      console.error('Failed to force start job:', error);
      toast.error('Failed to force start job');
    }
  };

  const triggerQueueWorker = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/queue-worker`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const result = await response.json();
      console.log('Queue worker result:', result);
      toast.success('Queue worker triggered');
      loadStats();
    } catch (error) {
      console.error('Failed to trigger queue worker:', error);
      toast.error('Failed to trigger queue worker');
    }
  };

  const updateConfig = async () => {
    try {
      const updates = [
        { key: 'max_concurrent_jobs', value: String(configValues.max_concurrent_jobs), updated_at: new Date().toISOString() },
        { key: 'daily_spend_limit_usd', value: String(configValues.daily_spend_limit_usd), updated_at: new Date().toISOString() },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('system_config')
          .upsert(update);
        if (error) throw error;
      }

      toast.success('Configuration updated');
      setEditingConfig(false);
      loadStats();
    } catch (error) {
      console.error('Failed to update config:', error);
      toast.error('Failed to update configuration');
    }
  };

  const getHeartbeatStatus = (lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return { status: 'stale', color: 'text-red-600', label: 'No heartbeat' };
    const age = Date.now() - new Date(lastHeartbeat).getTime();
    if (age < 60000) return { status: 'healthy', color: 'text-green-600', label: 'Healthy' };
    if (age < 180000) return { status: 'warning', color: 'text-yellow-600', label: 'Slow' };
    return { status: 'stale', color: 'text-red-600', label: 'Stale' };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 dark:from-gray-900 dark:via-purple-900 dark:to-pink-900 py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">Queue Monitoring</h1>
            <p className="text-muted-foreground">Real-time job queue, costs, and system health</p>
          </div>
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <Button onClick={triggerQueueWorker} variant="secondary">
              <Zap className="w-4 h-4 mr-2" />
              Trigger Worker
            </Button>
            <Button onClick={loadStats} disabled={refreshing} variant="outline">
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats?.pending_jobs || 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                Processing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats?.processing_jobs || 0}</p>
              <p className="text-xs text-muted-foreground">max: {stats?.max_concurrent_jobs || 3}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Completed (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{stats?.completed_today || 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                Failed (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">{stats?.failed_today || 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Daily Spend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">${stats?.daily_spend_usd || 0}</p>
              <p className="text-xs text-muted-foreground">limit: ${stats?.daily_limit_usd || 50}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                Partial (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-orange-600">{stats?.partial_today || 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${(stats?.success_rate || 0) >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                {stats?.success_rate || 0}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Currently Processing Jobs */}
        {stats?.processing_jobs_list && stats.processing_jobs_list.length > 0 && (
          <Card className="border-blue-300 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
                <Activity className="w-5 h-5 animate-pulse" />
                Currently Processing ({stats.processing_jobs_list.length})
              </CardTitle>
              <CardDescription>Jobs actively being generated</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.processing_jobs_list.map((job) => {
                const heartbeat = getHeartbeatStatus(job.last_heartbeat);
                const progress = job.progress;
                const elapsed = job.started_at 
                  ? Math.round((Date.now() - new Date(job.started_at).getTime()) / 60000) 
                  : 0;
                
                return (
                  <div key={job.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm">{job.id.substring(0, 8)}...</p>
                          <Badge className={`${heartbeat.color} bg-opacity-20`}>
                            💓 {heartbeat.label}
                          </Badge>
                        </div>
                        
                        {/* Progress bar */}
                        {progress && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>{progress.currentStep}</span>
                              <span>{progress.currentPage}/{progress.totalPages} pages</span>
                            </div>
                            <div className="w-64 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${(progress.currentPage / progress.totalPages) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                        
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Started: {elapsed} min ago</span>
                          {job.worker_id && <span>Worker: {job.worker_id.substring(0, 15)}...</span>}
                          {job.book_id && <span>Book: {job.book_id.substring(0, 8)}...</span>}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => resetJob(job.id)}>
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Reset
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Pending Jobs Queue */}
        {stats?.pending_jobs_list && stats.pending_jobs_list.length > 0 && (
          <Card className="border-yellow-300 dark:border-yellow-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                <Clock className="w-5 h-5" />
                Pending Queue ({stats.pending_jobs_list.length})
              </CardTitle>
              <CardDescription>Jobs waiting to be processed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.pending_jobs_list.map((job, index) => {
                const waitTime = Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000);
                const progress = job.progress;
                const isResuming = progress && progress.currentPage > 0;
                
                return (
                  <div key={job.id} className={`bg-white dark:bg-gray-800 p-4 rounded-lg border ${isResuming ? 'border-purple-300 dark:border-purple-700' : 'border-yellow-200 dark:border-yellow-800'}`}>
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">#{index + 1}</span>
                          <p className="font-mono text-sm">{job.id.substring(0, 8)}...</p>
                          <Badge variant="outline">Priority: {job.priority}</Badge>
                          {isResuming && (
                            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                              Resuming ({progress!.currentPage}/{progress!.totalPages})
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Waiting: {waitTime} min • Created: {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => bumpPriority(job.id)}>
                          ⬆️ Bump
                        </Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => forceStartJob(job.id)}>
                          <Play className="w-4 h-4 mr-1" />
                          Start Now
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Config Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              System Configuration
            </CardTitle>
            <CardDescription>Adjust queue processing parameters</CardDescription>
          </CardHeader>
          <CardContent>
            {editingConfig ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="max_concurrent">Max Concurrent Jobs</Label>
                    <Input
                      id="max_concurrent"
                      type="number"
                      min={1}
                      max={10}
                      value={configValues.max_concurrent_jobs}
                      onChange={(e) => setConfigValues(prev => ({ ...prev, max_concurrent_jobs: parseInt(e.target.value) || 3 }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="daily_limit">Daily Spend Limit (USD)</Label>
                    <Input
                      id="daily_limit"
                      type="number"
                      min={10}
                      max={500}
                      value={configValues.daily_spend_limit_usd}
                      onChange={(e) => setConfigValues(prev => ({ ...prev, daily_spend_limit_usd: parseInt(e.target.value) || 50 }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={updateConfig}>Save Changes</Button>
                  <Button variant="outline" onClick={() => setEditingConfig(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-sm">Max Concurrent: <strong>{stats?.max_concurrent_jobs || 3}</strong></p>
                  <p className="text-sm">Daily Limit: <strong>${stats?.daily_limit_usd || 50}</strong></p>
                  <p className="text-sm">Avg Generation Time: <strong>{stats?.avg_generation_time_minutes || 0} min</strong></p>
                </div>
                <Button variant="outline" onClick={() => setEditingConfig(true)}>
                  Edit
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stale Jobs Alert */}
        {stats?.stale_jobs && stats.stale_jobs.length > 0 && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                <AlertTriangle className="w-5 h-5" />
                Stale Jobs ({stats.stale_jobs.length})
              </CardTitle>
              <CardDescription className="text-yellow-700 dark:text-yellow-300">
                Jobs processing without recent heartbeat - may be stuck
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.stale_jobs.map((job) => (
                <div key={job.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <p className="font-mono text-sm">{job.id}</p>
                      <p className="text-xs text-muted-foreground">
                        Started: {job.started_at ? formatDistanceToNow(new Date(job.started_at), { addSuffix: true }) : 'N/A'}
                      </p>
                      {job.last_heartbeat ? (
                        <p className="text-xs text-muted-foreground">
                          Last heartbeat: {formatDistanceToNow(new Date(job.last_heartbeat), { addSuffix: true })}
                        </p>
                      ) : (
                        <p className="text-xs text-red-600">⚠️ No heartbeat</p>
                      )}
                      {job.worker_id && (
                        <p className="text-xs text-muted-foreground">Worker: {job.worker_id}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Retry: {job.retry_count || 0}</Badge>
                      <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={() => resetJob(job.id)}>
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Reset
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Failed Jobs */}
        {stats?.failed_jobs && stats.failed_jobs.length > 0 && (
          <Card className="border-red-300 dark:border-red-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200">
                <XCircle className="w-5 h-5" />
                Recent Failed Jobs ({stats.failed_jobs.length})
              </CardTitle>
              <CardDescription>Jobs that failed in the last 24 hours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.failed_jobs.slice(0, 10).map((job) => (
                <div key={job.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <p className="font-mono text-sm">{job.id}</p>
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {job.error_message || 'Unknown error'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Failed: {formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={job.failure_reason === 'system_error' ? 'destructive' : 'secondary'}>
                        {job.failure_reason || 'unknown'}
                      </Badge>
                      <Badge variant="outline">Retry: {job.retry_count || 0}</Badge>
                      <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => resetJob(job.id)}>
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Retry
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Partial Jobs */}
        {stats?.partial_jobs && stats.partial_jobs.length > 0 && (
          <Card className="border-orange-300 dark:border-orange-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                <AlertCircle className="w-5 h-5" />
                Partial Jobs ({stats.partial_jobs.length})
              </CardTitle>
              <CardDescription>Jobs that completed with some issues in the last 24 hours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.partial_jobs.slice(0, 10).map((job) => (
                <div key={job.id} className={`bg-white dark:bg-gray-800 p-4 rounded-lg border ${job.book_status === 'completed' ? 'border-green-300 dark:border-green-700' : 'border-orange-200 dark:border-orange-800'}`}>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm">{job.id}</p>
                        {job.book_status === 'completed' && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Book Completed ✓
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        {job.book_status === 'completed' 
                          ? 'Job status mismatch - book is actually completed' 
                          : job.error_message || 'Completed with issues'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Completed: {formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}
                      </p>
                      {job.book_id && (
                        <p className="text-xs text-muted-foreground">
                          Book: {job.book_id} {job.book_status && `(${job.book_status})`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Retry: {job.retry_count || 0}</Badge>
                      {job.book_id && job.book_status === 'completed' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => markJobComplete(job.id, job.book_id!)}>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Sync Status
                        </Button>
                      )}
                      {(!job.book_status || job.book_status !== 'completed') && (
                        <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => resetJob(job.id)}>
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {stats && stats.stale_jobs?.length === 0 && stats.failed_jobs?.length === 0 && stats.partial_jobs?.length === 0 && !stats.processing_jobs_list?.length && !stats.pending_jobs_list?.length && (
          <Card className="border-green-300 bg-green-50 dark:bg-green-900/20">
            <CardContent className="py-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <p className="text-lg font-medium text-green-800 dark:text-green-200">All Systems Healthy</p>
              <p className="text-sm text-green-600 dark:text-green-400">No active, stale, failed, or partial jobs detected</p>
            </CardContent>
          </Card>
        )}

        {/* Trigger Worker Info */}
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">About the Queue System</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>Trigger Worker:</strong> Manually invokes the queue-worker to process pending jobs. Useful if jobs are stuck or pg_cron is delayed.</p>
            <p><strong>Reset Job:</strong> Resets a stuck/failed job to pending status so it can be picked up again.</p>
            <p><strong>Partial Jobs:</strong> Books where some pages generated but covers or some pages failed. Users can still preview these.</p>
            <p><strong>Sync Status:</strong> Updates job status to match book status when they're out of sync.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
