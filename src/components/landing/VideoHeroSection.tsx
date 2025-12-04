import { motion } from 'framer-motion';
import { useRef, useEffect } from 'react';
import { Camera, Sparkles, BookOpen, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoNarrow from '@/assets/logo_narrow.png';

export const VideoHeroSection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.log('Video autoplay prevented:', error);
      });
    }
  }, []);

  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden pt-32">
      {/* Video Background */}
      <div className="absolute inset-0 -z-10">
        {/* Fallback gradient if video doesn't load */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-secondary/20" />
        
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src="/videos/Final-4.mp4" type="video/mp4" />
        </video>
        {/* Lighter overlay for better video visibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/20 to-background/40" />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8 md:p-12 text-center"
        >
          {/* Logo/Headline Image */}
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <img 
              src={logoNarrow}
              alt="Color Me In Books" 
              className="h-24 sm:h-32 md:h-40 lg:h-48 mx-auto object-contain"
            />
          </motion.div>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-lg sm:text-xl md:text-2xl text-foreground/90 max-w-3xl mx-auto mb-8"
          >
            Personalized AI coloring books featuring your child in adventures based on what they love—or stories you choose together.
          </motion.p>

          {/* Key Benefits */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-10"
          >
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              <span className="text-base font-medium">Upload 1 photo</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-base font-medium">Choose interests or pick a story</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <span className="text-base font-medium">Get your custom book</span>
            </div>
          </motion.div>

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Button
              onClick={() => window.location.href = '/auth'}
              size="lg"
              className="bg-gradient-to-r from-primary to-secondary hover:scale-105 transition-all duration-300 shadow-xl text-lg px-8 py-6 rounded-full font-semibold"
            >
              Create Your Book Now
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};
