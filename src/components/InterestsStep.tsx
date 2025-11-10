import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { Check, Sparkles } from 'lucide-react';

const INTERESTS = [
  { id: 'dinosaurs', label: 'Dinosaurs', emoji: '🦕' },
  { id: 'space', label: 'Space', emoji: '🚀' },
  { id: 'ocean', label: 'Ocean', emoji: '🐠' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'art', label: 'Art', emoji: '🎨' },
  { id: 'music', label: 'Music', emoji: '🎵' },
  { id: 'vehicles', label: 'Vehicles', emoji: '🚗' },
  { id: 'animals', label: 'Animals', emoji: '🐶' },
  { id: 'superheroes', label: 'Superheroes', emoji: '🦸' },
  { id: 'fairies', label: 'Fairies', emoji: '✨' },
  { id: 'construction', label: 'Construction', emoji: '🏗️' },
  { id: 'nature', label: 'Nature', emoji: '🌻' },
];

export const InterestsStep = () => {
  const { characterName, selectedInterests, toggleInterest, setStep } = useBookStore();

  const isComplete = selectedInterests.length >= 3 && selectedInterests.length <= 5;

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
            Select 3-5 interests to personalize the coloring book
          </p>

          {/* Counter */}
          <div className="flex justify-center mb-8">
            <div
              className={`px-6 py-2 rounded-full backdrop-blur-sm border transition-all duration-300 ${
                isComplete
                  ? 'bg-secondary/20 border-secondary text-secondary-foreground'
                  : 'bg-primary/10 border-primary/30 text-foreground'
              }`}
            >
              <span className="font-bold">
                Selected: {selectedInterests.length}/5
              </span>
            </div>
          </div>

          {/* Interest Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {INTERESTS.map((interest, index) => {
              const isSelected = selectedInterests.includes(interest.id);
              return (
                <motion.button
                  key={interest.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => toggleInterest(interest.id)}
                  className={`relative p-6 rounded-xl border-2 transition-all duration-300 ${
                    isSelected
                      ? 'bg-gradient-to-br from-primary/30 to-[hsl(330_80%_60%/0.3)] border-primary shadow-lg shadow-primary/20'
                      : 'bg-input/30 border-glass-border hover:bg-input/50 hover:border-primary/50'
                  }`}
                >
                  <div className="text-4xl mb-2">{interest.emoji}</div>
                  <div className="font-bold text-sm">{interest.label}</div>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-2 right-2 w-6 h-6 bg-secondary rounded-full flex items-center justify-center"
                    >
                      <Check className="w-4 h-4 text-background" />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Generate Button */}
          <Button
            onClick={() => setStep('generating')}
            disabled={!isComplete}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Generate My Book
          </Button>

          {!isComplete && selectedInterests.length < 3 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Please select at least 3 interests
            </p>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};
