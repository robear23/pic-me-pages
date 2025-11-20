import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { generatePrompts, generateImages, generateCover } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { saveBookToDatabase } from '@/lib/bookStorage';
import { supabase } from '@/integrations/supabase/client';
import type { GeneratedPrompt } from '@/lib/api';

const GENERATION_STEPS = [
  'Analyzing your photos',
  'Understanding interests',
  'Creating story prompts',
  'Generating coloring pages',
  'Retrying failed pages (if needed)',
  'Creating book cover',
  'Creating print-ready PDFs',
  'Finalizing your book',
];

export const GeneratingStep = () => {
  const { 
    characters,
    selectedInterests,
    consistentCharacters,
    complexityLevel,
    selectedPageCount,
    selectedBinding,
    selectedPrice,
    selectedPodPackageId,
    generationProgress,
    generationStatus,
    isReworkMode,
    selectedPagesForRework,
    generatedPages,
    paymentBypassed,
    orderId,
    setGenerationProgress, 
    setGenerationStatus, 
    setStep,
    setGeneratedPages,
    setApiError,
    setGeneratedBookId,
    setCoverImageUrl,
    setBackCoverImageUrl,
    completeRework
  } = useBookStore();
  
  const { user } = useAuth();
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    const runGeneration = async () => {
      try {
        // Log state for debugging
        const { generatedBookId: existingBookId } = useBookStore.getState();
        console.log('Generation starting:', { 
          isReworkMode, 
          existingBookId, 
          selectedPagesForRework 
        });
        
        // Security check: Verify payment or bypass (skip for rework mode)
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

        // Step 1: Analyzing photos (0-20%)
        setGenerationStatus(GENERATION_STEPS[0]);
        setGenerationProgress(10);
        
        // Convert all character photos to base64
        const charactersWithPhotos = await Promise.all(
          characters.map(async (char) => {
            const photoPromises = char.photos
              .filter((photo): photo is File => photo !== null)
              .map((photo) => {
                return new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(photo);
                });
              });
            const base64Photos = await Promise.all(photoPromises);
            return {
              name: char.name,
              photos: base64Photos
            };
          })
        );
        
        setGenerationProgress(20);

        // Step 2: Understanding interests (20-40%)
        setGenerationStatus(GENERATION_STEPS[1]);
        
        // In rework mode, reuse existing prompts instead of generating new ones
        let generatedPrompts: GeneratedPrompt[];
        if (isReworkMode && generatedPages.length > 0) {
          console.log('Rework mode: Reusing existing prompts');
          generatedPrompts = generatedPages.map(page => ({
            pageNumber: page.pageNumber,
            interest: '', // Not needed for rework
            prompt: page.prompt,
            characterName: characters[0]?.name || ''
          }));
        } else {
          console.log('Generating prompts for:', charactersWithPhotos.map(c => c.name).join(', '), selectedInterests);
          const result = await generatePrompts(
            charactersWithPhotos, 
            selectedInterests,
            consistentCharacters,
            selectedPageCount
          );
          generatedPrompts = result.prompts;
        }
        
        setPrompts(generatedPrompts);
        setGenerationProgress(40);
        
        console.log('Prompts ready:', generatedPrompts);

        // Step 3: Creating story prompts (40-50%)
        setGenerationStatus(GENERATION_STEPS[2]);
        setGenerationProgress(50);

        // Step 4: Generating coloring pages (50-90%)
        setGenerationStatus(GENERATION_STEPS[3]);
        console.log('Generating images with batch processing...');
        
        // If in rework mode, only regenerate selected pages
        let finalPages;
        if (isReworkMode && selectedPagesForRework.length > 0) {
          // Filter to only the selected pages for rework
          const promptsToRework = generatedPrompts.filter(p => 
            selectedPagesForRework.includes(p.pageNumber)
          );
          
          console.log(`REWORK MODE: Regenerating ${promptsToRework.length} pages: [${promptsToRework.map(p => p.pageNumber).join(', ')}]`);
          console.log(`Selected pages for rework:`, selectedPagesForRework);
          
          // CRITICAL: In rework mode, send only the filtered prompts WITHOUT batch slicing
          // The edge function should process ALL prompts in the array since it's already filtered
          setGenerationStatus(`${GENERATION_STEPS[3]} (${promptsToRework.length} pages)`);
          
          const { pages: reworkedPages } = await generateImages(
            promptsToRework,
            charactersWithPhotos,
            consistentCharacters,
            undefined,  // No batchIndex - process all prompts
            undefined,  // No batchSize - process all prompts
            complexityLevel
          );
          
          console.log(`Rework complete: received ${reworkedPages.length} pages with page numbers: [${reworkedPages.map(p => p.pageNumber).join(', ')}]`);
          
          // Validate we got the correct pages back
          const receivedPageNumbers = reworkedPages.map(p => p.pageNumber).sort((a, b) => a - b);
          const expectedPageNumbers = [...selectedPagesForRework].sort((a, b) => a - b);
          
          if (JSON.stringify(receivedPageNumbers) !== JSON.stringify(expectedPageNumbers)) {
            console.error(`Page number mismatch! Expected: [${expectedPageNumbers}], Received: [${receivedPageNumbers}]`);
            throw new Error(`Rework generated wrong pages. Expected ${expectedPageNumbers.length} pages but got ${receivedPageNumbers.length}.`);
          }
          
          setGenerationProgress(90);
          
          // Merge with existing pages - replace only the reworked ones
          finalPages = generatedPages.map(page => {
            const reworked = reworkedPages.find(p => p.pageNumber === page.pageNumber);
            return reworked || page;
          });
          
          console.log(`Final pages after merge: ${finalPages.length} pages`);
        } else {
          // Process all pages in batches (increased from 3 to 4 for efficiency)
          const BATCH_SIZE = 4;
          const totalBatches = Math.ceil(generatedPrompts.length / BATCH_SIZE);
          let allPages: any[] = [];
          
          for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            setGenerationStatus(`${GENERATION_STEPS[3]} (batch ${batchIndex + 1}/${totalBatches})`);
            console.log(`Processing batch ${batchIndex + 1}/${totalBatches}`);
            
            const { pages: batchPages } = await generateImages(
              generatedPrompts,
              charactersWithPhotos,
              consistentCharacters,
              batchIndex,
              BATCH_SIZE,
              complexityLevel
            );
            
            allPages = [...allPages, ...batchPages];
            
            // Update progress within the 50-90% range
            const batchProgress = 50 + (40 * (batchIndex + 1) / totalBatches);
            setGenerationProgress(Math.round(batchProgress));
          }
          
          finalPages = allPages;
        }
        
        setGenerationProgress(85);
        
        // Check for failed pages and retry them automatically
        const failedPages = finalPages.filter(p => !p.imageUrl);
        
        if (failedPages.length > 0) {
          console.log(`Found ${failedPages.length} failed pages, retrying...`);
          
          const MAX_RETRIES = 1; // Reduced from 2 to save costs
          let retryAttempt = 0;
          let stillFailedPages = failedPages;
          
          while (stillFailedPages.length > 0 && retryAttempt < MAX_RETRIES) {
            retryAttempt++;
            setGenerationStatus(`${GENERATION_STEPS[4]} (attempt ${retryAttempt}/${MAX_RETRIES})`);
            
            // Extract failed prompts to retry
            const failedPrompts = generatedPrompts.filter(prompt => 
              stillFailedPages.some(fp => fp.pageNumber === prompt.pageNumber)
            );
            
            console.log(`Retry attempt ${retryAttempt}: Regenerating pages ${failedPrompts.map(p => p.pageNumber).join(', ')}`);
            
            try {
              const retryStartTime = Date.now();
              
              // Retry failed pages without batching (all at once)
              const { pages: retriedPages } = await generateImages(
                failedPrompts,
                charactersWithPhotos,
                consistentCharacters,
                undefined,
                undefined,
                complexityLevel
              );
              
              const retryDuration = ((Date.now() - retryStartTime) / 1000).toFixed(1);
              console.log(`Retry took ${retryDuration}s`);
              
              // Merge retried pages back into finalPages
              finalPages = finalPages.map(page => {
                const retried = retriedPages.find(rp => rp.pageNumber === page.pageNumber);
                return retried?.imageUrl ? retried : page; // Only replace if retry succeeded
              });
              
              // Check which pages still failed
              stillFailedPages = finalPages.filter(p => !p.imageUrl);
              
              if (stillFailedPages.length === 0) {
                console.log(`✓ All pages generated successfully after ${retryAttempt} retry attempts`);
                break;
              } else {
                console.log(`${stillFailedPages.length} pages still failed: ${stillFailedPages.map(p => p.pageNumber).join(', ')}`);
              }
              
              // Wait before next retry (exponential backoff)
              if (stillFailedPages.length > 0 && retryAttempt < MAX_RETRIES) {
                const delayMs = 2000 * Math.pow(2, retryAttempt - 1); // 2s, 4s
                console.log(`Waiting ${delayMs}ms before next retry...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
              }
              
            } catch (retryError: any) {
              console.error(`Retry attempt ${retryAttempt} failed:`, retryError);
              // Continue to next retry attempt or fail
            }
          }
          
          // After all retries, check if we still have failures
          const finalFailedCount = finalPages.filter(p => !p.imageUrl).length;
          
          if (finalFailedCount > 0) {
            const failedPageNumbers = finalPages.filter(p => !p.imageUrl).map(p => p.pageNumber).join(', ');
            throw new Error(
              `Failed to generate ${finalFailedCount} page(s) after ${MAX_RETRIES} retry attempts. ` +
              `Pages: ${failedPageNumbers}. ` +
              `This might be due to temporary AI model issues. Please try again.`
            );
          }
        }
        
        setGenerationProgress(90);
        
        const successCount = finalPages.filter(p => p.imageUrl).length;
        console.log(`✓ Generated ${successCount}/${finalPages.length} images`);
        setGeneratedPages(finalPages);

        // Step 5: Creating book cover (90-92%)
        setGenerationStatus(GENERATION_STEPS[4]);
        let coverImageUrl: string | null = null;
        let backCoverImageUrl: string | null = null;
        
        // Generate covers if: not in rework mode OR covers don't exist yet (safety check)
        const { coverImageUrl: existingFrontCover, backCoverImageUrl: existingBackCover } = useBookStore.getState();
        if (!isReworkMode || !existingFrontCover || !existingBackCover) {
          try {
            console.log('Generating front and back covers...');
            
            // Select a page to use for the cover (prefer first successful page)
            const successfulPages = finalPages.filter(p => p.imageUrl);
            const coverPage = successfulPages[0];
            
            if (coverPage?.imageUrl) {
              const { frontCover, backCover } = await generateCover(
                characters.map(c => c.name).filter(Boolean).join(' and '),
                selectedInterests,
                coverPage.imageUrl,
                charactersWithPhotos
              );
              coverImageUrl = frontCover;
              backCoverImageUrl = backCover;
              setCoverImageUrl(frontCover);
              setBackCoverImageUrl(backCover);
              console.log('Front and back covers generated successfully using page:', coverPage.pageNumber);
            } else {
              console.warn('No successful pages found for cover generation');
            }
          } catch (coverError) {
            console.error('Cover generation failed:', coverError);
            // Continue without cover - we'll use a text-only cover
          }
        }
        
        setGenerationProgress(92);

        // Step 6: Creating print-ready PDFs (92-96%)
        setGenerationStatus(GENERATION_STEPS[5]);
        setGenerationProgress(94);

        // Step 7: Finalizing (96-100%)
        setGenerationStatus(GENERATION_STEPS[6]);
        setGenerationProgress(97);
        
        // Save book to database if user is authenticated
        if (user) {
          try {
            const { generatedBookId: existingBookId, reworkedPageNumbers } = useBookStore.getState();
            
            // Calculate cumulative reworked pages
            const updatedReworkedPages = isReworkMode 
              ? [...new Set([...reworkedPageNumbers, ...selectedPagesForRework])]
              : [];
            
            if (isReworkMode && existingBookId) {
              console.log('Rework mode: Updating existing book', existingBookId);
            } else {
              console.log('Creating new book in database...');
            }
            
            const characterPhotos = characters.flatMap(c => 
              c.photos.filter((p): p is File => p !== null)
            );
            
            const bookId = await saveBookToDatabase({
              userId: user.id,
              characterName: characters.map(c => c.name).filter(Boolean).join(' and '),
              interests: selectedInterests,
              consistentCharacters,
              characterPhotos,
              generatedPages: finalPages,
              coverImageUrl,
              backCoverImageUrl,
              selectedPageCount,
              selectedBinding,
              selectedPrice,
              selectedPodPackageId,
              reworkedPageNumbers: updatedReworkedPages,
              bookId: isReworkMode && existingBookId ? existingBookId : null,
            });

            if (bookId) {
              console.log('Book saved to database:', bookId);
              setGeneratedBookId(bookId);
              
              // Complete rework after successful save to ensure state is properly managed
              if (isReworkMode) {
                completeRework();
              }
              
              // Link book to order if we have an orderId
              if (orderId) {
                try {
                  const { error: orderError } = await supabase
                    .from('orders')
                    .update({ book_id: bookId })
                    .eq('id', orderId);
                  
                  if (orderError) {
                    console.error('Failed to link book to order:', orderError);
                  } else {
                    console.log('Book linked to order:', orderId);
                  }
                } catch (linkError) {
                  console.error('Error linking book to order:', linkError);
                }
              }
            }
          } catch (saveError) {
            console.error('Failed to save book:', saveError);
            // Don't block the user flow if saving fails
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        setGenerationProgress(100);

        if (isReworkMode) {
          toast({
            title: 'Rework Complete!',
            description: `Successfully regenerated ${successCount} page${successCount !== 1 ? 's' : ''}.`,
          });
        } else if (successCount < finalPages.length) {
          toast({
            title: 'Partial Success',
            description: `Generated ${successCount} out of ${finalPages.length} pages.`,
            variant: 'default',
          });
        } else {
          toast({
            title: 'Book Created!',
            description: 'Your personalized coloring book is ready to download.',
          });
        }

        setTimeout(() => setStep('complete'), 500);

      } catch (error) {
        console.error('Generation error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate book';
        const fullError = error instanceof Error ? error.stack || error.message : String(error);
        
        // Provide more helpful error messages based on error type
        let userMessage = errorMessage;
        let errorTitle = 'Generation Failed';
        
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Unable to connect')) {
          errorTitle = 'Connection Issue';
          userMessage = errorMessage + '\n\nThe generation service may be temporarily unavailable or redeploying. Please wait 30 seconds and try again.';
        } else if (errorMessage.includes('Rate limit')) {
          errorTitle = 'Rate Limit Reached';
          userMessage = 'You have reached the rate limit. Please wait a few minutes before trying again.';
        } else if (errorMessage.includes('AI credits')) {
          errorTitle = 'Credits Depleted';
          userMessage = 'Your AI credits have been depleted. Please add credits to continue generating books.';
        }
        
        setApiError(userMessage);
        setErrorDetails(fullError);
        
        // Persistent error toast that requires manual dismissal
        toast({
          title: errorTitle,
          description: userMessage,
          variant: 'destructive',
          duration: 30000, // 30 seconds instead of 3
        });

        // DO NOT auto-redirect - let user decide what to do
      }
    };

    runGeneration();
  }, [
    characters,
    selectedInterests,
    consistentCharacters,
    isReworkMode,
    selectedPagesForRework,
    generatedPages,
    user,
    setGenerationProgress,
    setGenerationStatus,
    setStep,
    setGeneratedPages,
    setApiError,
    completeRework,
    toast
  ]);

  const currentStepIndex = GENERATION_STEPS.findIndex((step) => step === generationStatus);

  const handleRetry = () => {
    setErrorDetails(null);
    setApiError(null);
    setGenerationProgress(0);
    setGenerationStatus('');
    
    // Clear the generated book ID to start fresh
    setGeneratedBookId(null);
    
    // Re-trigger the generation by staying on this step
    setStep('generating');
  };

  const handleStartOver = () => {
    setErrorDetails(null);
    setApiError(null);
    setGenerationProgress(0);
    setGenerationStatus('');
    setStep('interests');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex items-center justify-center px-6"
    >
      <div className="max-w-2xl w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="backdrop-blur-lg bg-glass-bg border border-glass-border rounded-2xl p-12 text-center"
        >
          {/* Error State */}
          {errorDetails ? (
            <>
              <div className="inline-block mb-8">
                <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                  <span className="text-4xl">⚠️</span>
                </div>
              </div>

              <h2 className="font-black text-4xl md:text-5xl mb-4 text-destructive">
                Generation Failed
              </h2>
              
              <div className="mb-8 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-left">
                <h3 className="font-bold text-lg mb-2">Error Details:</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  {errorDetails}
                </p>
              </div>

              <div className="space-y-4 mb-6">
                <h3 className="font-semibold text-lg">What you can try:</h3>
                <ul className="text-left text-sm text-muted-foreground space-y-2 list-disc list-inside">
                  <li>Click "Try Again" to retry the generation</li>
                  <li>Check your internet connection</li>
                  <li>Ensure your photos are valid image files</li>
                  <li>Try with fewer interests or pages</li>
                  <li>If the issue persists, contact support with the error details above</li>
                </ul>
              </div>

              <div className="flex gap-4">
                <Button
                  onClick={handleRetry}
                  size="lg"
                  className="flex-1"
                >
                  Try Again
                </Button>
                <Button
                  onClick={handleStartOver}
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                >
                  Start Over
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

              {/* Main Text */}
              <h2 className="font-black text-4xl md:text-5xl mb-4">
                Creating Your Coloring Book...
              </h2>
              <p className="text-lg text-muted-foreground mb-12">
                Usually takes 1-2 minutes
              </p>

              {/* Progress Bar */}
              <div className="mb-8">
                <Progress value={generationProgress} className="h-3" />
                <p className="text-sm text-muted-foreground mt-2">{generationProgress}%</p>
              </div>

              {/* Status Steps */}
              <div className="space-y-4">
                {GENERATION_STEPS.map((step, index) => {
                  const isComplete = index < currentStepIndex;
                  const isCurrent = index === currentStepIndex;

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
                          ? 'bg-primary/10 border border-primary/30'
                          : 'bg-input/20 border border-glass-border'
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
