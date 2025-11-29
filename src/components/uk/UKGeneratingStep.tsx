import { motion } from 'framer-motion';
import { useUKBookStore } from '@/store/ukBookStore';
import { Sparkles, Check, Loader2, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { generateUKBookPdf } from '@/lib/ukPdfGenerator';
import { UK_PAGE_COUNT } from '@/types/ukBookOptions';

const UK_GENERATION_STEPS = [
  'Preparing generation',
  'Creating story prompts',
  'Generating 18 coloring pages',
  'Assembling A4 PDF with covers',
  'Finalizing your book',
];

export function UKGeneratingStep() {
  const {
    characters,
    selectedInterests,
    customPrompt,
    complexityLevel,
    ukOrderId,
    generatedBookId,
    setGeneratedBookId,
    setStep,
  } = useUKBookStore();

  const { toast } = useToast();

  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(UK_GENERATION_STEPS[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!isGenerating) {
      startUKGeneration();
    }
  }, []);

  const startUKGeneration = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      // Step 1: Prepare generation (0-10%)
      setCurrentStep(UK_GENERATION_STEPS[0]);
      setProgress(5);

      // Validate inputs
      if (!characters || characters.length === 0 || !characters[0].photos || characters[0].photos.length === 0) {
        throw new Error('Character photos are required');
      }

      const characterName = characters[0].name;
      const characterPhotos = characters[0].photos;

      // Validate that either interests OR custom prompt is provided
      const hasInterests = selectedInterests && selectedInterests.length > 0;
      const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;

      if (!hasInterests && !hasCustomPrompt) {
        throw new Error('Please provide either interests or a custom story/theme');
      }

      console.log('[UK Generation] Store state:', {
        characterName,
        photoCount: characterPhotos?.filter(p => p).length || 0,
        hasInterests,
        interests: selectedInterests,
        hasCustomPrompt,
        customPrompt: customPrompt?.substring(0, 50),
        complexityLevel,
        ukOrderId,
      });
      console.log('[UK Generation] Starting generation for:', characterName);
      console.log('[UK Generation] Target pages:', UK_PAGE_COUNT);

      // Step 2: Generate prompts (10-20%)
      setCurrentStep(UK_GENERATION_STEPS[1]);
      setProgress(10);

      const { data: promptsData, error: promptsError } = await supabase.functions.invoke(
        'generate-prompts',
        {
          body: {
            characters: characters.map(char => ({
              name: char.name,
              photos: char.photos
            })),
            interests: selectedInterests,
            customPrompt: customPrompt || null,
            consistentCharacters: true,
            targetPageCount: UK_PAGE_COUNT, // 18 pages
            complexityLevel: complexityLevel || 'medium'
          }
        }
      );

      if (promptsError) {
        console.error('[UK Generation] Prompts error:', promptsError);
        throw new Error(`Failed to generate prompts: ${promptsError.message}`);
      }

      if (!promptsData || !promptsData.prompts || promptsData.prompts.length === 0) {
        throw new Error('No prompts generated');
      }

      console.log('[UK Generation] Generated', promptsData.prompts.length, 'prompts');
      setProgress(20);

      // Step 3: Generate images (20-75%)
      setCurrentStep(UK_GENERATION_STEPS[2]);
      setProgress(20);

      console.log('[UK Generation] Calling generate-images with', promptsData.prompts.length, 'prompts');

      const { data: imagesData, error: imagesError } = await supabase.functions.invoke(
        'generate-images',
        {
          body: {
            prompts: promptsData.prompts,
            characters: [{
              name: characterName,
              photos: characterPhotos.filter((p: any) => p && typeof p === 'string')
            }],
            consistentCharacters: true,
            complexity: complexityLevel || 'medium'
          }
        }
      );

      setProgress(75);

      if (imagesError) {
        console.error('[UK Generation] Images error:', imagesError);
        throw new Error(`Failed to generate images: ${imagesError.message}`);
      }

      if (!imagesData || !imagesData.pages || imagesData.pages.length === 0) {
        throw new Error(`No pages generated. Got: ${imagesData?.pages?.length || 0}`);
      }

      // Log actual pages generated (may be less due to timeout/partial results)
      console.log('[UK Generation] Generated', imagesData.pages.length, 'pages');

      // Generate a unique book ID since generate-images doesn't create one
      const bookId = generatedBookId || crypto.randomUUID();
      setGeneratedBookId(bookId);

      console.log('[UK Generation] Generated', imagesData.pages.length, 'pages');
      console.log('[UK Generation] Book ID:', bookId);
      setProgress(75);

      // Step 4: Generate UK PDF (75-90%)
      setCurrentStep(UK_GENERATION_STEPS[3]);

      const pdfUrl = await generateUKBookPdf(
        bookId,
        imagesData.pages,
        characterName,
        (current, total) => {
          const pdfProgress = 75 + (current / total) * 15; // 75% to 90%
          setProgress(Math.min(pdfProgress, 90));
        }
      );

      console.log('[UK Generation] PDF generated:', pdfUrl);
      setProgress(90);

      // Step 5: Update order with PDF URL (90-100%)
      setCurrentStep(UK_GENERATION_STEPS[4]);

      if (ukOrderId) {
        const { error: updateError } = await supabase
          .from('orders_uk')
          .update({
            pdf_url: pdfUrl,
            book_id: bookId,
            status: 'pdf_sent'
          })
          .eq('id', ukOrderId);

        if (updateError) {
          console.error('[UK Generation] Failed to update order:', updateError);
          // Non-critical error - PDF is generated, just log it
        } else {
          console.log('[UK Generation] Order updated with PDF');
        }
      }

      setProgress(100);
      setCurrentStep('Complete!');

      // Wait a moment before transitioning
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Navigate to completion step
      setStep('uk-complete');

    } catch (error: any) {
      console.error('[UK Generation] Error:', error);
      setErrorMessage(error.message || 'An unexpected error occurred');
      
      toast({
        title: 'Generation Failed',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetry = () => {
    setErrorMessage(null);
    setProgress(0);
    setCurrentStep(UK_GENERATION_STEPS[0]);
    startUKGeneration();
  };

  const handleBack = () => {
    setStep('uk-product-selection');
  };

  if (errorMessage) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full"
        >
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              <strong>Generation Failed</strong>
              <p className="mt-2 text-sm">{errorMessage}</p>
            </AlertDescription>
          </Alert>

          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={handleBack}>
              Back to Selection
            </Button>
            <Button onClick={handleRetry}>
              Try Again
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center max-w-2xl w-full"
      >
        {/* Animated Icon */}
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="mb-8 flex justify-center"
        >
          <div className="relative">
            <Sparkles className="w-24 h-24 text-primary" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Loader2 className="w-16 h-16 text-primary/50" />
            </motion.div>
          </div>
        </motion.div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-foreground mb-4">
          Creating Your Book
        </h1>

        <p className="text-xl text-muted-foreground mb-8">
          {characters[0]?.name}'s personalized coloring adventure
        </p>

        {/* Current Step */}
        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-2">
            {currentStep}
          </p>
          <Progress value={progress} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            {Math.round(progress)}% Complete
          </p>
        </div>

        {/* Generation Steps */}
        <div className="space-y-3 mb-8">
          {UK_GENERATION_STEPS.map((step, index) => {
            const stepNumber = index + 1;
            const isCompleted = progress >= (stepNumber / UK_GENERATION_STEPS.length) * 100;
            const isCurrent = currentStep.includes(step);

            return (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  isCurrent
                    ? 'bg-primary/10 border border-primary/20'
                    : isCompleted
                    ? 'bg-muted/50'
                    : 'bg-muted/20'
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isCurrent
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span className="text-sm font-semibold">{stepNumber}</span>
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {step}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Info Message */}
        <Alert className="bg-primary/5 border-primary/20">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertDescription className="ml-2">
            <p className="text-sm text-muted-foreground">
              We're creating 18 unique coloring pages just for {characters[0]?.name}! 
              This usually takes 2-4 minutes.
            </p>
          </AlertDescription>
        </Alert>
      </motion.div>
    </div>
  );
}
