import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { generatePrompts, generateImages } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { GeneratedPrompt } from '@/lib/api';

const GENERATION_STEPS = [
  'Analyzing your photos',
  'Understanding interests',
  'Creating story prompts',
  'Generating coloring pages',
  'Finalizing your book',
];

export const GeneratingStep = () => {
  const { 
    characterName, 
    selectedInterests, 
    characterPhotos,
    generationProgress, 
    generationStatus, 
    setGenerationProgress, 
    setGenerationStatus, 
    setStep,
    setGeneratedPages,
    setApiError 
  } = useBookStore();
  
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([]);

  useEffect(() => {
    const runGeneration = async () => {
      try {
        // Step 1: Analyzing photos (0-20%)
        setGenerationStatus(GENERATION_STEPS[0]);
        setGenerationProgress(10);
        
        // Convert File objects to base64
        const photoPromises = characterPhotos
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
        setGenerationProgress(20);

        // Step 2: Understanding interests (20-40%)
        setGenerationStatus(GENERATION_STEPS[1]);
        console.log('Generating prompts for:', characterName, selectedInterests);
        
        const { prompts: generatedPrompts } = await generatePrompts(characterName, selectedInterests);
        setPrompts(generatedPrompts);
        setGenerationProgress(40);
        
        console.log('Generated prompts:', generatedPrompts);

        // Step 3: Creating story prompts (40-50%)
        setGenerationStatus(GENERATION_STEPS[2]);
        setGenerationProgress(50);

        // Step 4: Generating coloring pages (50-90%)
        setGenerationStatus(GENERATION_STEPS[3]);
        console.log('Generating images with character name in prompts...');
        
        // Ensure character name is in each prompt
        const promptsWithCharacter = generatedPrompts.map(p => ({
          ...p,
          characterName: characterName
        }));
        
        const { pages, successCount } = await generateImages(promptsWithCharacter, base64Photos);
        setGenerationProgress(90);
        
        console.log(`Generated ${successCount}/12 images`);
        setGeneratedPages(pages);

        // Step 5: Finalizing (90-100%)
        setGenerationStatus(GENERATION_STEPS[4]);
        setGenerationProgress(95);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        setGenerationProgress(100);

        if (successCount < 12) {
          toast({
            title: 'Partial Success',
            description: `Generated ${successCount} out of 12 pages. Some pages may need regeneration.`,
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
    characterName, 
    selectedInterests, 
    characterPhotos,
    setGenerationProgress, 
    setGenerationStatus, 
    setStep,
    setGeneratedPages,
    setApiError,
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
