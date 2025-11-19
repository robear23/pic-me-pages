import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { BookStep } from '@/store/bookStore';

interface ProgressBarProps {
  currentStep: BookStep;
}

const steps = [
  { id: 'upload', label: 'Upload' },
  { id: 'complexity', label: 'Complexity' },
  { id: 'interests', label: 'Interests' },
  { id: 'book-options', label: 'Options' },
  { id: 'generating', label: 'Generate' },
  { id: 'complete', label: 'Complete' },
];

export const ProgressBar = ({ currentStep }: ProgressBarProps) => {
  if (currentStep === 'hero') return null;

  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-background/50 border-b border-glass-border">
      <div className="max-w-4xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isUpcoming = index > currentIndex;

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <motion.div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                      isCompleted
                        ? 'bg-secondary border-secondary'
                        : isCurrent
                        ? 'bg-primary border-primary animate-pulse-slow'
                        : 'bg-muted/20 border-muted'
                    }`}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5 text-background" />
                    ) : (
                      <span className={`text-sm font-bold ${isCurrent ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                        {index + 1}
                      </span>
                    )}
                  </motion.div>
                  <span
                    className={`text-xs mt-2 font-medium ${
                      isCurrent ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex-1 h-0.5 bg-muted/20 mx-2 relative overflow-hidden">
                    {isCompleted && (
                      <motion.div
                        className="absolute inset-0 bg-secondary"
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
