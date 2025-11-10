import { motion } from 'framer-motion';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useBookStore } from '@/store/bookStore';
import { Sparkles } from 'lucide-react';

export const InterestsStep = () => {
  const { characterName, selectedInterests, setStep } = useBookStore();
  const [interestsText, setInterestsText] = useState(selectedInterests.join(', '));

  // Parse comma-separated interests
  const parsedInterests = interestsText
    .split(',')
    .map(i => i.trim())
    .filter(i => i.length > 0);
  
  const isComplete = parsedInterests.length >= 3 && parsedInterests.length <= 5;
  
  const handleNext = () => {
    // Update store with parsed interests array
    useBookStore.setState({ selectedInterests: parsedInterests });
    setStep('generating');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex items-center justify-center px-6 pt-24 pb-12"
    >
      <div className="max-w-4xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="backdrop-blur-lg bg-glass-bg border border-glass-border rounded-2xl p-8 md:p-12"
        >
          <h2 className="font-black text-4xl md:text-5xl mb-4 text-center">
            What Does {characterName} Love?
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-8">
            Enter 3-5 interests to personalize the coloring book
          </p>

          {/* Interests Input */}
          <div className="space-y-4 mb-8">
            <Textarea
              value={interestsText}
              onChange={(e) => setInterestsText(e.target.value)}
              placeholder="e.g., dinosaurs, space exploration, ocean animals, painting, soccer"
              className="min-h-[120px] text-base backdrop-blur-sm bg-input/50 border-glass-border resize-none"
            />
            
            {/* Counter */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Separate interests with commas
              </p>
              <div
                className={`px-4 py-1.5 rounded-full backdrop-blur-sm border text-sm transition-all duration-300 ${
                  isComplete
                    ? 'bg-secondary/20 border-secondary text-secondary-foreground'
                    : parsedInterests.length > 5
                    ? 'bg-destructive/20 border-destructive text-destructive'
                    : 'bg-primary/10 border-primary/30 text-foreground'
                }`}
              >
                <span className="font-bold">
                  {parsedInterests.length}/5 interests
                </span>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleNext}
            disabled={!isComplete}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Generate My Book
          </Button>

          {!isComplete && parsedInterests.length < 3 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Please enter at least 3 interests
            </p>
          )}
          
          {parsedInterests.length > 5 && (
            <p className="text-sm text-destructive text-center mt-4">
              Please enter no more than 5 interests
            </p>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};
