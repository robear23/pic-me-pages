import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useBookStore } from '@/store/bookStore';
import { useUKBookStore } from '@/store/ukBookStore';
import { Sparkles, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';

const suggestionExamples = [
  "Theme - space travel",
  "Place characters in story of Aladdin",
  "Underwater adventure",
  "Superhero origin story",
  "Magical forest quest",
  "Time travel through history",
];

// SAFE PROMPT GUIDE: Activities that may need safety modifications
const POTENTIALLY_RISKY_INTERESTS = [
  'rock climbing', 'climbing', 'cycling', 'biking', 'bike', 'swimming', 'diving',
  'skiing', 'snowboarding', 'skateboarding', 'skating', 'football', 'soccer',
  'martial arts', 'karate', 'boxing', 'gymnastics', 'horse riding', 'archery',
  'surfing', 'trampoline', 'parkour'
];

// SAFE PROMPT GUIDE: Safe alternatives for risky interests
const SAFETY_MODIFICATIONS: Record<string, string> = {
  'rock climbing': 'indoor rock climbing with safety equipment',
  'climbing': 'indoor climbing with safety gear',
  'cycling': 'cycling with a helmet',
  'biking': 'biking with safety gear',
  'skateboarding': 'skateboarding with helmet and pads',
  'skating': 'skating with protective gear',
  'swimming': 'swimming with floaties',
  'football': 'playing catch',
  'soccer': 'kicking a ball in the garden',
  'martial arts': 'practicing exercise poses',
  'karate': 'doing stretches',
  'boxing': 'exercising',
  'gymnastics': 'dancing gracefully',
  'horse riding': 'visiting friendly animals',
  'archery': 'outdoor activities',
  'surfing': 'playing at the beach',
  'skiing': 'playing in the snow',
  'snowboarding': 'building a snowman',
  'trampoline': 'jumping happily',
  'parkour': 'exploring the neighborhood'
};

interface InterestsStepProps {
  isUKFlow?: boolean;
}

export const InterestsStep = ({ isUKFlow = false }: InterestsStepProps) => {
  const mainStore = useBookStore();
  const ukStore = useUKBookStore();
  
  const { characters, selectedInterests, customPrompt, setInterests, setCustomPrompt, setStep } = isUKFlow
    ? {
        characters: ukStore.characters,
        selectedInterests: ukStore.selectedInterests,
        customPrompt: ukStore.customPrompt,
        setInterests: ukStore.setSelectedInterests,
        setCustomPrompt: ukStore.setCustomPrompt,
        setStep: (step: string) => ukStore.setStep(step as any),
      }
    : mainStore;
  const [interestsText, setInterestsText] = useState(selectedInterests.join(', '));
  const [promptText, setPromptText] = useState(customPrompt);
  const navigate = useNavigate();

  // Parse comma-separated interests
  const parsedInterests = interestsText
    .split(',')
    .map(i => i.trim())
    .filter(i => i.length > 0);
  
  // SAFE PROMPT GUIDE: Check for potentially risky interests
  const riskyInterests = useMemo(() => {
    const combined = [...parsedInterests, promptText.toLowerCase()].join(' ').toLowerCase();
    return POTENTIALLY_RISKY_INTERESTS.filter(risky => combined.includes(risky));
  }, [parsedInterests, promptText]);
  
  const hasRiskyInterests = riskyInterests.length > 0;
  
  // Valid if either interests OR custom prompt provided
  const isComplete = parsedInterests.length >= 1 || promptText.trim().length > 0;
  
  const handleNext = () => {
    // Apply safety modifications to interests
    let safeInterests = parsedInterests.map(interest => {
      const lowerInterest = interest.toLowerCase();
      for (const [risky, safe] of Object.entries(SAFETY_MODIFICATIONS)) {
        if (lowerInterest.includes(risky)) {
          return interest.replace(new RegExp(risky, 'gi'), safe);
        }
      }
      return interest;
    });
    
    setInterests(safeInterests);
    setCustomPrompt(promptText);
    if (isUKFlow) {
      (setStep as any)('uk-product-selection');
    } else {
      setStep('book-options');
    }
  };

  const handleBack = () => {
    if (isUKFlow) {
      (setStep as any)('uk-complexity');
    } else {
      setStep('complexity');
    }
  };

  const handleReturnToDashboard = () => {
    navigate('/dashboard');
  };

  const handleSuggestionClick = (suggestion: string) => {
    setPromptText(suggestion);
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
        {/* Navigation */}
        <div className="flex justify-between items-center mb-6">
          <Button
            onClick={handleBack}
            variant="ghost"
            size="sm"
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button
            onClick={handleReturnToDashboard}
            variant="ghost"
            size="sm"
          >
            Return to Dashboard
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="backdrop-blur-lg bg-glass-bg border border-glass-border rounded-2xl p-8 md:p-12"
        >
          <h2 className="font-black text-4xl md:text-5xl mb-4 text-center">
            Interests, Themes & Story
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-8">
            Add quick interests or describe a custom theme/story for your coloring book
          </p>

          {/* Quick Interests Input */}
          <div className="space-y-4 mb-8">
            <label className="text-sm font-semibold">Quick Interests (Optional)</label>
            <Textarea
              value={interestsText}
              onChange={(e) => setInterestsText(e.target.value)}
              placeholder="e.g., dinosaurs, space exploration, ocean animals, painting, soccer..."
              className="min-h-[100px] text-base backdrop-blur-sm bg-input/50 border-glass-border resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Separate interests with commas • {parsedInterests.length} interest{parsedInterests.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Custom Prompt Section */}
          <div className="space-y-4 mb-8">
            <label className="text-sm font-semibold">Custom Story or Theme (Optional)</label>
            <Textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Describe a theme or story for your coloring book. Example: 'Space adventure where characters explore different planets' or 'Characters as pirates searching for treasure'"
              className="min-h-[120px] text-base backdrop-blur-sm bg-input/50 border-glass-border resize-none"
            />
            
            {/* Suggestion Examples */}
            <div>
              <p className="text-xs text-muted-foreground mb-3">Try these examples:</p>
              <div className="flex flex-wrap gap-2">
                {suggestionExamples.map((suggestion) => (
                  <Badge
                    key={suggestion}
                    variant="secondary"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Safety Notice for Risky Interests */}
          {hasRiskyInterests && (
            <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                <span className="font-medium">Note:</span> We'll automatically adjust{' '}
                {riskyInterests.map((r, i) => (
                  <span key={r}>
                    <span className="font-semibold">"{r}"</span>
                    {i < riskyInterests.length - 1 ? ', ' : ''}
                  </span>
                ))}{' '}
                to be more suitable for AI-generated coloring book illustrations.
              </AlertDescription>
            </Alert>
          )}

          {/* Generate Button */}
          <Button
            onClick={handleNext}
            disabled={!isComplete}
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-[hsl(330_80%_60%)] hover:scale-105 transition-transform duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Continue to Book Options
          </Button>

          {!isComplete && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Please provide either interests or a custom story/theme
            </p>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};
