import { Heart, Mail } from 'lucide-react';
import logoNarrow from '@/assets/logo_narrow.png';

export const Footer = () => {
  return (
    <footer className="relative bg-gray-900 border-t border-border/20 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand Column */}
          <div className="col-span-1 md:col-span-1">
            <img src={logoNarrow} alt="Color Me In Books" className="h-10 mb-4" />
            <p className="text-sm text-gray-400 mb-4">
              Personalized coloring books powered by AI
            </p>
            <p className="text-sm text-gray-400 flex items-center gap-2">
              Made with <Heart className="w-4 h-4 text-red-500 fill-current" /> for parents and kids
            </p>
          </div>

          {/* Product Column */}
          <div>
            <h4 className="text-white font-semibold mb-4">Product</h4>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-sm text-gray-400 hover:text-white transition-colors text-left"
              >
                How It Works
              </button>
              <button
                onClick={() => document.getElementById('examples')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-sm text-gray-400 hover:text-white transition-colors text-left"
              >
                Examples
              </button>
              <button
                onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-sm text-gray-400 hover:text-white transition-colors text-left"
              >
                FAQ
              </button>
              <a
                href="/auth"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Sign In / Sign Up
              </a>
            </div>
          </div>

          {/* Support Column */}
          <div>
            <h4 className="text-white font-semibold mb-4">Support</h4>
            <div className="flex flex-col gap-3">
              <a
                href="mailto:support@colormeinbooks.com"
                className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Contact Us
              </a>
              <a
                href="#"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Shipping Info
              </a>
              <a
                href="#"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Refund Policy
              </a>
              <a
                href="#"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Help Center
              </a>
            </div>
          </div>

          {/* Legal Column */}
          <div>
            <h4 className="text-white font-semibold mb-4">Legal</h4>
            <div className="flex flex-col gap-3">
              <a
                href="#"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Terms of Service
              </a>
              <a
                href="#"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="#"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cookie Policy
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} Color Me In Books. All rights reserved.
            </p>
            <p className="text-sm text-gray-400">
              Secure checkout powered by Stripe
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
