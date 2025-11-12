import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, LogOut, BookOpen, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

interface Book {
  id: string;
  character_name: string;
  interests: string[];
  pages: any;
  pdf_url: string | null;
  status: string;
  created_at: string;
}

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBooks();
  }, [user]);

  const loadBooks = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBooks(data || []);
    } catch (error: any) {
      toast.error('Failed to load books');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleDownloadPDF = (pdfUrl: string, bookName: string) => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `${bookName}-coloring-book.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Gradient */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: 'linear-gradient(to bottom right, hsl(222 47% 11%), hsl(280 80% 20% / 0.2), hsl(222 47% 11%))',
        }}
      />

      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-foreground">My Books</h1>
          <Button variant="ghost" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <Button size="lg" onClick={() => navigate('/app')} className="gap-2">
            <Plus className="w-5 h-5" />
            Create New Book
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading your books...</p>
          </div>
        ) : books.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              No books yet
            </h2>
            <p className="text-muted-foreground mb-6">
              Create your first personalized coloring book
            </p>
            <Button onClick={() => navigate('/app')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Book
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {books.map((book, index) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardContent className="p-0">
                    {book.pages?.[0] && (
                      <img
                        src={book.pages[0]}
                        alt={`${book.character_name}'s book`}
                        className="w-full h-48 object-cover"
                      />
                    )}
                    <div className="p-4">
                      <h3 className="text-lg font-semibold text-foreground mb-1">
                        {book.character_name}'s Coloring Book
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {new Date(book.created_at).toLocaleDateString()}
                      </p>
                      <div className="flex flex-wrap gap-1 mb-4">
                        {book.interests.slice(0, 3).map((interest, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full"
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        {book.status === 'completed' && book.pdf_url ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => handleDownloadPDF(book.pdf_url!, book.character_name)}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => toast.info('Print ordering coming soon!')}
                            >
                              <Printer className="w-4 h-4 mr-1" />
                              Order Print
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full" disabled>
                            Processing...
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
