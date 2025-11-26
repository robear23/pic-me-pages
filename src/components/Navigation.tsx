import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BookOpen, Plus, Shield, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useBookStore } from '@/store/bookStore';

export const Navigation = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/10 backdrop-blur-lg border-b border-white/20 shadow-lg">
      <div className="container mx-auto py-4 px-6">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <Link 
            to="/dashboard" 
            className="flex items-center space-x-2 text-xl font-bold text-white hover:text-white/90 transition-colors"
          >
            <BookOpen className="w-6 h-6" />
            <span className="hidden sm:inline">ColorBook AI</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            <Button
              variant={isActive('/dashboard') ? 'secondary' : 'ghost'}
              onClick={() => navigate('/dashboard')}
              className={cn(
                "gap-2 text-white/90 hover:text-white hover:bg-white/10",
                isActive('/dashboard') && "bg-white/20 text-white"
              )}
            >
              <BookOpen className="w-4 h-4" />
              My Books
            </Button>
            
            <Button
              onClick={() => {
                useBookStore.getState().reset();
                useBookStore.getState().setStep('upload');
                navigate('/app');
              }}
              className="gap-2 bg-emerald-500/90 hover:bg-emerald-500 text-white border-0"
            >
              <Plus className="w-4 h-4" />
              Create New
            </Button>

            {isAdmin && (
              <Button
                variant={isActive('/admin') ? 'secondary' : 'ghost'}
                onClick={() => navigate('/admin')}
                className={cn(
                  "gap-2 text-white/90 hover:text-white hover:bg-white/10",
                  isActive('/admin') && "bg-white/20 text-white"
                )}
              >
                <Shield className="w-4 h-4" />
                Admin
              </Button>
            )}
          </div>

          {/* User Menu - Desktop */}
          <div className="hidden md:flex items-center gap-3">
            <div className="text-sm text-white/70">
              {user?.email}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="gap-2 border-white/30 text-white hover:bg-white/10 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-white/20">
            <div className="flex flex-col space-y-2">
              <Button
                variant={isActive('/dashboard') ? 'secondary' : 'ghost'}
                onClick={() => {
                  navigate('/dashboard');
                  setMobileMenuOpen(false);
                }}
                className={cn(
                  "justify-start gap-2 text-white/90 hover:text-white hover:bg-white/10",
                  isActive('/dashboard') && "bg-white/20 text-white"
                )}
              >
                <BookOpen className="w-4 h-4" />
                My Books
              </Button>
              
              <Button
                onClick={() => {
                  useBookStore.getState().reset();
                  useBookStore.getState().setStep('upload');
                  navigate('/app');
                  setMobileMenuOpen(false);
                }}
                className="justify-start gap-2 bg-emerald-500/90 hover:bg-emerald-500 text-white border-0"
              >
                <Plus className="w-4 h-4" />
                Create New Book
              </Button>

              {isAdmin && (
                <Button
                  variant={isActive('/admin') ? 'secondary' : 'ghost'}
                  onClick={() => {
                    navigate('/admin');
                    setMobileMenuOpen(false);
                  }}
                  className={cn(
                    "justify-start gap-2 text-white/90 hover:text-white hover:bg-white/10",
                    isActive('/admin') && "bg-white/20 text-white"
                  )}
                >
                  <Shield className="w-4 h-4" />
                  Admin Panel
                </Button>
              )}

              <div className="pt-4 border-t border-white/20">
                <div className="text-sm text-white/70 mb-2 px-3">
                  {user?.email}
                </div>
                <Button
                  variant="outline"
                  onClick={handleSignOut}
                  className="w-full justify-start gap-2 border-white/30 text-white hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
