import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { Sparkles, Check, Loader2, Info, XCircle, AlertCircle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
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
    customPrompt,
    consistentCharacters,
    complexityLevel,
    selectedPageCount,
    isReworkMode,
    selectedPagesForRework,
    generatedBookId,
    paymentBypassed,
    orderId,
    supportingCast,
    supportingCastPerPage,
    supportingCastPageCount,
    setStep,
  } = useBookStore();
  
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'pending' | 'processing' | 'completed' | 'failed' | 'partial'>('pending');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Preparing generation');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canLeave, setCanLeave] = useState(false);
  const [startTime] = useState(Date.now());
  const [, setTick] = useState(0);
  const [lastProgressUpdate, setLastProgressUpdate] = useState<number>(Date.now());
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const resumeInProgressRef = useRef(false);

  // Force re-render every 10 seconds to update elapsed time
  useEffect(() => {
    if (jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'partial') return;
    
    const timer = setInterval(() => {
      setTick(prev => prev + 1); // Force re-render
    }, 10000); // Update every 10 seconds
    
    return () => clearInterval(timer);
  }, [jobStatus]);

  // Check for stale progress (no updates for 2+ minutes)
  useEffect(() => {
    if (jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'partial') return;
    
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

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Check for in-progress jobs first
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
        return;
      }

      // FIX 3: Also check for recently failed jobs (within last hour)
      const { data: failedJobs } = await supabase
        .from('book_generation_jobs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'failed')
        .gte('updated_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (failedJobs && failedJobs.length > 0) {
        console.log('Found recently failed job:', failedJobs[0].id);
        setJobId(failedJobs[0].id);
        setJobStatus('failed');
        setErrorMessage(failedJobs[0].error_message || 'Generation failed');
        setCanLeave(true);
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

      // CRITICAL: Validate interests OR custom prompt before generation
      const hasInterests = selectedInterests && selectedInterests.length > 0;
      const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;
      
      if (!hasInterests && !hasCustomPrompt) {
        console.error('No interests or custom prompt provided');
        toast({
          title: 'Input Required',
          description: 'Please provide either interests or a custom story/theme before generating your book.',
          variant: 'destructive',
        });
        setStep('interests');
        return;
      }

      // Validation for rework mode (CRITICAL FIX)
      if (isReworkMode) {
        const characterName = characters[0]?.name;
        if (!characterName) {
          console.error('Rework mode requires character name');
          toast({
            title: 'Character Name Required',
            description: 'Cannot rework pages without character name. Please return to Dashboard.',
            variant: 'destructive',
          });
          setStep('complete');
          return;
        }
        
        if (!selectedPagesForRework || selectedPagesForRework.length === 0) {
          console.error('Rework mode requires page selection');
          toast({
            title: 'No Pages Selected',
            description: 'Please select at least one page to rework.',
            variant: 'destructive',
          });
          setStep('complete');
          return;
        }
        
        console.log('✓ Rework validation passed:', {
          characterName,
          selectedPages: selectedPagesForRework.length
        });
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
                
                // If photo is already a string (URL from database), return it as-is
                // The edge function already handles URL→base64 conversion
                if (typeof photo === 'string') {
                  console.log(`✓ Photo is already a URL/string, passing through`);
                  return photo;
                }
                
                // If it's a File object, convert to base64
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

        // Process supporting cast photos to base64
        console.log('Processing supporting cast photos...');
        const processedSupportingCast = await Promise.all(
          supportingCast.map(async (member) => ({
            id: member.id,
            photo: await (async () => {
              if (!member.photo) return null;
              if (typeof member.photo === 'string') {
                console.log(`✓ Supporting cast photo is already a URL/string`);
                return member.photo;
              }
              return new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  console.log(`✓ Converted supporting cast photo to base64`);
                  resolve(reader.result as string);
                };
                reader.onerror = () => {
                  console.error('Failed to read supporting cast photo');
                  resolve(null);
                };
                reader.readAsDataURL(member.photo as File);
              });
            })(),
          }))
        );

        console.log('Processed supporting cast:', processedSupportingCast.length, 'members');

        // FIX #2: Check for existing pending/processing jobs before creating a new one
        const { data: existingJobs } = await supabase
          .from('book_generation_jobs')
          .select('id, status, created_at')
          .eq('book_id', isReworkMode ? generatedBookId : null)
          .eq('user_id', user.id)
          .in('status', ['pending', 'processing'])
          .order('created_at', { ascending: false })
          .limit(1);

        let jobToUse;

        if (existingJobs && existingJobs.length > 0) {
          // Check if the job is too old (stuck for more than 5 minutes)
          const jobAge = Date.now() - new Date(existingJobs[0].created_at).getTime();
          const isStuck = jobAge > 5 * 60 * 1000; // 5 minutes
          
          if (isStuck) {
            console.log('Existing job', existingJobs[0].id, 'is stuck (age:', Math.round(jobAge / 1000), 's) - creating new job');
            jobToUse = null; // Will create new job below
          } else {
            // Reuse existing job and update it with latest generation data
            console.log('Found existing job:', existingJobs[0].id, '- reusing it');
            jobToUse = existingJobs[0];
          }
          
          if (jobToUse) {
          // Update it with latest generation data
          const { error: updateError } = await supabase
            .from('book_generation_jobs')
            .update({
              generation_data: {
                characters: processedCharacters,
                interests: selectedInterests,
                customPrompt: customPrompt,
                consistentCharacters,
                complexityLevel,
                selectedPageCount,
                isReworkMode,
                selectedPagesForRework,
                generatedBookId,
                supportingCast: processedSupportingCast,
                supportingCastPerPage,
                supportingCastPageCount,
              },
              status: 'pending', // Reset to pending to be picked up
              updated_at: new Date().toISOString(),
            })
            .eq('id', jobToUse.id);

          if (updateError) {
            console.error('Failed to update existing job:', updateError);
            toast({
              title: 'Failed to Update Generation',
              description: updateError.message,
              variant: 'destructive',
            });
            return;
          }
        }
      }
        
        if (!jobToUse) {
          // Create new job only if none exists
          const { data: job, error: jobError } = await supabase
            .from('book_generation_jobs')
            .insert({
              user_id: user.id,
              book_id: isReworkMode ? (generatedBookId || null) : null,
              status: 'pending',
              generation_data: {
                characters: processedCharacters, // Now contains base64 strings
                interests: selectedInterests,
                customPrompt: customPrompt,
                consistentCharacters,
                complexityLevel,
                selectedPageCount,
                isReworkMode,
                selectedPagesForRework,
                generatedBookId,
                supportingCast: processedSupportingCast,
                supportingCastPerPage,
                supportingCastPageCount,
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
          
          jobToUse = job;
        }
        
        setJobId(jobToUse.id);
        setJobStatus('pending');
        setCanLeave(true);
        console.log('Job created/reused:', jobToUse.id);

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
  // PHASE 2: Remove aggressive polling - trigger only once, rely on realtime
  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'partial') return;

    console.log('Triggering initial processor for job:', jobId);

    const triggerProcessor = async () => {
      console.log('Triggering edge function...');
      const { data, error } = await supabase.functions.invoke('process-book-generation', {});
      
      if (error) {
        console.error('Error triggering edge function:', error);
      } else {
        console.log('Edge function response:', data);
      }
    };

    // FIX 4: Add 500ms delay before triggering to avoid race conditions
    setTimeout(() => {
      triggerProcessor();
    }, 500);
    
    // Realtime subscription will handle updates
  }, [jobId]);

  // FIX #3: Auto-resume paused or stuck jobs
  useEffect(() => {
    if (!jobId) return;
    
    const checkAndResume = async () => {
      const { data: job } = await supabase
        .from('book_generation_jobs')
        .select('progress, updated_at, status')
        .eq('id', jobId)
        .single();
      
      if (!job) return;
      
      // Check if job is stuck (pending for >1 minute or paused)
      const progress = job.progress as any;
      const isPausedForMemory = progress?.currentStep === 'paused_for_memory';
      const isStuck = job.status === 'pending' && 
        new Date().getTime() - new Date(job.updated_at).getTime() > 60000;
      
      if (isPausedForMemory || isStuck) {
        console.log('🔄 Detected stuck job, resuming:', { 
          isPausedForMemory, 
          isStuck, 
          status: job.status,
          lastUpdate: job.updated_at
        });
        await supabase.functions.invoke('process-book-generation');
        toast({
          title: 'Resuming Generation',
          description: 'Your book generation is continuing...',
        });
      }
    };
    
    // Check immediately on mount and then every 30 seconds
    checkAndResume();
    const interval = setInterval(async () => {
      const { data: latestJob } = await supabase
        .from('book_generation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
        
      if (!latestJob) return;
      
      const isPausedForMemory = latestJob.status === 'pending' && 
                                (latestJob.progress as any)?.currentStep === 'paused_for_memory';
      const isStuck = latestJob.status === 'pending' && 
                      new Date(latestJob.updated_at).getTime() < Date.now() - 5 * 60 * 1000;
      
      // Only trigger if not already in progress
      if ((isPausedForMemory || isStuck) && !resumeInProgressRef.current) {
        resumeInProgressRef.current = true;
        console.log('🔄 Periodic check triggering resume');
        await supabase.functions.invoke('process-book-generation');
        setTimeout(() => { resumeInProgressRef.current = false; }, 10000);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [jobId, toast]);

  // FIX 1: Timeout starts when job transitions to processing (added jobStatus to dependencies)
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
  }, [jobId, jobStatus, toast]); // FIX 1: Added jobStatus to dependencies
  
  // FIX 2: Add periodic polling as fallback to Realtime
  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'partial') return;
    
    const checkJobStatus = async () => {
      const { data: job } = await supabase
        .from('book_generation_jobs')
        .select('status, error_message')
        .eq('id', jobId)
        .single();
      
      if (job?.status === 'failed') {
        console.log('📍 Polling detected failed job that Realtime missed');
        setJobStatus('failed');
        setErrorMessage(job.error_message || 'Generation failed');
      }
    };
    
    // Poll every 30 seconds as fallback
    const interval = setInterval(checkJobStatus, 30000);
    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  // Stall detection (FIX #1: Enable for pending AND processing)
  useEffect(() => {
    if (!jobId || (jobStatus !== 'processing' && jobStatus !== 'pending')) return;
    
    // PHASE 2: Check for stalls every 2 minutes (less aggressive)
    const checkStall = setInterval(async () => {
      const { data: job } = await supabase
        .from('book_generation_jobs')
        .select('last_heartbeat, started_at, progress, status')
        .eq('id', jobId)
        .single();
      
      if (!job) return;
      
      const progress = job.progress as any;
      const isPausedForMemory = progress?.currentStep === 'paused_for_memory' || 
                               progress?.currentStep === 'pausing_for_memory_cleanup';
      
      // ✅ FIX 3: For paused jobs, trigger after 2 minutes of no activity
      // For running jobs, use the standard 5-minute total time check
      if (isPausedForMemory) {
        // Paused job: check if started_at is null AND last activity > 2 mins
        const lastActivity = job.last_heartbeat || job.started_at;
        if (!lastActivity || (Date.now() - new Date(lastActivity).getTime() > 2 * 60 * 1000)) {
          console.log('⚠️ Paused job inactive for 2+ minutes, triggering processor...');
          await supabase.functions.invoke('process-book-generation');
        }
      } else if (job.started_at) {
        // Running job: use normal stall detection
        const staleTime = job.last_heartbeat 
          ? Date.now() - new Date(job.last_heartbeat).getTime()
          : Infinity;
        const totalTime = Date.now() - new Date(job.started_at).getTime();
        
        if (staleTime > 3 * 60 * 1000 && totalTime > 5 * 60 * 1000) {
          console.warn('⚠️ Job stalled (no heartbeat for 3+ mins, running 5+ mins), resetting...');
          await supabase
            .from('book_generation_jobs')
            .update({
              status: 'pending',
              started_at: null,
              last_heartbeat: null,
              error_message: 'Job stalled. Retrying...',
              updated_at: new Date().toISOString()
            })
            .eq('id', jobId);
          
          await supabase.functions.invoke('process-book-generation');
        }
      }
    }, 120000); // Check every 2 minutes instead of 1
    
    return () => clearInterval(checkStall);
  }, [jobId, jobStatus]);

  // Subscribe to job updates via Realtime with fast polling for memory pauses
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
        async (payload) => {
          const updatedJob = payload.new as any;
          console.log('Job update received:', updatedJob);

          // PHASE 1: Track when job starts processing
          if (updatedJob.status === 'processing' && !processingStartTime) {
            setProcessingStartTime(Date.now());
            console.log('Job started processing, resetting timeout');
          }

          setJobStatus(updatedJob.status);
          
          // Fast resume for memory-paused jobs (15s polling with debouncing)
          if (updatedJob.status === 'pending' && 
              updatedJob.progress?.currentStep === 'paused_for_memory') {
            console.log('⚡ Memory pause detected - fast polling enabled');
            
            // Debounce: Only trigger if no resume is in progress
            if (!resumeInProgressRef.current) {
              resumeInProgressRef.current = true;
              setTimeout(async () => {
                console.log('🔄 Attempting fast resume...');
                await supabase.functions.invoke('process-book-generation');
                resumeInProgressRef.current = false;
              }, 15000); // Wait 15s instead of 3s
            }
          }

          // Call completeRework() after successful rework
          if (updatedJob.status === 'completed' && isReworkMode) {
            console.log('✅ Rework completed, updating store...');
            const bookStore = useBookStore.getState();
            bookStore.completeRework();
          }

          if (updatedJob.progress) {
            const { currentStep: step, currentPage, totalPages } = updatedJob.progress;
            // FIX: Use selectedPageCount as fallback when totalPages is 0
            const effectiveTotalPages = totalPages > 0 ? totalPages : (selectedPageCount || 12);
            const progressPercent = effectiveTotalPages > 0 
              ? Math.round((currentPage / effectiveTotalPages) * 90) + 5 
              : 5;
            
            // Don't set 100% progress unless job is actually completed/partial
            const cappedProgress = updatedJob.status === 'completed' || updatedJob.status === 'partial' 
              ? 100 
              : Math.min(progressPercent, 95);
            setProgress(cappedProgress);
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
            setErrorMessage(null);
            setShowStaleWarning(false);
            
            // Fetch book to check PDF status
            const { data: book } = await supabase
              .from('books')
              .select('id, pdf_url, cover_url, cover_image_url, back_cover_image_url, pages, selected_pod_package_id, selected_page_count')
              .eq('id', updatedJob.book_id)
              .single();
            
            // If book has images but missing PDFs, generate them client-side
            if (book && Array.isArray(book.pages) && book.pages.length > 0 && (!book.pdf_url || !book.cover_url)) {
              setCurrentStep('Generating print-ready PDFs...');
              console.log('📄 Generating missing PDFs client-side:', { 
                hasInterior: !!book.pdf_url, 
                hasCover: !!book.cover_url 
              });
              
              try {
                const { repairBookPdf } = await import('@/lib/repairPdf');
                const { generateCoverWrapPdf } = await import('@/lib/repairPdf');
                
                // Generate interior PDF if missing
                if (!book.pdf_url) {
                  console.log('🔧 Generating interior PDF...');
                  const interiorPdfUrl = await repairBookPdf(
                    book.id,
                    book.pages.map((p: any) => ({ imageUrl: p.imageUrl })),
                    { 
                      pageCount: book.selected_page_count || book.pages.length,
                      podPackageId: book.selected_pod_package_id 
                    }
                  );
                  await supabase.from('books').update({ pdf_url: interiorPdfUrl }).eq('id', book.id);
                  console.log('✅ Interior PDF generated');
                }
                
                // Generate cover PDF if missing
                if (!book.cover_url && book.cover_image_url && book.back_cover_image_url) {
                  console.log('🔧 Generating cover PDF...');
                  const coverPdfUrl = await generateCoverWrapPdf(
                    book.id,
                    book.cover_image_url,
                    book.back_cover_image_url,
                    book.selected_pod_package_id
                  );
                  await supabase.from('books').update({ 
                    cover_url: coverPdfUrl, 
                    status: 'completed',
                    missing_components: []
                  }).eq('id', book.id);
                  console.log('✅ Cover PDF generated');
                }
                
                setCurrentStep('Book completed!');
                toast({ 
                  title: 'Book Ready!', 
                  description: 'Your coloring book has been generated successfully.' 
                });
              } catch (error) {
                console.error('❌ Client-side PDF generation failed:', error);
                setCurrentStep('PDFs need regeneration');
                toast({
                  title: 'PDF Generation Issue',
                  description: 'Images are ready but PDFs need to be generated. You can retry from your dashboard.',
                  variant: 'default'
                });
              }
            } else if (updatedJob.status === 'partial') {
              // Book is truly incomplete (missing images)
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
                description: 'Your coloring book has been generated successfully.' 
              });
            }

            // Navigate to preview step instead of dashboard
            setTimeout(() => {
              // Set step to preview and navigate to app
              useBookStore.getState().setStep('preview');
              useBookStore.getState().setGeneratedBookId(updatedJob.book_id);
              navigate('/app');
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

  const getCurrentStepIndex = (stepString: string): number => {
    const normalized = stepString.toLowerCase();
    
    // Map all possible edge function step values to display step indices
    if (normalized.includes('preparing') || normalized === 'initializing') return 0;
    if (normalized.includes('prompt') || normalized.includes('story')) return 1;
    if (normalized.includes('generat') || normalized.includes('image') || normalized.includes('page') || normalized.includes('paused') || normalized.includes('pausing')) return 2;
    if (normalized.includes('cover')) return 3;
    // FIX: Include 'partial' as a completed state
    if (normalized.includes('finaliz') || normalized.includes('complet') || normalized.includes('partial')) return 4;
    
    return -1; // Unknown step
  };

  // Determine if job is in a terminal state
  const isTerminalState = jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'partial';

  const currentStepIndex = getCurrentStepIndex(currentStep);

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
                {jobStatus === 'completed' ? 'Book Complete!' : 
                 jobStatus === 'partial' ? 'Book Partially Complete' : 
                 'Creating Your Coloring Book...'}
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

              {/* Manual Resume Button (FIX #5) */}
              {jobStatus === 'pending' && showStaleWarning && (
                <Button
                  onClick={async () => {
                    console.log('Manually resuming job...');
                    await supabase.functions.invoke('process-book-generation');
                    toast({
                      title: 'Resuming Generation',
                      description: 'Your book generation is continuing...',
                    });
                    setShowStaleWarning(false);
                  }}
                  variant="default"
                  size="lg"
                  className="mb-4"
                >
                  Resume Generation
                </Button>
              )}

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
                  const isComplete = (index < currentStepIndex && currentStepIndex >= 0) || isTerminalState;
                  const isCurrent = index === currentStepIndex && !isTerminalState && currentStepIndex >= 0;

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
