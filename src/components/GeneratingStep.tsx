import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { generatePrompts, generateImages, generateCover } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { saveBookToDatabase } from '@/lib/bookStorage';
import type { GeneratedPrompt } from '@/lib/api';

const GENERATION_STEPS = [
  'Analyzing your photos',
  'Understanding interests',
  'Creating story prompts',
  'Generating coloring pages',
  'Creating book cover',
  'Creating print-ready PDFs',
  'Finalizing your book',
];

export const GeneratingStep = () => {
  const { 
    characters,
    selectedInterests,
    consistentCharacters,
    selectedPageCount,
    selectedBinding,
    selectedPrice,
    selectedPodPackageId,
    generationProgress,
    generationStatus,
    isReworkMode,
    selectedPagesForRework,
    generatedPages,
    setGenerationProgress, 
    setGenerationStatus, 
    setStep,
    setGeneratedPages,
    setApiError,
    setGeneratedBookId,
    setCoverImageUrl,
    completeRework
  } = useBookStore();
  
  const { user } = useAuth();
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);

  useEffect(() => {
    const runGeneration = async () => {
      try {
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
        console.log('Generating prompts for:', charactersWithPhotos.map(c => c.name).join(', '), selectedInterests);
        
        const { prompts: generatedPrompts } = await generatePrompts(
          charactersWithPhotos, 
          selectedInterests,
          consistentCharacters,
          selectedPageCount
        );
        setPrompts(generatedPrompts);
        setGenerationProgress(40);
        
        console.log('Generated prompts:', generatedPrompts);

        // Step 3: Creating story prompts (40-50%)
        setGenerationStatus(GENERATION_STEPS[2]);
        setGenerationProgress(50);

        // Step 4: Generating coloring pages (50-90%)
        setGenerationStatus(GENERATION_STEPS[3]);
        console.log('Generating images with batch processing...');
        
        // If in rework mode, only regenerate selected pages
        let finalPages;
        if (isReworkMode && selectedPagesForRework.length > 0) {
          const promptsToRework = generatedPrompts.filter(p => 
            selectedPagesForRework.includes(p.pageNumber)
          );
          
          // Process rework in batches
          const BATCH_SIZE = 3;
          const totalBatches = Math.ceil(promptsToRework.length / BATCH_SIZE);
          let allReworkedPages: any[] = [];
          
          for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            setGenerationStatus(`${GENERATION_STEPS[3]} (batch ${batchIndex + 1}/${totalBatches})`);
            console.log(`Processing rework batch ${batchIndex + 1}/${totalBatches}`);
            
            const { pages: batchPages } = await generateImages(
              promptsToRework,
              charactersWithPhotos,
              consistentCharacters,
              batchIndex,
              BATCH_SIZE
            );
            
            allReworkedPages = [...allReworkedPages, ...batchPages];
            
            // Update progress within the 50-90% range
            const batchProgress = 50 + (40 * (batchIndex + 1) / totalBatches);
            setGenerationProgress(Math.round(batchProgress));
          }
          
          // Merge with existing pages
          finalPages = generatedPages.map(page => {
            const reworked = allReworkedPages.find(p => p.pageNumber === page.pageNumber);
            return reworked || page;
          });
          
          completeRework();
        } else {
          // Process all pages in batches
          const BATCH_SIZE = 3;
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
              BATCH_SIZE
            );
            
            allPages = [...allPages, ...batchPages];
            
            // Update progress within the 50-90% range
            const batchProgress = 50 + (40 * (batchIndex + 1) / totalBatches);
            setGenerationProgress(Math.round(batchProgress));
          }
          
          finalPages = allPages;
        }
        
        setGenerationProgress(90);
        
        const successCount = finalPages.filter(p => p.imageUrl).length;
        console.log(`Generated ${successCount}/${finalPages.length} images`);
        setGeneratedPages(finalPages);

        // Step 5: Creating book cover (90-92%)
        setGenerationStatus(GENERATION_STEPS[4]);
        let coverImageUrl: string | null = null;
        
        if (!isReworkMode) {
          try {
            console.log('Generating cover...');
            const { coverImage } = await generateCover(
              characters.map(c => c.name).filter(Boolean).join(' and '),
              selectedInterests,
              charactersWithPhotos
            );
            coverImageUrl = coverImage;
            setCoverImageUrl(coverImage);
            console.log('Cover generated successfully');
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
        
        // Save book to database if user is authenticated and not in rework mode
        if (user && !isReworkMode) {
          try {
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
              selectedPageCount,
              selectedBinding,
              selectedPrice,
              selectedPodPackageId,
            });

            if (bookId) {
              console.log('Book saved to database:', bookId);
              setGeneratedBookId(bookId);
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
        
        setApiError(errorMessage);
        toast({
          title: 'Generation Failed',
          description: errorMessage,
          variant: 'destructive',
        });

        // Reset after showing error
        setTimeout(() => {
          setStep('interests');
        }, 3000);
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
        </motion.div>
      </div>
    </motion.div>
  );
};
