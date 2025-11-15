import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, LogOut, BookOpen, Download, Package, Truck, Shield, Eye, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { OrderPhysicalBookDialog } from '@/components/OrderPhysicalBookDialog';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { repairBookPdf } from '@/lib/repairPdf';

interface Book {
  id: string;
  character_name: string;
  interests: string[];
  pages?: any;
  pdf_url: string | null;
  cover_url: string | null;
  status: string;
  created_at: string;
}

interface Order {
  id: string;
  book_id: string;
  status: string;
  lulu_order_id: string | null;
  created_at: string;
  price_paid: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [orders, setOrders] = useState<Record<string, Order[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);
  const [orderingBook, setOrderingBook] = useState<Book | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [selectedBookPages, setSelectedBookPages] = useState<any[] | null>(null);
  const [loadingPages, setLoadingPages] = useState(false);

  useEffect(() => {
    if (user) {
      console.log('[Dashboard] User authenticated, loading books...', user.id);
      loadBooks();
      fetchOrders();
    } else {
      console.log('[Dashboard] No user found');
    }
  }, [user, retryCount]);

  const loadBooks = async () => {
    if (!user) {
      console.log('[Dashboard] Cannot load books - no user');
      return;
    }

    console.log('[Dashboard] Starting books fetch for user:', user.id);
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('books')
        .select('id, character_name, interests, pdf_url, cover_url, status, created_at, user_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Dashboard] Supabase error loading books:', error);
        throw error;
      }
      
      console.log('[Dashboard] Books loaded successfully:', data?.length || 0);
      setBooks(data || []);
    } catch (error: any) {
      console.error('[Dashboard] Failed to load books:', error);
      const errorMessage = error.message || 'Failed to load books';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    console.log('[Dashboard] Manual retry triggered');
    setRetryCount(prev => prev + 1);
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user?.id)
        .eq('order_type', 'physical')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group orders by book_id
      const ordersByBook: Record<string, Order[]> = {};
      data?.forEach((order) => {
        if (order.book_id) {
          if (!ordersByBook[order.book_id]) {
            ordersByBook[order.book_id] = [];
          }
          ordersByBook[order.book_id].push(order as Order);
        }
      });

      setOrders(ordersByBook);
    } catch (error: any) {
      console.error('Error fetching orders:', error);
    }
  };

  const loadBookPages = async (bookId: string) => {
    setLoadingPages(true);
    try {
      const { data, error } = await supabase
        .from('books')
        .select('pages')
        .eq('id', bookId)
        .single();
      
      if (error) throw error;
      
      const pages = data?.pages;
      setSelectedBookPages(Array.isArray(pages) ? pages : []);
    } catch (error: any) {
      console.error('[Dashboard] Failed to load book pages:', error);
      toast.error('Failed to load book pages');
      setSelectedBookPages([]);
    } finally {
      setLoadingPages(false);
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

  const handleGeneratePdf = async (book: Book) => {
    if (!book.pages || book.pages.length === 0) {
      toast.error('No pages available to generate PDF');
      return null;
    }

    setIsGeneratingPdf(book.id);
    try {
      toast.info('Generating PDF... This may take a moment');
      const pdfUrl = await repairBookPdf(book.id, book.pages);
      
      // Update local state
      setBooks(prevBooks => 
        prevBooks.map(b => b.id === book.id ? { ...b, pdf_url: pdfUrl } : b)
      );
      
      toast.success('PDF generated successfully!');
      return pdfUrl;
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast.error(error.message || 'Failed to generate PDF');
      return null;
    } finally {
      setIsGeneratingPdf(null);
    }
  };

  const handleDownloadOrGenerate = async (book: Book) => {
    if (book.pdf_url) {
      handleDownloadPDF(book.pdf_url, book.character_name);
    } else {
      const pdfUrl = await handleGeneratePdf(book);
      if (pdfUrl) {
        handleDownloadPDF(pdfUrl, book.character_name);
      }
    }
  };

  const handleOrderFromModal = async (book: Book) => {
    if (!book.pdf_url) {
      toast.info("Preparing book for printing...");
      const pdfUrl = await handleGeneratePdf(book);
      if (!pdfUrl) {
        toast.error("Failed to generate PDF for ordering.");
        return;
      }
    }
    setSelectedBook(null);
    setOrderingBook(book);
  };

  const handleDeleteBook = async (bookId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    if (!confirm('Are you sure you want to delete this book? This action cannot be undone.')) {
      return;
    }

    setDeletingBookId(bookId);
    
    try {
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', bookId);

      if (error) throw error;

      // Update local state
      setBooks(books.filter(book => book.id !== bookId));
      toast.success('Book deleted successfully');
    } catch (error: any) {
      console.error('Error deleting book:', error);
      toast.error('Failed to delete book');
    } finally {
      setDeletingBookId(null);
    }
  };

  const getBookCoverImage = (book: Book) => {
    return book.cover_url || book.pages?.[0]?.imageUrl || '/placeholder.svg';
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
        <div className="container mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-foreground">My Books</h1>
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading your books...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="text-red-500 mb-4">⚠️ Error Loading Books</div>
              <p className="text-muted-foreground mb-6">{error}</p>
              <Button onClick={handleRetry} variant="outline">
                Try Again
              </Button>
            </div>
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
                <Card 
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={async () => {
                    if (book.status === 'completed') {
                      setSelectedBook(book);
                      await loadBookPages(book.id);
                    }
                  }}
                >
                  <CardContent className="p-0">
                    <div className="aspect-[3/4] relative overflow-hidden bg-muted">
                      <img
                        src={getBookCoverImage(book)}
                        alt={book.character_name}
                        className="w-full h-full object-cover"
                      />
                    </div>
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
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          {book.status === 'completed' ? (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                className="flex-1 bg-black text-white hover:bg-black/90"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadOrGenerate(book);
                                }}
                                disabled={isGeneratingPdf === book.id}
                              >
                                <Download className="w-4 h-4 mr-1" />
                                {isGeneratingPdf === book.id ? 'Generating...' : 'Download PDF'}
                              </Button>
                              <OrderPhysicalBookDialog 
                                bookId={book.id}
                                bookTitle={`${book.character_name}'s Coloring Book`}
                              />
                            </>
                          ) : (
                            <Button size="sm" variant="outline" className="w-full" disabled>
                              Processing...
                            </Button>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => handleDeleteBook(book.id, e)}
                          disabled={deletingBookId === book.id}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          {deletingBookId === book.id ? 'Deleting...' : 'Delete Book'}
                        </Button>
                      </div>

                      {/* Show orders for this book */}
                      {orders[book.id] && orders[book.id].length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Physical Orders
                          </h4>
                          <div className="space-y-2">
                            {orders[book.id].map((order) => (
                              <div key={order.id} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <Truck className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    {new Date(order.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <Badge variant={
                                  order.status === 'completed' ? 'default' :
                                  order.status === 'processing' ? 'secondary' :
                                  'outline'
                                }>
                                  {order.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Book Pages Modal */}
      <Dialog open={!!selectedBook} onOpenChange={(open) => {
        if (!open) {
          setSelectedBook(null);
          setSelectedBookPages(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {selectedBook?.character_name} - Coloring Book Pages
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {loadingPages ? (
              <div className="col-span-full text-center py-8">
                <p className="text-muted-foreground">Loading pages...</p>
              </div>
            ) : selectedBookPages?.map((page: any, index: number) => (
              <div key={index} className="relative aspect-[3/4] rounded-lg overflow-hidden border border-border">
                <img
                  src={page.imageUrl || page}
                  alt={`Page ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                  Page {index + 1}
                </div>
              </div>
            ))}
          </div>
          {selectedBook && (
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleDownloadOrGenerate(selectedBook)}
                disabled={isGeneratingPdf === selectedBook.id}
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-2" />
                {isGeneratingPdf === selectedBook.id ? 'Generating...' : 'Download PDF'}
              </Button>
              <Button
                variant="default"
                onClick={() => handleOrderFromModal(selectedBook)}
                disabled={isGeneratingPdf === selectedBook.id}
                className="flex-1 bg-black text-white hover:bg-black/90"
              >
                <Package className="w-4 h-4 mr-2" />
                Order Physical Book
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {orderingBook && (
        <OrderPhysicalBookDialog
          bookId={orderingBook.id}
          bookTitle={`${orderingBook.character_name}'s Coloring Book`}
          open={!!orderingBook}
          onOpenChange={(open) => !open && setOrderingBook(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
