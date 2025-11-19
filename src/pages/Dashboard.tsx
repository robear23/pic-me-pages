import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';
import { useBookStore } from '@/store/bookStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, LogOut, BookOpen, Download, Package, Truck, Shield, Eye, FileText, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { OrderPhysicalBookDialog } from '@/components/OrderPhysicalBookDialog';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { repairBookPdf, toDataUrl } from '@/lib/repairPdf';
import { jsPDF } from 'jspdf';

interface Book {
  id: string;
  character_name: string;
  interests: string[];
  pages?: any;
  pdf_url: string | null;
  cover_url: string | null;
  cover_image_url?: string | null;
  status: string;
  created_at: string;
  user_id: string;
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
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadingBookId, setDownloadingBookId] = useState<string | null>(null);

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
        .select('id, character_name, interests, pdf_url, cover_url, cover_image_url, status, created_at, user_id, pages')
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

  const findDuplicateBooks = () => {
    const groups: Record<string, Book[]> = {};
    
    books.forEach(book => {
      const key = `${book.character_name}-${book.interests.join(',')}-${book.status}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(book);
    });

    return Object.values(groups).filter(group => group.length > 1);
  };

  const getIncompleteBooks = () => {
    return books.filter(book => 
      book.status === 'processing' || 
      book.status === 'failed' || 
      !book.pdf_url || 
      !book.cover_image_url
    );
  };

  const handleCleanupIncomplete = async () => {
    const incompleteBooks = getIncompleteBooks();
    if (incompleteBooks.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${incompleteBooks.length} incomplete book(s)? These books are missing PDFs or cover images and cannot be used.`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('books')
        .delete()
        .in('id', incompleteBooks.map(b => b.id));

      if (error) throw error;

      toast.success(`Deleted ${incompleteBooks.length} incomplete book(s)`);
      loadBooks();
    } catch (error) {
      console.error('Error deleting incomplete books:', error);
      toast.error('Failed to delete incomplete books');
    }
  };

  const loadBookPages = async (bookId: string) => {
    setLoadingPages(true);
    try {
      // Set a timeout to prevent hanging on large pages data
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Loading pages timed out after 10 seconds')), 10000)
      );
      
      const fetchPromise = supabase
        .from('books')
        .select('pages')
        .eq('id', bookId)
        .single();
      
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
      
      if (error) throw error;
      
      const pages = data?.pages;
      
      // Validate that pages contain URLs, not base64 data
      if (Array.isArray(pages) && pages.length > 0) {
        const firstPage = pages[0];
        if (firstPage?.imageUrl?.startsWith('data:image')) {
          toast.error('This book has corrupted data. Please delete and regenerate it.');
          setSelectedBookPages([]);
          setSelectedBook(null);
          return;
        }
      }
      
      setSelectedBookPages(Array.isArray(pages) ? pages : []);
    } catch (error: any) {
      console.error('[Dashboard] Failed to load book pages:', error);
      
      if (error.message?.includes('timed out')) {
        toast.error('Book pages are too large to load. Please delete and regenerate this book.');
      } else {
        toast.error('Failed to load book pages');
      }
      
      setSelectedBookPages([]);
      setSelectedBook(null);
    } finally {
      setLoadingPages(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleDownloadPDF = async (pdfUrl: string, bookName: string) => {
    try {
      toast.info('Preparing download...');
      
      // Fetch the PDF from Supabase Storage
      const response = await fetch(pdfUrl);
      
      if (!response.ok) {
        throw new Error('Failed to fetch PDF');
      }
      
      // Get the PDF as a blob
      const blob = await response.blob();
      
      // Create a local blob URL
      const blobUrl = URL.createObjectURL(blob);
      
      // Create link and trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${bookName}-coloring-book.pdf`;
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      
      // Revoke the blob URL after a short delay to ensure download started
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 100);
      
      toast.success('Download started!');
    } catch (error: any) {
      console.error('Download error:', error);
      toast.error('Failed to download PDF. Please try again.');
    }
  };

  const handleGeneratePdf = async (book: Book, quickPreview = false) => {
    if (!book.pages || book.pages.length === 0) {
      toast.error('No pages available to generate PDF');
      return null;
    }

    setIsGeneratingPdf(book.id);
    setPdfProgress({ current: 0, total: book.pages.length });
    
    try {
      toast.info(quickPreview ? 'Generating quick preview PDF...' : 'Generating PDF with padding...');
      
      const pdfUrl = await repairBookPdf(book.id, book.pages, {
        minPages: quickPreview ? 0 : 24,
        pageCount: quickPreview ? book.pages.length : undefined,
        onProgress: (current, total) => {
          setPdfProgress({ current, total });
        }
      });
      
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
      setPdfProgress(null);
    }
  };

  const handleQuickPreview = async (book: Book) => {
    if (!book.pages || book.pages.length === 0) {
      toast.error('No pages available');
      return;
    }
    
    setIsGeneratingPdf(book.id);
    setPdfProgress({ current: 0, total: book.pages.length });
    
    try {
      toast.info('Generating preview...');
      
      // Generate PDF directly in browser without uploading to Supabase
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter',
      });
      
      for (let i = 0; i < book.pages.length; i++) {
        if (i > 0) pdf.addPage();
        
        setPdfProgress({ current: i + 1, total: book.pages.length });
        
        const page = book.pages[i];
        const dataUrl = page.imageUrl.startsWith('data:') 
          ? page.imageUrl 
          : await toDataUrl(page.imageUrl);
        
        pdf.addImage(dataUrl, 'PNG', 0, 0, 8.5, 11);
      }
      
      // Download directly without uploading to Supabase
      pdf.save(`${book.character_name}-preview.pdf`);
      
      toast.success('Preview downloaded!');
    } catch (error: any) {
      console.error('Error generating preview:', error);
      toast.error('Failed to generate preview');
    } finally {
      setIsGeneratingPdf(null);
      setPdfProgress(null);
    }
  };

  const handleDownloadOrGenerate = async (book: Book) => {
    setDownloadingBookId(book.id);
    try {
      if (book.pdf_url) {
        await handleDownloadPDF(book.pdf_url, book.character_name);
      } else {
        const pdfUrl = await handleGeneratePdf(book, false);
        if (pdfUrl) {
          await handleDownloadPDF(pdfUrl, book.character_name);
        }
      }
    } finally {
      setDownloadingBookId(null);
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

    const book = books.find(b => b.id === bookId);
    const pageCount = book?.pages?.length || 0;
    const isIncomplete = pageCount > 0 && pageCount < 12;
    
    const message = isIncomplete 
      ? `This book is incomplete (${pageCount}/12 pages). Are you sure you want to delete it?`
      : 'Are you sure you want to delete this book? This action cannot be undone.';

    if (!confirm(message)) {
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
    return book.cover_image_url || '/placeholder.svg';
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
        <div className="mb-8 flex items-center gap-4">
          <Button 
            size="lg" 
            onClick={() => {
              useBookStore.getState().reset();
              navigate('/app');
            }} 
            className="gap-2"
          >
            <Plus className="w-5 h-5" />
            Create New Book
          </Button>
          
          {!loading && getIncompleteBooks().length > 0 && (
            <Button
              variant="outline"
              onClick={handleCleanupIncomplete}
              className="gap-2 border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50"
            >
              <Trash2 className="w-4 h-4" />
              Clean Up {getIncompleteBooks().length} Incomplete
            </Button>
          )}
        </div>

        {!loading && books.length > 0 && (() => {
          const incompleteBooks = getIncompleteBooks();
          const duplicateGroups = findDuplicateBooks();
          
          return (
            <>
              {incompleteBooks.length > 0 && (
                <Alert className="mb-6 bg-amber-50 dark:bg-amber-950/50 border-amber-500/50">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="text-amber-900 dark:text-amber-200">Incomplete Books Found</AlertTitle>
                  <AlertDescription className="text-amber-800 dark:text-amber-300">
                    You have {incompleteBooks.length} incomplete book(s) that failed during generation or are missing required files. 
                    These cannot be downloaded or ordered. Use "Clean Up" to remove them.
                  </AlertDescription>
                </Alert>
              )}
              
              {duplicateGroups.length > 0 && (
                <Alert className="mb-6 bg-amber-50 dark:bg-amber-950/50 border-amber-500/50">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="text-amber-900 dark:text-amber-200">Duplicate Books Detected</AlertTitle>
                  <AlertDescription className="text-amber-800 dark:text-amber-300">
                    You have {duplicateGroups.length} set(s) of books with identical settings. 
                    Consider keeping only the complete versions.
                  </AlertDescription>
                </Alert>
              )}
            </>
          );
        })()}

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
            <Button 
              onClick={() => {
                useBookStore.getState().reset();
                navigate('/app');
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Book
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {books.map((book, index) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card 
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer bg-card/80 backdrop-blur-sm border-border/50"
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
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {book.character_name}'s Coloring Book
                        </h3>
                        <div className="flex gap-2">
                          {book.pages && (
                            <Badge variant={book.pages.length === 12 ? "default" : "destructive"}>
                              {book.pages.length}/12
                            </Badge>
                          )}
                          <Badge 
                            variant={
                              book.status === 'completed' ? 'default' : 
                              book.status === 'processing' ? 'secondary' : 
                              'destructive'
                            } 
                            className="text-xs"
                          >
                            {book.status}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {new Date(book.created_at).toLocaleDateString()}
                      </p>
                      {book.pages && book.pages.length < 12 && (
                        <div className="mb-2 p-2 bg-amber-100 dark:bg-amber-950/50 border border-amber-500/50 rounded text-xs text-amber-700 dark:text-amber-300">
                          ⚠️ This book has missing pages
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mb-4">
                        {book.interests.slice(0, 3).map((interest, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full"
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                      <div className="space-y-2">
                        {isGeneratingPdf === book.id && pdfProgress && (
                          <div className="space-y-1 mb-2 p-3 bg-secondary/50 rounded-lg border border-border/50">
                            <div className="flex justify-between text-xs text-foreground font-medium">
                              <span>Generating PDF...</span>
                              <span>{pdfProgress.current} / {pdfProgress.total} pages</span>
                            </div>
                            <Progress value={(pdfProgress.current / pdfProgress.total) * 100} />
                          </div>
                        )}
                        <div className="flex gap-2">
                          {book.status === 'completed' ? (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                className="flex-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadOrGenerate(book);
                                }}
                                disabled={isGeneratingPdf === book.id || downloadingBookId === book.id}
                              >
                                <Download className="w-4 h-4 mr-1" />
                                {downloadingBookId === book.id ? 'Downloading...' : isGeneratingPdf === book.id ? 'Generating...' : 'Download PDF'}
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
                        {book.status === 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickPreview(book);
                            }}
                            disabled={isGeneratingPdf === book.id}
                          >
                            <Zap className="w-4 h-4 mr-1" />
                            Quick Preview (No Padding)
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/50"
                          onClick={(e) => handleDeleteBook(book.id, e)}
                          disabled={deletingBookId === book.id}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          {deletingBookId === book.id ? 'Deleting...' : 'Delete Book'}
                        </Button>
                      </div>

                      {/* Show orders for this book */}
                      {orders[book.id] && orders[book.id].length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border/50">
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-foreground">
                            <Package className="w-4 h-4" />
                            Physical Orders
                          </h4>
                          <div className="space-y-2 p-3 bg-secondary/30 rounded-lg">
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
                disabled={isGeneratingPdf === selectedBook.id || downloadingBookId === selectedBook.id}
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloadingBookId === selectedBook.id ? 'Downloading...' : isGeneratingPdf === selectedBook.id ? 'Generating...' : 'Download PDF'}
              </Button>
              <Button
                variant="default"
                onClick={() => handleOrderFromModal(selectedBook)}
                disabled={isGeneratingPdf === selectedBook.id}
                className="flex-1"
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
