import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoNarrow from '@/assets/logo_narrow.png';

export const LandingNavigation = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? 'bg-background/95 backdrop-blur-md shadow-lg' : 'bg-background/80 backdrop-blur-sm'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center"
            >
              <img src={logoNarrow} alt="Color Me In Books" className="h-14" />
            </button>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-foreground hover:text-primary transition-colors font-medium"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection('examples')}
                className="text-foreground hover:text-primary transition-colors font-medium"
              >
                Examples
              </button>
              <button
                onClick={() => scrollToSection('faq')}
                className="text-foreground hover:text-primary transition-colors font-medium"
              >
                FAQ
              </button>
              <Button
                onClick={() => window.location.href = '/auth'}
                className="bg-gradient-to-r from-primary to-secondary hover:scale-105 transition-transform"
              >
                Sign In
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-foreground hover:text-primary transition-colors"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-lg md:hidden pt-16">
          <div className="flex flex-col items-center justify-center h-full gap-8 px-4">
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-2xl font-semibold text-foreground hover:text-primary transition-colors"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('examples')}
              className="text-2xl font-semibold text-foreground hover:text-primary transition-colors"
            >
              Examples
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="text-2xl font-semibold text-foreground hover:text-primary transition-colors"
            >
              FAQ
            </button>
            <Button
              onClick={() => window.location.href = '/auth'}
              size="lg"
              className="bg-gradient-to-r from-primary to-secondary hover:scale-105 transition-transform"
            >
              Sign In
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
