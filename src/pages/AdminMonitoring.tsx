import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { Navigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface JobStats {
  pending_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
  avg_duration_minutes: number;
}

interface StaleJob {
  id: string;
  user_id: string;
  status: string;
  started_at: string;
  last_heartbeat: string | null;
  retry_count: number;
  generation_data: any;
}

export default function AdminMonitoring() {
  const { isAdmin, loading } = useAdmin();
  const [stats, setStats] = useState<JobStats | null>(null);
  const [staleJobs, setStaleJobs] = useState<StaleJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    setRefreshing(true);
    try {
      // Get job statistics
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_job_stats', { time_window_hours: 24 });

      if (statsError) throw statsError;
      if (statsData && statsData.length > 0) {
        setStats(statsData[0]);
      }

      // Get stale jobs (processing but no heartbeat for 2+ minutes)
      const { data: staleData, error: staleError } = await supabase
        .from('book_generation_jobs')
        .select('*')
        .eq('status', 'processing')
        .or('last_heartbeat.is.null,last_heartbeat.lt.' + new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .order('started_at', { ascending: true });

      if (staleError) throw staleError;
      setStaleJobs(staleData || []);
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
      const interval = setInterval(loadStats, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  const resetJob = async (jobId: string) => {
    try {
      // Get current retry count first
      const { data: job } = await supabase
        .from('book_generation_jobs')
        .select('retry_count')
        .eq('id', jobId)
        .single();

      const { error } = await supabase
        .from('book_generation_jobs')
        .update({
          status: 'pending',
          started_at: null,
          last_heartbeat: null,
          retry_count: (job?.retry_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      if (error) throw error;

      toast.success('Job reset to pending');
      loadStats();
    } catch (error) {
      console.error('Failed to reset job:', error);
      toast.error('Failed to reset job');
    }
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
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">System Monitoring</h1>
            <p className="text-muted-foreground">Real-time job queue and system health</p>
          </div>
          <Button onClick={loadStats} disabled={refreshing} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Job Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-600" />
                <p className="text-3xl font-bold">{stats?.pending_count || 0}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Processing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                <p className="text-3xl font-bold">{stats?.processing_count || 0}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="text-3xl font-bold">{stats?.completed_count || 0}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Failed (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <p className="text-3xl font-bold text-red-600">{stats?.failed_count || 0}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats?.avg_duration_minutes || 0} min</p>
            </CardContent>
          </Card>
        </div>

        {/* Stale Jobs Alert */}
        {staleJobs.length > 0 && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                <AlertTriangle className="w-5 h-5" />
                ⚠️ Stale Jobs Detected ({staleJobs.length})
              </CardTitle>
              <CardDescription className="text-yellow-700 dark:text-yellow-300">
                These jobs are processing but haven't sent a heartbeat recently
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {staleJobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="space-y-1">
                      <p className="font-mono text-sm">{job.id}</p>
                      <p className="text-xs text-muted-foreground">User: {job.user_id}</p>
                      <p className="text-xs text-muted-foreground">
                        Started: {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}
                      </p>
                      {job.last_heartbeat && (
                        <p className="text-xs text-muted-foreground">
                          Last heartbeat: {formatDistanceToNow(new Date(job.last_heartbeat), { addSuffix: true })}
                        </p>
                      )}
                      {!job.last_heartbeat && (
                        <p className="text-xs text-red-600 dark:text-red-400">⚠️ No heartbeat received</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Retry: {job.retry_count || 0}</Badge>
                      <Button size="sm" onClick={() => resetJob(job.id)}>
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Reset
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Pages: {job.generation_data?.selectedPageCount || 0} • 
                    Complexity: {job.generation_data?.complexityLevel || 'unknown'}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>Overall system status and metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">Queue Depth</span>
                <Badge variant={stats && stats.pending_count > 10 ? 'destructive' : 'secondary'}>
                  {stats?.pending_count || 0} jobs
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Success Rate (24h)</span>
                <Badge variant="secondary">
                  {stats && (stats.completed_count + stats.failed_count) > 0
                    ? Math.round((stats.completed_count / (stats.completed_count + stats.failed_count)) * 100)
                    : 0}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Active Processors</span>
                <Badge variant="secondary">{stats?.processing_count || 0}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
