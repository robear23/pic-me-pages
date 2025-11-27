import { AnimatePresence } from 'framer-motion';
import { useUKBookStore } from '@/store/ukBookStore';
import { UKHeroSection } from '@/components/uk/UKHeroSection';
import { UploadStep } from '@/components/UploadStep';
import { ComplexityStep } from '@/components/ComplexityStep';
import { InterestsStep } from '@/components/InterestsStep';
import { UKProductSelection } from '@/components/uk/UKProductSelection';
import { UKPaymentStep } from '@/components/uk/UKPaymentStep';
import { UKGeneratingStep } from '@/components/uk/UKGeneratingStep';
import { UKCompleteStep } from '@/components/uk/UKCompleteStep';

const UKCreate = () => {
  const currentStep = useUKBookStore((state) => state.currentStep);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Gradient */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'linear-gradient(to bottom right, hsl(222 47% 11%), hsl(280 80% 20% / 0.2), hsl(222 47% 11%))',
        }}
      />

      <AnimatePresence mode="wait">
        {currentStep === 'uk-hero' && <UKHeroSection key="uk-hero" />}
        {currentStep === 'uk-upload' && <UploadStep key="uk-upload" isUKFlow={true} />}
        {currentStep === 'uk-complexity' && <ComplexityStep key="uk-complexity" isUKFlow={true} />}
        {currentStep === 'uk-interests' && <InterestsStep key="uk-interests" isUKFlow={true} />}
        {currentStep === 'uk-product-selection' && <UKProductSelection key="uk-product-selection" />}
        {currentStep === 'uk-payment' && <UKPaymentStep key="uk-payment" />}
        {currentStep === 'uk-generating' && <UKGeneratingStep key="uk-generating" />}
        {currentStep === 'uk-complete' && <UKCompleteStep key="uk-complete" />}
      </AnimatePresence>
    </div>
  );
};

export default UKCreate;
