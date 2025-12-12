import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { formatDistanceToNow, format } from 'date-fns';
import { Download, RefreshCw, Zap, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';

interface ErrorLogEntry {
  timestamp: string;
  attempt: number;
  step: string;
  error_type: string;
  error_message: string;
  error_details?: {
    page_number?: number;
    api_response?: string;
    stack_trace?: string;
  };
}

interface FailedBook {
  id: string;
  user_id: string;
  character_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  error_log: ErrorLogEntry[];
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

interface FailedBookDetailModalProps {
  book: FailedBook | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: (bookId: string, fromBeginning: boolean) => void;
}

export function FailedBookDetailModal({ book, open, onOpenChange, onRetry }: FailedBookDetailModalProps) {
  if (!book) return null;

  const completedPages = book.pages?.filter((p: any) => p?.imageUrl)?.length || 0;
  const errorLog = book.error_log || [];
  const hasPartialProgress = completedPages > 0;

  const getStepIcon = (step: string) => {
    if (step.includes('completed') || step.includes('success')) {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    }
    if (step.includes('failed') || step.includes('error')) {
      return <XCircle className="w-4 h-4 text-red-600" />;
    }
    return <Clock className="w-4 h-4 text-yellow-600" />;
  };

  const getErrorTypeBadge = (errorType: string) => {
    const colors: Record<string, string> = {
      'API_ERROR': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      'TIMEOUT': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'MODEL_REFUSED': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'RATE_LIMITED': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'SYSTEM_ERROR': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    };
    return colors[errorType] || 'bg-gray-100 text-gray-800';
  };

  const downloadDebugPackage = () => {
    const debugData = {
      book: {
        id: book.id,
        user_id: book.user_id,
        character_name: book.character_name,
        status: book.status,
        created_at: book.created_at,
        updated_at: book.updated_at,
        complexity: book.complexity,
        interests: book.interests,
        selected_page_count: book.selected_page_count,
        completed_pages: completedPages,
        generation_attempts: book.generation_attempts,
        failed_step: book.failed_step,
        last_error_message: book.last_error_message,
        generation_duration_seconds: book.generation_duration_seconds,
      },
      error_log: book.error_log,
      job: book.job,
      pages_summary: book.pages?.map((p: any, i: number) => ({
        page: i + 1,
        hasImage: !!p?.imageUrl,
        prompt: p?.prompt?.substring(0, 100) + '...',
      })),
    };

    const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-book-${book.id.substring(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Failed Book Details
          </DialogTitle>
          <DialogDescription>
            {book.character_name}'s book • {book.id.substring(0, 8)}...
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Attempts</p>
                <p className="text-xl font-bold">{book.generation_attempts || book.job?.attempts || 0}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Pages Generated</p>
                <p className="text-xl font-bold">{completedPages}/{book.selected_page_count}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Failed Step</p>
                <p className="text-sm font-medium truncate">{book.failed_step || book.job?.failure_reason || 'Unknown'}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-xl font-bold">
                  {book.generation_duration_seconds ? `${Math.round(book.generation_duration_seconds / 60)}m` : 'N/A'}
                </p>
              </div>
            </div>

            {/* Last Error */}
            {(book.last_error_message || book.job?.error_message) && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">Last Error</p>
                <p className="text-sm text-red-600 dark:text-red-400 font-mono">
                  {book.last_error_message || book.job?.error_message}
                </p>
                {book.last_error_timestamp && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDistanceToNow(new Date(book.last_error_timestamp), { addSuffix: true })}
                  </p>
                )}
              </div>
            )}

            {/* Customer Input */}
            <div className="space-y-2">
              <h3 className="font-medium">Customer Input</h3>
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <p className="text-sm"><strong>Character:</strong> {book.character_name}</p>
                <p className="text-sm"><strong>Interests:</strong> {book.interests?.join(', ') || 'None'}</p>
                <p className="text-sm"><strong>Complexity:</strong> {book.complexity || 'Standard'}</p>
                <p className="text-sm"><strong>Page Count:</strong> {book.selected_page_count}</p>
                {book.job?.generation_data?.customPrompt && (
                  <p className="text-sm"><strong>Custom Prompt:</strong> {book.job.generation_data.customPrompt}</p>
                )}
              </div>
            </div>

            {/* Error Timeline */}
            <div className="space-y-2">
              <h3 className="font-medium">Error Timeline ({errorLog.length} entries)</h3>
              {errorLog.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {errorLog.slice().reverse().map((entry, index) => (
                    <AccordionItem key={index} value={`error-${index}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2 text-left">
                          {getStepIcon(entry.step)}
                          <span className="text-sm font-medium">{entry.step}</span>
                          <Badge className={getErrorTypeBadge(entry.error_type)}>
                            {entry.error_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Attempt #{entry.attempt}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-6 space-y-2">
                          <p className="text-sm text-red-600 dark:text-red-400 font-mono">
                            {entry.error_message}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(entry.timestamp), 'PPpp')}
                          </p>
                          {entry.error_details?.page_number && (
                            <p className="text-xs text-muted-foreground">
                              Page: {entry.error_details.page_number}
                            </p>
                          )}
                          {entry.error_details?.stack_trace && (
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                              {entry.error_details.stack_trace}
                            </pre>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <p className="text-sm text-muted-foreground">No detailed error log available</p>
              )}
            </div>

            {/* Partial Progress */}
            {hasPartialProgress && (
              <div className="space-y-2">
                <h3 className="font-medium">Partial Progress ({completedPages} pages)</h3>
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: book.selected_page_count }).map((_, i) => {
                    const page = book.pages?.[i];
                    const hasImage = !!page?.imageUrl;
                    return (
                      <div
                        key={i}
                        className={`aspect-square rounded border-2 flex items-center justify-center text-xs ${
                          hasImage 
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                            : 'border-red-300 bg-red-50 dark:bg-red-900/20'
                        }`}
                      >
                        {i + 1}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Job Details */}
            {book.job && (
              <div className="space-y-2">
                <h3 className="font-medium">Job Details</h3>
                <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                  <p><strong>Job ID:</strong> <span className="font-mono">{book.job.id}</span></p>
                  <p><strong>Retry Count:</strong> {book.job.retry_count}</p>
                  <p><strong>Total Attempts:</strong> {book.job.attempts}</p>
                  <p><strong>Failure Reason:</strong> {book.job.failure_reason || 'Unknown'}</p>
                  {book.job.progress && (
                    <p><strong>Last Progress:</strong> {book.job.progress.currentStep} ({book.job.progress.currentPage}/{book.job.progress.totalPages})</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-between items-center pt-4 border-t">
          <Button variant="outline" onClick={downloadDebugPackage}>
            <Download className="w-4 h-4 mr-2" />
            Download Debug Package
          </Button>
          <div className="flex gap-2">
            {hasPartialProgress && (
              <Button 
                variant="secondary"
                onClick={() => {
                  onRetry(book.id, false);
                  onOpenChange(false);
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Resume from Page {completedPages + 1}
              </Button>
            )}
            <Button 
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                onRetry(book.id, true);
                onOpenChange(false);
              }}
            >
              <Zap className="w-4 h-4 mr-2" />
              Retry from Beginning
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
