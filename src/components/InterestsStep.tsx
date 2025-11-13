import { motion } from 'framer-motion';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useBookStore } from '@/store/bookStore';
import { Sparkles } from 'lucide-react';

export const InterestsStep = () => {
  const { characters, selectedInterests, setInterests, setStep } = useBookStore();
  const [interestsText, setInterestsText] = useState(selectedInterests.join(', '));

  // Parse comma-separated interests
  const parsedInterests = interestsText
    .split(',')
    .map(i => i.trim())
    .filter(i => i.length > 0);
  
  const isComplete = parsedInterests.length >= 1;
  const characterNames = characters.map(c => c.name).filter(Boolean).join(', ');
  
  const handleNext = () => {
    setInterests(parsedInterests);
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
            What Do They Love?
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-2">
            Enter 1 or more interests to personalize the coloring book
          </p>
          <p className="text-sm text-muted-foreground text-center mb-8">
            ✨ No limit! Add as many interests as you'd like
          </p>

          {/* Interests Input */}
          <div className="space-y-4 mb-8">
            <Textarea
              value={interestsText}
              onChange={(e) => setInterestsText(e.target.value)}
              placeholder="e.g., dinosaurs, space exploration, ocean animals, painting, soccer, music, unicorns, robots, baking..."
              className="min-h-[150px] text-base backdrop-blur-sm bg-input/50 border-glass-border resize-none"
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
                    : 'bg-primary/10 border-primary/30 text-foreground'
                }`}
              >
                <span className="font-bold">
                  {parsedInterests.length} interest{parsedInterests.length !== 1 ? 's' : ''}
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
            Generate {characterNames ? `${characterNames}'s` : 'My'} Book
          </Button>

          {!isComplete && parsedInterests.length < 1 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Please enter at least 1 interest
            </p>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};
