import { LandingNavigation } from '@/components/landing/LandingNavigation';
import { VideoHeroSection } from '@/components/landing/VideoHeroSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { ExampleGallery } from '@/components/ExampleGallery';
import { FAQ } from '@/components/FAQ';
import { FinalCTASection } from '@/components/landing/FinalCTASection';
import { Footer } from '@/components/Footer';

const WaitingList = () => {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavigation />
      <VideoHeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <ExampleGallery />
      <FAQ />
      <FinalCTASection />
      <Footer />
    </div>
  );
};

export default WaitingList;
