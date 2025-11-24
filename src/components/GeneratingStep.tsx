import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { Sparkles, Check, Loader2, Info, XCircle, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

const GENERATION_STEPS = [
  'Preparing generation',
  'Creating story prompts',
  'Generating coloring pages',
  'Creating book cover',
  'Finalizing your book',
];

export const GeneratingStep = () => {
  const { 
    characters,
    selectedInterests,
    consistentCharacters,
    complexityLevel,
    selectedPageCount,
    isReworkMode,
    selectedPagesForRework,
    generatedBookId,
    paymentBypassed,
    orderId,
    setStep,
  } = useBookStore();
  
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Preparing generation');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canLeave, setCanLeave] = useState(false);
  const [startTime] = useState(Date.now());
  const [, setTick] = useState(0);
  const [lastProgressUpdate, setLastProgressUpdate] = useState<number>(Date.now());
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);

  // Force re-render every 10 seconds to update elapsed time
  useEffect(() => {
    if (jobStatus === 'completed' || jobStatus === 'failed') return;
    
    const timer = setInterval(() => {
      setTick(prev => prev + 1); // Force re-render
    }, 10000); // Update every 10 seconds
    
    return () => clearInterval(timer);
  }, [jobStatus]);

  // Check for stale progress (no updates for 2+ minutes)
  useEffect(() => {
    if (jobStatus === 'completed' || jobStatus === 'failed') return;
    
    const checkInterval = setInterval(() => {
      const timeSinceUpdate = Date.now() - lastProgressUpdate;
      if (timeSinceUpdate > 2 * 60 * 1000) { // 2 minutes
        setShowStaleWarning(true);
      }
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(checkInterval);
  }, [lastProgressUpdate, jobStatus]);

  // Update last progress when job progress changes
  useEffect(() => {
    if (progress) {
      setLastProgressUpdate(Date.now());
      setShowStaleWarning(false);
    }
  }, [progress]);

  // Check for existing pending job on mount
  useEffect(() => {
    const checkExistingJob = async () => {
      if (!user || jobId) return;

      const { data: existingJobs } = await supabase
        .from('book_generation_jobs')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingJobs && existingJobs.length > 0) {
        console.log('Found existing job:', existingJobs[0].id);
        setJobId(existingJobs[0].id);
        setJobStatus(existingJobs[0].status as 'pending' | 'processing' | 'completed' | 'failed');
        setCanLeave(true);
        if (existingJobs[0].progress) {
          const prog = existingJobs[0].progress as any;
          setProgress(Math.min((prog.currentPage || 0) / (prog.totalPages || 1) * 100, 95));
          setCurrentStep(prog.currentStep || 'Processing...');
        }
      }
    };

    checkExistingJob();
  }, [user, jobId]);

  // Create job if needed
  useEffect(() => {
    const createGenerationJob = async () => {
      if (jobId) return;

      if (!user) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to generate your book.',
          variant: 'destructive',
        });
        setStep('upload');
        return;
      }

      if (!isReworkMode && !paymentBypassed && !orderId) {
        console.error('No payment detected - redirecting to payment step');
        toast({
          title: 'Payment Required',
          description: 'Please complete payment before generating your book.',
          variant: 'destructive',
        });
        setStep('payment');
        return;
      }

      try {
        // CRITICAL FIX: Convert File objects to base64 before storing
        console.log('Processing character photos...');
        const processedCharacters = await Promise.all(
          characters.map(async (c) => ({
            name: c.name,
            photos: await Promise.all(
              c.photos.map(async (photo) => {
                if (!photo) return null;
                return new Promise<string | null>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    console.log(`✓ Converted photo to base64 (${(reader.result as string).length} chars)`);
                    resolve(reader.result as string);
                  };
                  reader.onerror = () => {
                    console.error('Failed to read photo file');
                    resolve(null);
                  };
                  reader.readAsDataURL(photo);
                });
              })
            )
          }))
        );

        console.log('Processed characters:', processedCharacters.map(c => ({
          name: c.name,
          photoCount: c.photos.filter(p => p !== null).length
        })));

        const { data: job, error: jobError } = await supabase
          .from('book_generation_jobs')
          .insert({
            user_id: user.id,
            book_id: isReworkMode ? (generatedBookId || null) : null,
            status: 'pending',
            generation_data: {
              characters: processedCharacters, // Now contains base64 strings
              interests: selectedInterests,
              consistentCharacters,
              complexityLevel,
              selectedPageCount,
              isReworkMode,
              selectedPagesForRework,
              generatedBookId,
            }
          })
          .select()
          .single();

        if (jobError) {
          console.error('Failed to create job:', jobError);
          toast({
            title: 'Failed to Start Generation',
            description: jobError.message,
            variant: 'destructive',
          });
          return;
        }
        
        setJobId(job.id);
        setJobStatus('pending');
        setCanLeave(true);
        console.log('Job created:', job.id);

      } catch (error: any) {
        console.error('Error creating job:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to start generation',
          variant: 'destructive',
        });
      }
    };

    createGenerationJob();
  }, [user, jobId]);

  // Set up polling when we have a jobId
  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed') return;

    console.log('Setting up polling for job:', jobId);

    const triggerProcessor = async () => {
      console.log('Triggering edge function...');
      const { data, error } = await supabase.functions.invoke('process-book-generation', {});
      
      if (error) {
        console.error('Error triggering edge function:', error);
      } else {
        console.log('Edge function response:', data);
      }
    };

    // Trigger immediately
    triggerProcessor();

    // Then poll every 5 seconds
    const pollInterval = setInterval(triggerProcessor, 5000);

    return () => {
      console.log('Cleaning up polling interval');
      clearInterval(pollInterval);
    };
  }, [jobId, jobStatus]);

  // FIX 2: Timeout only starts when job is actively processing (no jobStatus dependency)
  useEffect(() => {
    if (!jobId || jobStatus !== 'processing') return;
    
    // Flat 30-minute timeout from NOW
    const timeoutMs = 30 * 60 * 1000;
    
    console.log(`Setting timeout: 30 minutes from ${new Date().toISOString()}`);
    
    const timeoutId = setTimeout(async () => {
      console.log('Client-side timeout triggered after 30 minutes of processing');
      
      await supabase
        .from('book_generation_jobs')
        .update({
          status: 'failed',
          error_message: 'Generation timed out after 30 minutes of processing. Please try again.',
          completed_at: new Date().toISOString(),
          failure_reason: 'client_timeout',
        })
        .eq('id', jobId);
      
      setJobStatus('failed');
      setErrorMessage('Generation timed out after 30 minutes. Please try again.');
    }, timeoutMs);
    
    return () => clearTimeout(timeoutId);
  }, [jobId, toast]); // FIX 2: Only depend on jobId, not jobStatus
  
  // FIX 2: Add separate stall detection
  useEffect(() => {
    if (!jobId || jobStatus !== 'processing') return;
    
    const checkStall = setInterval(async () => {
      const { data: job } = await supabase
        .from('book_generation_jobs')
        .select('last_heartbeat, started_at, progress')
        .eq('id', jobId)
        .single();
      
      if (job?.last_heartbeat && job?.started_at) {
        const staleTime = Date.now() - new Date(job.last_heartbeat).getTime();
        const totalTime = Date.now() - new Date(job.started_at).getTime();
        
        // If no heartbeat for 3 minutes AND total time > 5 minutes, likely stalled
        if (staleTime > 3 * 60 * 1000 && totalTime > 5 * 60 * 1000) {
          console.warn(`Job appears stalled: no heartbeat for ${staleTime/1000}s`);
          
          // Reset to pending to trigger retry
          await supabase
            .from('book_generation_jobs')
            .update({
              status: 'pending',
              error_message: `Job stalled at page ${(job.progress as any)?.currentPage || 0}. Retrying...`,
              updated_at: new Date().toISOString()
            })
            .eq('id', jobId);
          
          // Trigger processor
          await supabase.functions.invoke('process-book-generation');
        }
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(checkStall);
  }, [jobId, jobStatus]);

  // Subscribe to job updates via Realtime
  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'book_generation_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const updatedJob = payload.new as any;
          console.log('Job update received:', updatedJob);

          // PHASE 1: Track when job starts processing
          if (updatedJob.status === 'processing' && !processingStartTime) {
            setProcessingStartTime(Date.now());
            console.log('Job started processing, resetting timeout');
          }

          setJobStatus(updatedJob.status);

          if (updatedJob.progress) {
            const { currentStep: step, currentPage, totalPages } = updatedJob.progress;
            const progressPercent = totalPages > 0 
              ? Math.round((currentPage / totalPages) * 90) + 5 
              : 5;
            
            setProgress(Math.min(progressPercent, 95));
            setCurrentStep(step || 'Processing...');
            
            // Reset timeout if function is pausing for memory cleanup
            if (step === 'pausing_for_memory_cleanup' || step?.includes('pause')) {
              setLastProgressUpdate(Date.now());
            }
          }

          // PHASE 4: Detect long queue times
          const queueTime = Date.now() - new Date(updatedJob.created_at).getTime();
          if (updatedJob.status === 'pending' && queueTime > 15 * 60 * 1000) {
            console.warn(`Job has been pending for ${queueTime / 1000 / 60} minutes`);
            setShowStaleWarning(true);
          }

          if (updatedJob.status === 'completed' || updatedJob.status === 'partial') {
            setProgress(100);
            
            if (updatedJob.status === 'partial') {
              setCurrentStep('Book partially completed');
              toast({
                title: 'Book Partially Completed',
                description: 'Some pages generated successfully. Check your dashboard for details.',
                variant: 'default',
              });
            } else {
              setCurrentStep('Book completed!');
              toast({
                title: 'Book Ready!',
                description: 'Your coloring book has been generated successfully.',
              });
            }

            // Navigate to dashboard after a brief delay
            setTimeout(() => {
              navigate('/dashboard');
            }, 2000);
          }

          if (updatedJob.status === 'failed') {
            setErrorMessage(updatedJob.error_message || 'Generation failed');
            setCanLeave(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, navigate, toast, processingStartTime]);

  // PHASE 4: Monitor queue and auto-restart if stuck
  useEffect(() => {
    if (!jobId || jobStatus !== 'pending') return;
    
    const checkQueue = setInterval(async () => {
      const { data: job } = await supabase
        .from('book_generation_jobs')
        .select('created_at, status')
        .eq('id', jobId)
        .single();
      
      if (job && job.status === 'pending') {
        const queueTime = Date.now() - new Date(job.created_at).getTime();
        
        // If stuck in queue for 20 minutes, trigger processor again
        if (queueTime > 20 * 60 * 1000) {
          console.log('Job stuck in queue, triggering processor...');
          await supabase.functions.invoke('process-book-generation');
        }
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(checkQueue);
  }, [jobId, jobStatus]);

  const handleReturnToDashboard = () => {
    navigate('/dashboard');
  };

  const handleStartOver = () => {
    useBookStore.getState().reset();
    setStep('upload');
  };

  const currentStepIndex = GENERATION_STEPS.findIndex(step => 
    currentStep.toLowerCase().includes(step.toLowerCase())
  );

  const elapsedMinutes = Math.round((Date.now() - startTime) / 1000 / 60);
  const estimatedMinutes = isReworkMode ? 10 : 20;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl mx-auto">
        <motion.div
          className="text-center space-y-6"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {jobStatus === 'failed' && errorMessage ? (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="inline-block mb-8"
              >
                <XCircle className="w-20 h-20 text-destructive" />
              </motion.div>

              <h2 className="font-black text-4xl md:text-5xl mb-4 text-destructive">
                Generation Failed
              </h2>

              <Alert variant="destructive">
                <AlertDescription>
                  {errorMessage}
                </AlertDescription>
              </Alert>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                <Button
                  onClick={handleStartOver}
                  variant="default"
                  size="lg"
                  className="min-w-[140px]"
                >
                  Start Over
                </Button>
                <Button
                  onClick={handleReturnToDashboard}
                  variant="outline"
                  size="lg"
                  className="min-w-[140px]"
                >
                  Return to Dashboard
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Animated Icon */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="inline-block mb-8"
              >
                <Sparkles className="w-20 h-20 text-primary" />
              </motion.div>

              <h2 className="font-black text-4xl md:text-5xl mb-4">
                {jobStatus === 'completed' ? 'Book Complete!' : 'Creating Your Coloring Book...'}
              </h2>

              {/* Important Info Alert */}
              <Alert className="mb-6 bg-primary/5 border-primary/20 text-left">
                <Info className="w-5 h-5 text-primary" />
                <AlertDescription>
                  <p className="font-semibold mb-2 text-foreground">⏱️ Generation Time & Progress</p>
                  <ul className="text-sm space-y-1.5">
                    <li>
                      <strong>Expected time:</strong> Up to {estimatedMinutes} minutes
                    </li>
                    {canLeave && jobStatus !== 'completed' && (
                      <li className="text-primary font-medium">
                        ✓ You can safely leave this page. Your book will appear in "My Books" when complete.
                      </li>
                    )}
                    {jobStatus === 'completed' && (
                      <li className="text-green-600 dark:text-green-400 font-medium">
                        ✓ You can still rework pages after viewing your book in "My Books"
                      </li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>

              <p className="text-lg text-muted-foreground mb-2">
                {elapsedMinutes} min elapsed
                {estimatedMinutes > 0 && jobStatus !== 'completed' && ` • ~${Math.max(0, estimatedMinutes - elapsedMinutes)} min remaining`}
              </p>

              {/* Stale progress warning */}
              {showStaleWarning && (
                <Alert className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500/50">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                    No progress update for 2+ minutes. Your book is still processing, but it may be experiencing delays...
                  </AlertDescription>
                </Alert>
              )}

              {/* Progress Bar */}
              <div className="mb-6">
                <Progress value={progress} className="h-3" />
                <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
              </div>

              {/* Return Button (only show if can leave) */}
              {canLeave && jobStatus !== 'completed' && (
                <Button
                  onClick={handleReturnToDashboard}
                  variant="outline"
                  size="lg"
                  className="mb-8"
                >
                  Return to Dashboard
                </Button>
              )}

              {/* Status Steps */}
              <div className="space-y-4">
                {GENERATION_STEPS.map((step, index) => {
                  const isComplete = index < currentStepIndex || jobStatus === 'completed';
                  const isCurrent = index === currentStepIndex && jobStatus !== 'completed';

                  return (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className={`flex items-center justify-between p-4 rounded-lg backdrop-blur-sm transition-all duration-300 ${
                        isComplete
                          ? 'bg-secondary/20 border border-secondary/30'
                          : isCurrent
                          ? 'bg-primary/10 border-2 border-primary/50 shadow-lg shadow-primary/20'
                          : 'bg-muted/5 border border-muted/20'
                      }`}
                    >
                      <span
                        className={`font-medium ${
                          isComplete || isCurrent ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {step}
                      </span>
                      {isComplete && <Check className="w-5 h-5 text-secondary" />}
                      {isCurrent && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};
