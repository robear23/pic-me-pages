import { motion } from 'framer-motion';
import { useUKBookStore } from '@/store/ukBookStore';
import { Sparkles, Check, Loader2, Info, XCircle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { generateUKBookPdf } from '@/lib/ukPdfGenerator';

const UK_GENERATION_STEPS = [
  'Preparing generation',
  'Creating story prompts',
  'Generating coloring pages',
  'Assembling your book',
  'Finalizing your book',
];

const UK_PAGE_COUNT = 18;

// Map backend step names to display steps
const mapStepToDisplay = (backendStep: string): string => {
  const stepMap: Record<string, string> = {
    'Preparing generation': UK_GENERATION_STEPS[0],
    'Creating story prompts': UK_GENERATION_STEPS[1],
    'Generating coloring pages': UK_GENERATION_STEPS[2],
    'generating_images': UK_GENERATION_STEPS[2],
    'paused_for_memory': UK_GENERATION_STEPS[2],
    'pausing_for_memory_cleanup': UK_GENERATION_STEPS[2],
    'Assembling your book': UK_GENERATION_STEPS[3],
    'Finalizing your book': UK_GENERATION_STEPS[4],
  };
  
  return stepMap[backendStep] || backendStep;
};

export const UKGeneratingStep = () => {
  const { 
    characters,
    selectedInterests,
    customPrompt,
    complexityLevel,
    ukOrderId,
    jobId,
    setJobId,
    setStep,
    setGeneratedBookId,
    isAdminBypass,
  } = useUKBookStore();
  
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [jobStatus, setJobStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(UK_GENERATION_STEPS[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resumeInProgressRef = useRef(false);

  // Check for existing job or create new one
  useEffect(() => {
    const initializeJob = async () => {
      if (jobId) return;

      if (!user) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to generate your book.',
          variant: 'destructive',
        });
        setStep('uk-hero');
        return;
      }

      if (!ukOrderId && !isAdminBypass) {
        console.error('No UK order detected');
        toast({
          title: 'Order Required',
          description: 'Please complete your order before generating.',
          variant: 'destructive',
        });
        setStep('uk-product-selection');
        return;
      }

      // Log if admin bypass is being used
      if (isAdminBypass) {
        console.log('[UK Generation] Admin bypass mode - proceeding without order');
      }

      // Validate interests OR custom prompt
      const hasInterests = selectedInterests && selectedInterests.length > 0;
      const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;
      
      if (!hasInterests && !hasCustomPrompt) {
        console.error('No interests or custom prompt provided');
        toast({
          title: 'Input Required',
          description: 'Please provide either interests or a custom story/theme.',
          variant: 'destructive',
        });
        setStep('uk-interests');
        return;
      }

      try {
        console.log('[UK Generation] Processing character photos...');
        
        // Convert File objects to base64
        const processedCharacters = await Promise.all(
          characters.map(async (c) => ({
            name: c.name,
            photos: await Promise.all(
              c.photos.map(async (photo) => {
                if (!photo) return null;
                
                if (typeof photo === 'string') {
                  return photo;
                }
                
                return new Promise<string | null>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.onerror = () => resolve(null);
                  reader.readAsDataURL(photo);
                });
              })
            )
          }))
        );

        // Check for existing jobs
        const { data: existingJobs } = await supabase
          .from('book_generation_jobs')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['pending', 'processing'])
          .order('created_at', { ascending: false })
          .limit(1);

        let jobToUse;

        if (existingJobs && existingJobs.length > 0) {
          const jobAge = Date.now() - new Date(existingJobs[0].created_at).getTime();
          const isStuck = jobAge > 5 * 60 * 1000;
          
          if (isStuck) {
            console.log('[UK Generation] Existing job is stuck - creating new job');
            jobToUse = null;
          } else {
            console.log('[UK Generation] Reusing existing job:', existingJobs[0].id);
            jobToUse = existingJobs[0];
          }
        }

        if (!jobToUse) {
          console.log('[UK Generation] Creating new job with UK flow flag');
          
          const { data: job, error: jobError } = await supabase
            .from('book_generation_jobs')
            .insert({
              user_id: user.id,
              status: 'pending',
              generation_data: {
                characters: processedCharacters,
                interests: selectedInterests,
                customPrompt: customPrompt,
                consistentCharacters: true,
                complexityLevel: complexityLevel || 'medium',
                selectedPageCount: UK_PAGE_COUNT,
                isUKFlow: true, // CRITICAL: Flag for UK workflow
              }
            })
            .select()
            .single();

          if (jobError) {
            console.error('[UK Generation] Failed to create job:', jobError);
            toast({
              title: 'Failed to Start Generation',
              description: jobError.message,
              variant: 'destructive',
            });
            return;
          }
          
          jobToUse = job;
        }
        
        setJobId(jobToUse.id);
        setJobStatus(jobToUse.status as any);
        console.log('[UK Generation] Job initialized:', jobToUse.id);

      } catch (error: any) {
        console.error('[UK Generation] Error initializing job:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to start generation',
          variant: 'destructive',
        });
      }
    };

    initializeJob();
  }, [user, jobId]);

  // Trigger processor when job is created
  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed') return;

    console.log('[UK Generation] Triggering processor for job:', jobId);

    const triggerProcessor = async () => {
      const { data, error } = await supabase.functions.invoke('process-book-generation', {});
      
      if (error) {
        console.error('[UK Generation] Error triggering processor:', error);
      } else {
        console.log('[UK Generation] Processor triggered:', data);
      }
    };

    setTimeout(() => {
      triggerProcessor();
    }, 500);
  }, [jobId]);

  // Subscribe to Realtime updates
  useEffect(() => {
    if (!jobId) return;

    console.log('[UK Generation] Setting up Realtime subscription for job:', jobId);

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
          console.log('[UK Generation] Job update received:', payload.new);
          const job = payload.new as any;
          
          setJobStatus(job.status);
          
          if (job.status === 'failed') {
            setErrorMessage(job.error_message || 'Generation failed');
          }
          
          if (job.status === 'completed') {
            handleJobComplete(job.book_id);
          }
          
          if (job.progress) {
            const prog = job.progress as any;
            const mappedStep = mapStepToDisplay(prog.currentStep || 'Processing...');
            setCurrentStep(mappedStep);
            
            const percentage = Math.min((prog.currentPage || 0) / (prog.totalPages || 1) * 90, 90);
            setProgress(percentage);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  // Auto-resume paused jobs
  useEffect(() => {
    if (!jobId) return;
    
    const checkAndResume = async () => {
      const { data: job } = await supabase
        .from('book_generation_jobs')
        .select('progress, status')
        .eq('id', jobId)
        .single();
      
      if (!job) return;
      
      const progress = job.progress as any;
      const isPausedForMemory = progress?.currentStep === 'paused_for_memory';
      
      if (isPausedForMemory && !resumeInProgressRef.current) {
        console.log('[UK Generation] Resuming paused job');
        resumeInProgressRef.current = true;
        await supabase.functions.invoke('process-book-generation');
        setTimeout(() => { resumeInProgressRef.current = false; }, 15000);
      }
    };
    
    checkAndResume();
    const interval = setInterval(checkAndResume, 30000);
    return () => clearInterval(interval);
  }, [jobId, toast]);

  // Handle job completion - generate UK PDF
  const handleJobComplete = async (bookId: string) => {
    try {
      console.log('[UK Generation] Job completed, fetching book data:', bookId);
      setProgress(90);
      setCurrentStep(UK_GENERATION_STEPS[3]);
      
      // Fetch book with generated pages
      const { data: book, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookError || !book) {
        throw new Error('Failed to fetch generated book');
      }

      const pages = book.pages as any[];
      const validPages = pages?.filter((p: any) => p?.imageUrl) || [];
      
      console.log('[UK Generation] Book has', validPages.length, 'valid pages');

      if (validPages.length === 0) {
        throw new Error('No pages were generated');
      }

      // Generate UK A4 PDF
      console.log('[UK Generation] Generating UK A4 PDF...');
      setCurrentStep(UK_GENERATION_STEPS[4]);
      setProgress(95);

      const characterName = characters[0]?.name || 'Child';
      const pdfUrl = await generateUKBookPdf(
        bookId,
        validPages,
        characterName,
        (progress) => {
          console.log('[UK Generation] PDF progress:', progress);
        }
      );

      console.log('[UK Generation] PDF generated:', pdfUrl);

      // Update UK order with PDF URL (skip for admin bypass)
      if (ukOrderId) {
        const { error: orderUpdateError } = await supabase
          .from('orders_uk')
          .update({ 
            pdf_url: pdfUrl,
            book_id: bookId,
          })
          .eq('id', ukOrderId);

        if (orderUpdateError) {
          console.error('[UK Generation] Failed to update order:', orderUpdateError);
        }
      } else {
        console.log('[UK Generation] Admin bypass - no order to update, PDF saved to book record only');
      }

      setGeneratedBookId(bookId);
      setProgress(100);
      
      setTimeout(() => {
        setStep('uk-complete');
      }, 1000);

    } catch (error: any) {
      console.error('[UK Generation] Error completing job:', error);
      setErrorMessage(error.message || 'Failed to finalize book');
      setJobStatus('failed');
    }
  };

  const handleRetry = () => {
    setJobId(null);
    setJobStatus('pending');
    setErrorMessage(null);
    setProgress(0);
    setCurrentStep(UK_GENERATION_STEPS[0]);
  };

  const handleBack = () => {
    setStep('uk-product-selection');
  };

  // Error state
  if (errorMessage) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen flex items-center justify-center p-6"
      >
        <div className="w-full max-w-2xl">
          <div className="bg-card/50 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <XCircle className="w-8 h-8 text-destructive" />
              <h2 className="text-2xl font-bold">Generation Failed</h2>
            </div>
            
            <Alert variant="destructive" className="mb-6">
              <AlertDescription className="text-base">{errorMessage}</AlertDescription>
            </Alert>

            <div className="flex gap-4">
              <Button onClick={handleRetry} className="flex-1">
                <Sparkles className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={handleBack} variant="outline" className="flex-1">
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Main generation UI
  const completedSteps = UK_GENERATION_STEPS.findIndex(step => step === currentStep);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen flex items-center justify-center p-6"
    >
      <div className="w-full max-w-2xl">
        <div className="bg-card/50 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-8">
            <Sparkles className="w-8 h-8 text-primary animate-pulse" />
            <h2 className="text-3xl font-bold">Creating Your UK Coloring Book</h2>
          </div>

          <div className="space-y-8">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {currentStep}
                </span>
                <span className="text-sm font-medium text-primary">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>

            <div className="space-y-4">
              {UK_GENERATION_STEPS.map((step, index) => {
                const isComplete = index < completedSteps;
                const isCurrent = index === completedSteps;
                const isPending = index > completedSteps;

                return (
                  <div
                    key={step}
                    className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                      isCurrent
                        ? 'bg-primary/10 border-2 border-primary/50'
                        : isComplete
                        ? 'bg-emerald-500/10 border border-emerald-500/30'
                        : 'bg-muted/30 border border-border/50'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        isComplete
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isComplete ? (
                        <Check className="w-5 h-5" />
                      ) : isCurrent ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <span className="text-sm font-bold">{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p
                        className={`font-medium ${
                          isCurrent ? 'text-primary' : isComplete ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {step}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                This process typically takes 3-5 minutes. Your 18-page UK book is being generated with personalized content!
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
