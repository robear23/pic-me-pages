import { AnimatePresence } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { HeroSection } from '@/components/HeroSection';
import { ProgressBar } from '@/components/ProgressBar';
import { UploadStep } from '@/components/UploadStep';
import { SettingsStep } from '@/components/SettingsStep';
import { InterestsStep } from '@/components/InterestsStep';
import { BookOptionsStep } from '@/components/BookOptionsStep';
import { GeneratingStep } from '@/components/GeneratingStep';
import { CompleteStep } from '@/components/CompleteStep';
import { ReworkSettingsStep } from '@/components/ReworkSettingsStep';

const Index = () => {
  const currentStep = useBookStore((state) => state.currentStep);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Gradient */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'linear-gradient(to bottom right, hsl(222 47% 11%), hsl(280 80% 20% / 0.2), hsl(222 47% 11%))',
        }}
      />

      <ProgressBar currentStep={currentStep} />

      <AnimatePresence mode="wait">
        {currentStep === 'hero' && <HeroSection key="hero" />}
        {currentStep === 'upload' && <UploadStep key="upload" />}
        {currentStep === 'settings' && <SettingsStep key="settings" />}
        {currentStep === 'interests' && <InterestsStep key="interests" />}
        {currentStep === 'book-options' && <BookOptionsStep key="book-options" />}
        {currentStep === 'generating' && <GeneratingStep key="generating" />}
        {currentStep === 'complete' && <CompleteStep key="complete" />}
        {currentStep === 'rework-settings' && <ReworkSettingsStep key="rework-settings" />}
      </AnimatePresence>
    </div>
  );
};

export default Index;
