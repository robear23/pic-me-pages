import { motion } from 'framer-motion';
import { Sparkles, Upload, Palette, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WaitlistForm } from '@/components/WaitlistForm';
import { ExampleGallery } from '@/components/ExampleGallery';
import { FAQ } from '@/components/FAQ';
import { Footer } from '@/components/Footer';

const WaitingList = () => {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Gradient */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'linear-gradient(to bottom right, hsl(222 47% 11%), hsl(280 80% 20% / 0.2), hsl(222 47% 11%))',
        }}
      />

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Status Badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center mb-8"
          >
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Launching Soon</span>
            </div>
          </motion.div>

          {/* Main Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center mb-12"
          >
            <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
              Personalized AI Coloring Books
              <br />
              <span className="text-primary">Featuring YOUR Child</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-8">
              Upload photos + pick interests = a custom coloring book in minutes.
              <br />
              Your child becomes the star of their own adventure.
            </p>
          </motion.div>

          {/* Waitlist Form */}
          <WaitlistForm />

          {/* Sign In Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center mt-6"
          >
            <p className="text-muted-foreground">
              Already have an account?{' '}
              <Button
                variant="link"
                className="p-0 h-auto font-semibold text-primary"
                onClick={() => window.location.href = '/auth'}
              >
                Sign in here
              </Button>
            </p>
          </motion.div>

          {/* Benefits Grid */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="grid md:grid-cols-3 gap-8 mt-16 max-w-5xl mx-auto"
          >
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Upload 3 Photos</h3>
              <p className="text-muted-foreground">
                Your child appears consistently in every coloring page
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Palette className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Pick Their Interests</h3>
              <p className="text-muted-foreground">
                Dinosaurs, space, art, sports — choose what they love most
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Download className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Download & Print</h3>
              <p className="text-muted-foreground">
                12 unique pages ready to print at home or order professionally bound
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Example Gallery */}
      <ExampleGallery />

      {/* FAQ Section */}
      <FAQ />

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default WaitingList;
