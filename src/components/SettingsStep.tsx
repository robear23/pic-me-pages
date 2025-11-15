import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export const SettingsStep = () => {
  const { 
    consistentCharacters, 
    toggleConsistentCharacters,
    setStep,
    isReworkMode
  } = useBookStore();

  const handleNext = () => {
    if (isReworkMode) {
      setStep('generating');
    } else {
      setStep('interests');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12"
    >
      <div className="max-w-5xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="backdrop-blur-lg bg-glass-bg border border-glass-border rounded-2xl p-8 md:p-12"
        >
          <h2 className="font-black text-4xl md:text-5xl mb-4 text-center">
            Book Settings
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-8">
            Your book will use our photogenic illustrated style automatically
          </p>

          {/* Style Info */}
          <div className="mb-8 p-6 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="text-lg font-bold mb-2">Photogenic Illustrated Style</h3>
                <p className="text-sm text-muted-foreground">
                  High-quality illustrated portraits with soft, natural lighting and flattering composition. 
                  Characters will be recognizable and consistent across all pages, perfect for personalized coloring books.
                </p>
              </div>
            </div>
          </div>

          {/* Character Consistency Toggle */}
          <div className="mb-8 p-6 rounded-xl bg-input/20 border border-glass-border">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-1">Consistent Character Appearance</h3>
                <p className="text-sm text-muted-foreground">
                  Keep characters looking the same across all pages for a cohesive story
                </p>
              </div>
              <Switch
                checked={consistentCharacters}
                onCheckedChange={toggleConsistentCharacters}
                className="ml-4"
              />
            </div>
          </div>

          {/* Next Button */}
          <Button
            onClick={handleNext}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300"
          >
            {isReworkMode ? 'Generate Reworks' : 'Next: Choose Interests'}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
};
