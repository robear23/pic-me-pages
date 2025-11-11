import { Heart } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="border-t border-border/50 py-8 px-4 mt-16">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="text-muted-foreground flex items-center gap-2 justify-center md:justify-start">
              Made with <Heart className="w-4 h-4 text-red-500 fill-current" /> for parents and kids
            </p>
          </div>
          
          <div className="flex items-center gap-6">
            <a
              href="mailto:support@picturemebooks.com"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact
            </a>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </a>
          </div>
        </div>
        
        <div className="text-center mt-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Picture Me Books. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
