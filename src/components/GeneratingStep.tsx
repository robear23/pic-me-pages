import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { Sparkles, Check, Loader2, Clock, XCircle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { generatePrompts, generateImages, generateCover } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { saveBookToDatabase } from '@/lib/bookStorage';
import { supabase } from '@/integrations/supabase/client';
import { bookQueue } from '@/lib/generationQueue';
import type { GeneratedPrompt } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState(bookQueue.getStatus());
  const [cancelling, setCancelling] = useState(false);
  const [startTime] = useState(Date.now());
  const hasRunRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Update queue status every 2 seconds
    const statusInterval = setInterval(() => {
      setQueueStatus(bookQueue.getStatus());
    }, 2000);
    
    // Set overall timeout (15 minutes)
    timeoutRef.current = setTimeout(() => {
      if (generationProgress < 100) {
        setApiError('Generation timeout - taking too long. Please try again or contact support.');
        setGenerationStatus('Timeout - please try again');
      }
    }, 15 * 60 * 1000);
    
    const runGeneration = async () => {
      try {
        // CRITICAL: Prevent repeated runs that burn credits
        if (hasRunRef.current) {
          console.log('⚠️ Generation already running or completed - preventing duplicate run');
          return;
        }
        hasRunRef.current = true;

        // Log state for debugging
        const { generatedBookId: existingBookId, generationStatus: currentStatus } = useBookStore.getState();
        console.log('✅ Generation starting:', { 
          isReworkMode, 
          existingBookId, 
          selectedPagesForRework,
          complexity: complexityLevel 
        });
        
        // Safety guard: Don't regenerate if book already exists and not in rework mode
        if (existingBookId && !isReworkMode && currentStatus !== 'error') {
          console.log('⚠️ Book already generated (ID:', existingBookId, ') - skipping generation');
          setStep('complete');
          return;
        }
        
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
        
        // Update queue status periodically
        const updateQueueStatus = () => setQueueStatus(bookQueue.getStatus());
        const statusInterval = setInterval(updateQueueStatus, 3000);
        
        // If in rework mode, only regenerate selected pages
        let finalPages;
        if (isReworkMode && selectedPagesForRework.length > 0) {
          // Filter to only the selected pages for rework
          const promptsToRework = generatedPrompts.filter(p => 
            selectedPagesForRework.includes(p.pageNumber)
          );
          
          console.log(`REWORK MODE: Regenerating ${promptsToRework.length} pages: [${promptsToRework.map(p => p.pageNumber).join(', ')}]`);
          console.log(`Selected pages for rework:`, selectedPagesForRework);
          
          let reworkedPages;
          try {
            reworkedPages = await bookQueue.addBook(
              promptsToRework,
              charactersWithPhotos,
              consistentCharacters,
              complexityLevel || 'medium',
              (percent, status) => {
                setGenerationProgress(Math.round(50 + (percent * 0.4))); // 50-90%
                setGenerationStatus(GENERATION_STEPS[3]); // Always "Generating coloring pages"
                updateQueueStatus();
              }
            );
          } catch (error: any) {
            clearInterval(statusInterval);
            if (error.message?.includes('Rate limit') || error.message?.includes('Daily limit')) {
              toast({
                title: error.message.includes('Daily limit') ? 'Daily Limit Reached' : 'Rate Limit Reached',
                description: error.message,
                variant: 'destructive',
                duration: 10000,
              });
              setApiError(error.message);
              return;
            }
            throw error;
          }
          
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
          // Use queue system for full book generation
          console.log(`Queueing ${generatedPrompts.length} pages for generation...`);
          
          try {
            finalPages = await bookQueue.addBook(
              generatedPrompts,
              charactersWithPhotos,
              consistentCharacters,
              complexityLevel || 'medium',
              (percent, status) => {
                setGenerationProgress(Math.round(50 + (percent * 0.4))); // 50-90%
                setGenerationStatus(GENERATION_STEPS[3]); // Always "Generating coloring pages"
                updateQueueStatus();
              }
            );
            
            setGeneratedPages(finalPages);
            console.log(`Queue generation complete: ${finalPages.length} pages`);
          } catch (error: any) {
            clearInterval(statusInterval);
            if (error.message?.includes('Rate limit') || error.message?.includes('Daily limit')) {
              toast({
                title: error.message.includes('Daily limit') ? 'Daily Limit Reached' : 'Rate Limit Reached',
                description: error.message,
                variant: 'destructive',
                duration: 10000,
              });
              setApiError(error.message);
              return;
            }
            throw error;
          }
        }
        
        clearInterval(statusInterval);
        
        setGenerationProgress(85);
        
        // Classify and handle failed pages intelligently
        const failedPages = finalPages.filter(p => !p.imageUrl);
        
        if (failedPages.length > 0) {
          console.log(`Found ${failedPages.length} failed pages, analyzing errors...`);
          
          // Classify errors: style issues, validation, infra, timeout, model refusals
          const classifyError = (errorMessage: string): 'validation' | 'style' | 'infra' | 'timeout' | 'refused' | 'unknown' => {
            const msg = errorMessage.toLowerCase();
            
            // NEW: Detect model refusals
            if (msg.includes('model_refused') || 
                msg.includes('no image data') ||
                msg.includes('content policy')) {
              return 'refused'; // Model safety filter / refusal
            }
            
            if (msg.includes('cartoon') || msg.includes('illustration') || msg.includes('variance')) {
              return 'style'; // Wrong artistic style - specific error type
            }
            if (msg.includes('validation_failed') || 
                msg.includes('gray pixels') || 
                msg.includes('too photographic') ||
                msg.includes('line art conversion failed')) {
              return 'validation'; // Line art validation issues
            }
            if (msg.includes('worker_limit') || 
                msg.includes('429') || 
                msg.includes('rate limit')) {
              return 'infra'; // Transient - retry may help
            }
            if (msg.includes('timeout')) {
              return 'timeout'; // Transient - retry may help
            }
            return 'unknown'; // Retry cautiously
          };
          
          const validationFailures = failedPages.filter(p => classifyError(p.error || '') === 'validation');
          const styleFailures = failedPages.filter(p => classifyError(p.error || '') === 'style');
          const refusedFailures = failedPages.filter(p => classifyError(p.error || '') === 'refused');
          const retryableFailures = failedPages.filter(p => {
            const type = classifyError(p.error || '');
            return type === 'infra' || type === 'timeout' || type === 'unknown';
          });
          
          console.log(`Error classification: ${styleFailures.length} style, ${validationFailures.length} validation, ${retryableFailures.length} retryable`);
          
          // Only retry transient failures
          const MAX_RETRIES = 1;
          let retryAttempt = 0;
          let stillFailedPages = retryableFailures;
          
          while (stillFailedPages.length > 0 && retryAttempt < MAX_RETRIES) {
            retryAttempt++;
            setGenerationStatus(GENERATION_STEPS[4]); // "Retrying failed pages (if needed)"
            console.log(`Retry attempt ${retryAttempt}/${MAX_RETRIES} for ${stillFailedPages.length} transient failures`);
            
            // Extract failed prompts to retry
            const failedPrompts = generatedPrompts.filter(prompt => 
              stillFailedPages.some(fp => fp.pageNumber === prompt.pageNumber)
            );
            
            console.log(`Retry attempt ${retryAttempt}: Regenerating pages ${failedPrompts.map(p => p.pageNumber).join(', ')}`);
            
            try {
              const retryStartTime = Date.now();
              
              let retriedPages: typeof finalPages = [];
              try {
                // Retry failed pages one by one to keep edge function load low
                for (const prompt of failedPrompts) {
                  const singleResult = await generateImages(
                    [prompt],
                    charactersWithPhotos,
                    consistentCharacters,
                    undefined,
                    undefined,
                    complexityLevel
                  );
                  if (singleResult.pages && singleResult.pages[0]) {
                    retriedPages.push(singleResult.pages[0]);
                  }
                }
              } catch (retryError: any) {
                if (retryError.message?.includes('Rate limit')) {
                  toast({
                    title: 'Rate Limit During Retry',
                    description: 'Google AI rate limit reached while retrying. Continuing with current pages.',
                    variant: 'default',
                    duration: 8000,
                  });
                  console.log('Rate limit hit during retry, continuing with current pages');
                  break; // Exit retry loop but continue with what we have
                }
                throw retryError;
              }
              
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
          
          // Re-classify remaining failures after all retries
          const allRemainingFailures = finalPages.filter(p => !p.imageUrl);
          const permanentStyleFailures = allRemainingFailures.filter(p => classifyError(p.error || '') === 'style');
          const permanentValidationFailures = allRemainingFailures.filter(p => classifyError(p.error || '') === 'validation');
          const permanentRefusedFailures = allRemainingFailures.filter(p => classifyError(p.error || '') === 'refused');
          const otherFailures = allRemainingFailures.filter(p => {
            const type = classifyError(p.error || '');
            return type !== 'validation' && type !== 'style' && type !== 'refused';
          });
          
          console.log(`After retries: ${permanentStyleFailures.length} style, ${permanentValidationFailures.length} validation, ${permanentRefusedFailures.length} refused, ${otherFailures.length} other failures`);
          
          // Build specific error message
          if (allRemainingFailures.length > 0) {
            const successCount = finalPages.filter(p => p.imageUrl).length;
            const totalPages = finalPages.length;
            const successRate = successCount / totalPages;
            
            const failedPageNumbers = allRemainingFailures.map(p => p.pageNumber).sort((a, b) => a - b);
            let errorParts: string[] = [];
            
            if (permanentRefusedFailures.length > 0) {
              const refusedPages = permanentRefusedFailures.map(p => p.pageNumber).sort((a, b) => a - b).join(', ');
              // PHASE 1: Show actual error messages for refused pages
              const errorExamples = permanentRefusedFailures.slice(0, 2).map(p => 
                `  • Page ${p.pageNumber}: "${p.prompt.substring(0, 60)}..." - ${p.error?.substring(0, 100) || 'No details'}`
              ).join('\n');
              
              errorParts.push(`🚫 AI MODEL REFUSED (Pages ${refusedPages}):\nThe AI couldn't generate images for these prompts, possibly due to:\n• Complex or ambiguous scene descriptions\n• Certain word combinations that triggered safety filters\n• Conflicts between the reference photo and the requested scene\n\nError details:\n${errorExamples}\n\nTo fix this:\n• Use the Rework feature to regenerate with simpler prompts\n• Try different interests that are more straightforward (e.g., "playing with toys" instead of "doing magical activities")\n• Ensure reference photos are clear and well-lit\n• Avoid abstract or overly creative scenarios`);
            }
            
            if (permanentStyleFailures.length > 0) {
              const stylePages = permanentStyleFailures.map(p => p.pageNumber).sort((a, b) => a - b).join(', ');
              // PHASE 1: Show validation details
              const errorExamples = permanentStyleFailures.slice(0, 2).map(p => 
                `  • Page ${p.pageNumber}: ${p.error?.substring(0, 80) || 'Style validation failed'}`
              ).join('\n');
              
              errorParts.push(`📸 PHOTO STYLE ISSUES (Pages ${stylePages}):\nThe AI generated illustrated/cartoon images instead of realistic photos.\n\nDetails:\n${errorExamples}\n\nTry these fixes:\n• Use clearer, well-lit reference photos\n• Simplify prompts - avoid words like "drawing," "artistic," "creative"\n• Use the Rework feature to regenerate just these pages\n• Consider different character poses/photos for these scenes`);
            }
            
            if (permanentValidationFailures.length > 0) {
              const validationPages = permanentValidationFailures.map(p => p.pageNumber).sort((a, b) => a - b).join(', ');
              // PHASE 1: Show validation percentages if available
              const errorExamples = permanentValidationFailures.slice(0, 2).map(p => {
                const match = p.error?.match(/(\d+\.?\d*)% gray/);
                const grayPercent = match ? match[1] + '% gray' : 'validation failed';
                return `  • Page ${p.pageNumber}: ${grayPercent}`;
              }).join('\n');
              
              errorParts.push(`🎨 LINE ART CONVERSION ISSUES (Pages ${validationPages}):\nPages couldn't be converted to clean line art - too photographic or excessive shading.\n\nDetails:\n${errorExamples}\n(Threshold: 45% gray maximum)\n\nTo fix this:\n• Use brighter, higher-contrast photos with fewer shadows\n• Avoid close-up or studio-style shots\n• Try simpler poses with clear lighting\n• Then use the Rework feature to regenerate just these pages`);
            }
            
            if (otherFailures.length > 0) {
              const infraPages = otherFailures.map(p => p.pageNumber).sort((a, b) => a - b).join(', ');
              errorParts.push(`⚠️ SYSTEM ISSUES (Pages ${infraPages}):\nPages failed due to temporary system issues.\n\nPlease try again in a few minutes or use the Rework feature.`);
            }
            
            const errorMsg = errorParts.join('\n\n');
            console.error(errorMsg);
            setErrorDetails(errorMsg);
            
            // Only hard-fail if success rate is very low (partial success mode)
            if (successRate < 0.5) { // Less than 50% success
              throw new Error(`Generation mostly failed (${successCount}/${totalPages} pages):\n\n${errorMsg}`);
            }
            
            // Otherwise: soft-fail with warning, allow user to continue
            toast({
              title: `⚠️ ${allRemainingFailures.length} Pages Need Attention`,
              description: `${successCount}/${totalPages} pages generated successfully. Check the details to fix the remaining pages.`,
              variant: 'default',
              duration: 10000,
            });
            
            // Don't throw - let generation continue to cover/PDF with successful pages
            // User can use Rework feature for failed pages later
          }
        }
        
        setGenerationProgress(90);
        
        const successCount = finalPages.filter(p => p.imageUrl).length;
        console.log(`✓ Generated ${successCount}/${finalPages.length} images`);
        setGeneratedPages(finalPages);

        // Step 5: Creating book cover (90-92%)
        setGenerationStatus(GENERATION_STEPS[5]); // "Creating book cover"
        let coverImageUrl: string | null = null;
        let backCoverImageUrl: string | null = null;
        
        // Generate covers with retry logic
        const { coverImageUrl: existingFrontCover, backCoverImageUrl: existingBackCover } = useBookStore.getState();
        const shouldGenerateCovers = !isReworkMode || !existingFrontCover || !existingBackCover;
        
        if (shouldGenerateCovers) {
          let coverAttempts = 0;
          const maxCoverAttempts = 3;
          let coverGenerationError: string | null = null;
          
          while (coverAttempts < maxCoverAttempts && !coverImageUrl) {
            try {
              coverAttempts++;
              console.log(`🎨 Cover generation attempt ${coverAttempts}/${maxCoverAttempts}`);
              
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
                console.log('✅ Front and back covers generated successfully');
                coverGenerationError = null;
                break;
              }
            } catch (coverError: any) {
              coverGenerationError = coverError.message || 'Unknown error';
              console.error(`❌ Cover generation attempt ${coverAttempts} failed:`, coverError);
              
              if (coverAttempts < maxCoverAttempts) {
                console.log(`⏳ Waiting before retry ${coverAttempts + 1}...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * coverAttempts));
              }
            }
          }
          
          // If AI cover generation failed, use fallback covers
          if (!coverImageUrl) {
            console.log('⚠️ AI cover generation failed after all attempts; creating fallback covers instead');
            console.log('Last error:', coverGenerationError);
            
            try {
              const { generateFallbackCovers } = await import('@/lib/fallbackCover');
              const successfulPages = finalPages.filter(p => p.imageUrl);
              const coverPage = successfulPages[0];
              const sampleImage = coverPage?.imageUrl;

              const { front, back } = await generateFallbackCovers(
                characters.map(c => c.name).filter(Boolean).join(' and '),
                sampleImage
              );

              coverImageUrl = front;
              backCoverImageUrl = back;
              setCoverImageUrl(front);
              setBackCoverImageUrl(back);
              console.log('✅ Fallback covers generated successfully');
              
              // Show info toast about using fallback covers
              toast({
                title: 'Using Fallback Covers',
                description: 'AI cover generation failed, using simple covers instead. You can retry from the complete page.',
                variant: 'default',
              });
            } catch (fallbackError) {
              console.error('❌ Fallback cover generation also failed:', fallbackError);
              // Don't throw - allow book to save without covers (partial)
              toast({
                title: 'Cover Generation Failed',
                description: 'Unable to generate covers. Your book will be saved without covers - you can retry later.',
                variant: 'default',
              });
            }
          }
        } else if (isReworkMode && existingBookId) {
          // Preserve existing covers in rework mode
          console.log('Rework mode: Preserving existing covers');
          try {
            const { data: existingBook } = await supabase
              .from('books')
              .select('cover_image_url, back_cover_image_url')
              .eq('id', existingBookId)
              .single();
            
            if (existingBook) {
              coverImageUrl = existingBook.cover_image_url;
              backCoverImageUrl = existingBook.back_cover_image_url;
              console.log('Existing covers preserved');
            }
          } catch (fetchError) {
            console.error('Failed to fetch existing covers:', fetchError);
          }
        }
        
        setGenerationProgress(92);

        // Step 6: Creating print-ready PDFs (92-96%)
        setGenerationStatus(GENERATION_STEPS[6]); // "Creating print-ready PDFs"
        setGenerationProgress(94);

        // Step 7: Finalizing (96-100%)
        setGenerationStatus(GENERATION_STEPS[7]); // "Finalizing your book"
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

      } catch (error: any) {
        console.error('Generation error:', error);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`Generation failed after ${elapsed}s:`, error.message);
        
        // Handle cancellation separately
        if (error.message?.includes('cancelled by user')) {
          setGenerationStatus('Generation cancelled');
          toast({
            title: 'Generation Cancelled',
            description: 'Book generation was stopped.',
          });
          return;
        }
        
        // Use detailed error message if available
        const errorMsg = errorDetails || error.message || 'Generation failed';
        setApiError(errorMsg);
        setGenerationStatus('Error occurred');
        hasRunRef.current = false; // Allow retry
        
        // Provide helpful error messages based on error type
        let userMessage = errorMsg;
        let errorTitle = 'Generation Failed';
        
        if (error.message?.includes('Failed to fetch') || error.message?.includes('Unable to connect')) {
          errorTitle = 'Connection Issue';
          userMessage = error.message + '\n\nThe generation service may be temporarily unavailable or redeploying. Please wait 30 seconds and try again.';
        } else if (error.message?.includes('Rate limit')) {
          errorTitle = 'Rate Limit Reached';
          userMessage = 'Google AI is temporarily rate limiting requests. Please wait 1-2 minutes before trying again. Your progress has been saved.';
        } else if (error.message?.includes('AI credits')) {
          errorTitle = 'Credits Depleted';
          userMessage = 'Your AI credits have been depleted. Please add credits to continue generating books.';
        }
        
        // Persistent error toast
        toast({
          title: errorTitle,
          description: userMessage,
          variant: 'destructive',
          duration: 10000,
        });
      }
    };

    runGeneration();
  }, []); // Empty deps - runs once on mount. Retry handled by handleRetry.

  const currentStepIndex = GENERATION_STEPS.findIndex((step) => step === generationStatus);

  const handleRetry = () => {
    setErrorDetails(null);
    setApiError(null);
    hasRunRef.current = false; // Allow retry by resetting the guard
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
  
  const handleCancel = () => {
    setCancelling(true);
    bookQueue.cancelCurrentJob();
    toast({
      title: 'Cancelling Generation',
      description: 'Stopping the book generation process...',
    });
    
    setTimeout(() => {
      navigate('/dashboard');
    }, 1500);
  };
  
  const handleReturnToDashboard = () => {
    navigate('/dashboard');
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
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                  {errorDetails}
                </p>
                {/* PHASE 1: Add expandable technical details */}
                <details className="mt-4 text-xs">
                  <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">
                    🔍 Show Technical Details (for support)
                  </summary>
                  <div className="mt-2 p-3 bg-muted/50 rounded border border-muted-foreground/20 font-mono text-xs overflow-x-auto">
                    <div>Time: {new Date().toISOString()}</div>
                    <div>Pages Attempted: {generatedPages?.length || 0}</div>
                    <div>Pages Succeeded: {generatedPages?.filter(p => p.imageUrl).length || 0}</div>
                    <div>Complexity: {complexityLevel || 'medium'}</div>
                    <div>Consistent Characters: {consistentCharacters ? 'Yes' : 'No'}</div>
                    {generatedPages && generatedPages.length > 0 && (
                      <div className="mt-2">
                        Failed Pages: {generatedPages.filter(p => !p.imageUrl).map(p => `#${p.pageNumber}`).join(', ')}
                      </div>
                    )}
                  </div>
                </details>
              </div>

              {/* Show "Continue Anyway" option if some pages succeeded */}
              {(() => {
                const successCount = generatedPages?.filter(p => p.imageUrl).length || 0;
                const totalPages = selectedPageCount || 0;
                
                if (successCount > 0 && successCount < totalPages) {
                  return (
                    <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        ✓ {successCount} of {totalPages} pages generated successfully
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        You can continue with the successful pages and use Rework later to fix the failed ones.
                      </p>
                      <Button 
                        onClick={() => {
                          // Clear error and proceed to complete step
                          setApiError(null);
                          setErrorDetails(null);
                          setStep('complete'); // Move to complete step to show the book
                        }}
                        variant="outline"
                        className="mt-3 bg-white hover:bg-amber-50 border-amber-300 text-amber-900"
                      >
                        Continue with {successCount} Pages
                      </Button>
                    </div>
                  );
                }
                return null;
              })()}

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

              <div className="flex gap-4 flex-wrap justify-center">
                <Button
                  onClick={handleRetry}
                  size="lg"
                  className="min-w-[140px]"
                >
                  Try Again
                </Button>
                <Button
                  onClick={handleStartOver}
                  variant="secondary"
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

              {/* Queue Status Alerts */}
              {queueStatus.booksRemaining <= 3 && queueStatus.booksRemaining > 0 && (
                <Alert className="mb-6 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200">
                    <strong>Approaching Daily Limit:</strong> {queueStatus.booksRemaining} book{queueStatus.booksRemaining === 1 ? '' : 's'} remaining today ({queueStatus.dailyRemaining}/{queueStatus.dailyLimit} API calls)
                  </AlertDescription>
                </Alert>
              )}
              
              {queueStatus.queueLength > 1 && (
                <Alert className="mb-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertDescription className="text-blue-800 dark:text-blue-200">
                    <strong>{queueStatus.queueLength} books</strong> in queue. Your book will be processed soon!
                  </AlertDescription>
                </Alert>
              )}

              <h2 className="font-black text-4xl md:text-5xl mb-4">
                Creating Your Coloring Book...
              </h2>
              
              {/* AI Limitations & Rework Info */}
              <Alert className="mb-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-left">
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  <p className="font-semibold mb-2">📝 About Your Book</p>
                  <ul className="text-sm space-y-1 list-disc list-inside">
                    <li>AI may occasionally generate imperfect images</li>
                    <li>You can regenerate up to <strong>50% of pages</strong> after generation</li>
                    <li>Review your book carefully and use the rework feature if needed</li>
                  </ul>
                </AlertDescription>
              </Alert>
              <p className="text-lg text-muted-foreground mb-2">
                {queueStatus.queueLength > 1 
                  ? `Position #${queueStatus.queueLength} in queue • Usually takes 4 minutes per book`
                  : 'Usually takes 3-4 minutes'
                }
              </p>
              {generationProgress > 0 && (
                <p className="text-sm text-muted-foreground/70 mb-8">
                  {Math.round((Date.now() - startTime) / 1000 / 60)} min elapsed
                </p>
              )}

              {/* Progress Bar */}
              <div className="mb-6">
                <Progress value={generationProgress} className="h-3" />
                <p className="text-sm text-muted-foreground mt-2">{generationProgress}%</p>
              </div>
              
              {/* Cancel Button */}
              {generationProgress > 0 && generationProgress < 100 && !cancelling && (
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  size="lg"
                  className="mb-8"
                  disabled={cancelling}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel & Return to Dashboard
                </Button>
              )}
              
              {cancelling && (
                <p className="text-muted-foreground text-sm mb-8">
                  Cancelling generation...
                </p>
              )}

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
