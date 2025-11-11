import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import simpleImg from '@/assets/../public/examples/complexity-simple.png';
import mediumImg from '@/assets/../public/examples/complexity-medium.png';
import detailedImg from '@/assets/../public/examples/complexity-detailed.png';

export const SettingsStep = () => {
  const { 
    complexity, 
    artStyle, 
    consistentCharacters, 
    setComplexity, 
    setArtStyle, 
    toggleConsistentCharacters,
    setStep,
    isReworkMode
  } = useBookStore();

  const complexityOptions = [
    { 
      value: 'simple' as const, 
      label: 'Simple', 
      description: 'Perfect for ages 3-5',
      details: 'Thick outlines, large shapes, minimal detail',
      image: simpleImg
    },
    { 
      value: 'medium' as const, 
      label: 'Medium', 
      description: 'Great for ages 5-8',
      details: 'Balanced detail, moderate shapes',
      image: mediumImg
    },
    { 
      value: 'detailed' as const, 
      label: 'Detailed', 
      description: 'Best for ages 8+',
      details: 'Intricate lines, rich patterns',
      image: detailedImg
    },
  ];

  const artStyles = [
    { value: 'cartoon' as const, label: 'Cartoon', emoji: '🎨' },
    { value: 'realistic' as const, label: 'Realistic', emoji: '🖼️' },
    { value: 'minimalist' as const, label: 'Minimalist', emoji: '✨' },
    { value: 'whimsical' as const, label: 'Whimsical', emoji: '🌈' },
  ];

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
            Customize Your Book Style
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-12">
            Choose complexity and style to match your child's coloring skills
          </p>

          {/* Complexity Selection */}
          <div className="mb-12">
            <h3 className="text-xl font-bold mb-4">Detail Level</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {complexityOptions.map((option) => (
                <motion.button
                  key={option.value}
                  onClick={() => setComplexity(option.value)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-300 text-left ${
                    complexity === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-glass-border bg-input/20 hover:border-primary/50'
                  }`}
                >
                  {complexity === option.value && (
                    <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                  
                  {/* Example Image */}
                  <div className="aspect-square mb-3 rounded-lg overflow-hidden bg-background">
                    <img 
                      src={option.image} 
                      alt={`${option.label} complexity example`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  <h4 className="font-bold text-lg mb-1">{option.label}</h4>
                  <p className="text-sm text-muted-foreground mb-2">{option.description}</p>
                  <p className="text-xs text-muted-foreground">{option.details}</p>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Art Style Selection */}
          <div className="mb-12">
            <h3 className="text-xl font-bold mb-4">Art Style</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {artStyles.map((style) => (
                <motion.button
                  key={style.value}
                  onClick={() => setArtStyle(style.value)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-4 rounded-xl border-2 transition-all duration-300 ${
                    artStyle === style.value
                      ? 'border-primary bg-primary/10'
                      : 'border-glass-border bg-input/20 hover:border-primary/50'
                  }`}
                >
                  <div className="text-4xl mb-2">{style.emoji}</div>
                  <p className="font-semibold">{style.label}</p>
                </motion.button>
              ))}
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
