import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useBookStore } from '@/store/bookStore';
import { ArrowLeft, Check } from 'lucide-react';
import { ComplexityLevel } from '@/store/bookStore';
import { useNavigate } from 'react-router-dom';

const complexityOptions: Array<{
  level: ComplexityLevel;
  title: string;
  description: string;
  ageRange: string;
  image: string;
}> = [
  {
    level: 'simple',
    title: 'Simple',
    description: 'Large shapes with bold outlines and minimal detail',
    ageRange: 'Ages 3-5',
    image: '/examples/complexity-simple.png',
  },
  {
    level: 'medium',
    title: 'Medium',
    description: 'Balanced detail with moderate complexity',
    ageRange: 'Ages 5-6',
    image: '/examples/complexity-medium.png',
  },
  {
    level: 'detailed',
    title: 'Detailed',
    description: 'Intricate patterns and fine details',
    ageRange: 'Ages 7-8 & Adults',
    image: '/examples/complexity-detailed.png',
  },
];

export const ComplexityStep = () => {
  const { 
    complexityLevel, 
    setComplexityLevel,
    setStep,
    isReworkMode
  } = useBookStore();
  const navigate = useNavigate();

  const handleNext = () => {
    if (isReworkMode) {
      setStep('generating');
    } else {
      setStep('interests');
    }
  };

  const handleBack = () => {
    setStep('upload');
  };

  const handleReturnToDashboard = () => {
    navigate('/dashboard');
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
            Choose Complexity
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-8">
            Select the level of detail for your coloring pages
          </p>

          {/* Complexity Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {complexityOptions.map((option) => (
              <motion.div
                key={option.level}
                onClick={() => setComplexityLevel(option.level)}
                className={`relative cursor-pointer rounded-xl p-6 border-2 transition-all duration-300 ${
                  complexityLevel === option.level
                    ? 'border-primary bg-primary/10 scale-105'
                    : 'border-glass-border bg-input/20 hover:border-primary/50'
                }`}
                whileHover={{ y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Selection Indicator */}
                {complexityLevel === option.level && (
                  <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-5 h-5 text-primary-foreground" />
                  </div>
                )}

                {/* Example Image */}
                <div className="mb-4 rounded-lg overflow-hidden aspect-square bg-muted/50">
                  <img
                    src={option.image}
                    alt={`${option.title} complexity example`}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Option Details */}
                <h3 className="text-xl font-bold mb-2">{option.title}</h3>
                <p className="text-sm text-primary font-semibold mb-2">
                  {option.ageRange}
                </p>
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              </motion.div>
            ))}
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
