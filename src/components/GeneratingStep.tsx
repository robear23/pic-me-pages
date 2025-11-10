import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Progress } from '@/components/ui/progress';

const GENERATION_STEPS = [
  'Analyzing your photos',
  'Understanding interests',
  'Creating story prompts',
  'Generating coloring pages',
  'Finalizing your book',
];

export const GeneratingStep = () => {
  const { generationProgress, generationStatus, setGenerationProgress, setGenerationStatus, setStep } = useBookStore();

  useEffect(() => {
    // Simulate generation process
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress += 2;
      if (currentProgress >= 100) {
        clearInterval(progressInterval);
        setGenerationProgress(100);
        setTimeout(() => setStep('complete'), 500);
      } else {
        setGenerationProgress(currentProgress);
      }
    }, 100);

    const statusInterval = setInterval(() => {
      const stepIndex = Math.floor((currentProgress / 100) * GENERATION_STEPS.length);
      if (stepIndex < GENERATION_STEPS.length) {
        setGenerationStatus(GENERATION_STEPS[stepIndex]);
      }
    }, 200);

    return () => {
      clearInterval(progressInterval);
      clearInterval(statusInterval);
    };
  }, [setGenerationProgress, setGenerationStatus, setStep]);

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
