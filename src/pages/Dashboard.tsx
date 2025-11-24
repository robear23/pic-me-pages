import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin } from '@/hooks/useAdmin';
import { useBookStore, type ComplexityLevel } from '@/store/bookStore';
import type { PageCount, BindingType } from '@/types/bookOptions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, LogOut, BookOpen, Download, Package, Truck, Shield, Eye, FileText, Trash2, Zap, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { OrderPhysicalBookDialog } from '@/components/OrderPhysicalBookDialog';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { repairBookPdf, toDataUrl } from '@/lib/repairPdf';
import { jsPDF } from 'jspdf';
import { validateBookCompleteness, getMissingComponents, getBookStatusLabel, findIncompleteBooks as getIncompleteBooksList } from '@/lib/bookValidation';

interface Book {
  id: string;
  character_name: string;
  interests: string[];
  pages?: any;
  pdf_url: string | null;
  cover_url: string | null;
  cover_image_url?: string | null;
  back_cover_image_url?: string | null;
  status: string;
  created_at: string;
  user_id: string;
  missing_covers?: boolean;
  missing_components?: string[];
  reworked_page_numbers?: number[];
  selected_page_count?: number;
  complexity?: string;
  consistent_characters?: boolean;
  photo_urls?: string[];
  selected_binding_type?: string;
  selected_pod_package_id?: string;
}

interface Order {
  id: string;
  book_id: string;
  status: string;
  lulu_order_id: string | null;
  created_at: string;
  price_paid: number;
}

interface RetryCredit {
  id: string;
  book_id: string | null;
  reason: string;
  granted_at: string;
  used_at: string | null;
}

const Dashboard = () => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [orders, setOrders] = useState<Record<string, Order[]>>({});
  const [retryCredits, setRetryCredits] = useState<RetryCredit[]>([]);
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
  const [downloadingCoverId, setDownloadingCoverId] = useState<string | null>(null);
  const [autoFixAttempted, setAutoFixAttempted] = useState<Set<string>>(new Set());
  const [retryingCoverId, setRetryingCoverId] = useState<string | null>(null);
  const [selectedPageImage, setSelectedPageImage] = useState<string | null>(null);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      console.log('[Dashboard] User authenticated, loading books...', user.id);
      loadBooks();
      fetchOrders();
      loadRetryCredits();
    } else {
      console.log('[Dashboard] No user found');
    }
  }, [user, retryCount]);

  // Auto-generate PDFs for completed books missing them (ONCE per book)
  useEffect(() => {
    const fixIncompleteBooks = async () => {
      // Only process books that haven't been attempted yet
      const booksNeedingPdfs = books.filter(book => 
        book.status === 'completed' && 
        (!book.pdf_url || !book.cover_url) &&
        book.pages &&
        Array.isArray(book.pages) &&
        book.pages.length > 0 &&
        !isGeneratingPdf && // Don't trigger if already generating
        !autoFixAttempted.has(book.id) // Don't retry if already attempted
      );

      if (booksNeedingPdfs.length > 0) {
        console.log(`🔧 Found ${booksNeedingPdfs.length} completed books missing PDFs`);
        
        // Mark all these books as attempted immediately to prevent retries
        const newAttempted = new Set(autoFixAttempted);
        booksNeedingPdfs.forEach(book => newAttempted.add(book.id));
        setAutoFixAttempted(newAttempted);
        
        // Fix them one at a time to avoid overwhelming the system
        for (const book of booksNeedingPdfs) {
          try {
            console.log(`🔧 Auto-fixing PDFs for book ${book.id}...`);
            await handleGeneratePdf(book, false);
          } catch (error) {
            console.error(`Failed to generate PDFs for book ${book.id}:`, error);
            toast.error(`Failed to auto-generate PDFs for ${book.character_name}'s book`);
          }
        }
      }
    };

    // Only run if we have books and aren't currently generating
    if (books.length > 0 && !isGeneratingPdf) {
      fixIncompleteBooks();
    }
  }, [books]); // Only depend on books array, not isGeneratingPdf

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
        .select('id, character_name, interests, pdf_url, cover_url, cover_image_url, back_cover_image_url, status, created_at, user_id, pages, missing_covers, missing_components, selected_page_count, reworked_page_numbers, complexity, selected_binding_type, selected_pod_package_id, consistent_characters, photo_urls')
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

  const loadRetryCredits = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('retry_credits')
        .select('*')
        .eq('user_id', user.id)
        .is('used_at', null)
        .order('granted_at', { ascending: false });
      
      if (error) throw error;
      setRetryCredits(data || []);
    } catch (error) {
      console.error('Failed to load retry credits:', error);
    }
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
    return getIncompleteBooksList(books);
  };
  
  const getPartialBooks = () => {
    // Books with status 'partial' or explicitly marked as missing covers
    return books.filter(book => 
      book.status === 'partial' || book.missing_covers
    );
  };

  const handleCleanupIncomplete = async () => {
    const incompleteBooks = getIncompleteBooks();
    if (incompleteBooks.length === 0) return;

    const systemFailures = incompleteBooks.filter(book => 
      book.status === 'partial' || (book.status === 'failed' && !book.pdf_url)
    );

    const message = systemFailures.length > 0
      ? `Delete ${incompleteBooks.length} incomplete book(s)? ${systemFailures.length} appear to be system failures and will grant you retry credits.`
      : `Delete ${incompleteBooks.length} incomplete book(s)? These books are missing PDFs or cover images and cannot be used.`;

    const confirmed = window.confirm(message);
    if (!confirmed) return;

    try {
      // Grant retry credits for system failures
      if (systemFailures.length > 0 && user) {
        const creditInserts = systemFailures.map(book => ({
          user_id: user.id,
          book_id: book.id,
          reason: `System failure during generation - ${book.status} status`,
        }));

        await supabase.from('retry_credits').insert(creditInserts);
      }

      // Delete the incomplete books
      const { error } = await supabase
        .from('books')
        .delete()
        .in('id', incompleteBooks.map(b => b.id));

      if (error) throw error;

      const creditsMessage = systemFailures.length > 0 
        ? ` Granted ${systemFailures.length} retry credit(s).`
        : '';
      
      toast.success(`Deleted ${incompleteBooks.length} incomplete book(s).${creditsMessage}`);
      loadBooks();
      loadRetryCredits();
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
      toast.info('Starting download...');
      
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
      
      toast.success('Download complete!');
    } catch (error: any) {
      console.error('Download error:', error);
      
      // Better error messages
      if (error.message?.includes('Failed to fetch')) {
        toast.error('Unable to download. Please check your internet connection and try again.');
      } else if (error.message?.includes('network')) {
        toast.error('Network error. Please try again.');
      } else {
        toast.error('Failed to download PDF. Please try again or contact support.');
      }
      
      // Offer retry option
      setTimeout(() => {
        if (window.confirm('Download failed. Would you like to retry?')) {
          handleDownloadPDF(pdfUrl, bookName);
        }
      }, 1000);
    }
  };

  const handleGeneratePdf = async (book: Book, quickPreview = false) => {
    if (!book.pages || book.pages.length === 0) {
      toast.error('No pages available to generate PDF');
      return null;
    }

    // Prevent duplicate generation attempts
    if (isGeneratingPdf === book.id) {
      console.log('⚠️ PDF generation already in progress for this book');
      return null;
    }

    setIsGeneratingPdf(book.id);
    setPdfProgress({ current: 0, total: book.pages.length });
    
    // Create a timeout promise (2 minutes)
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('PDF generation timed out after 2 minutes')), 120000);
    });

    try {
      toast.info(quickPreview ? 'Generating quick preview PDF...' : 'Generating PDF with padding...');
      
      const pdfPromise = repairBookPdf(book.id, book.pages, {
        minPages: quickPreview ? 0 : 24,
        pageCount: quickPreview ? book.pages.length : undefined,
        onProgress: (current, total) => {
          setPdfProgress({ current, total });
        }
      });

      const pdfUrl = await Promise.race([pdfPromise, timeoutPromise]);
      
      if (!pdfUrl) {
        throw new Error('PDF generation failed');
      }
      
      // Update local state
      setBooks(prevBooks => 
        prevBooks.map(b => b.id === book.id ? { ...b, pdf_url: pdfUrl } : b)
      );
      
      toast.success('PDF generated successfully!');
      return pdfUrl;
    } catch (error: any) {
      console.error('❌ Error generating PDF:', error);
      
      const errorMessage = error.message?.includes('timed out') 
        ? 'PDF generation took too long. Please try again or contact support.'
        : error.message || 'Failed to generate PDF';
      
      toast.error(errorMessage);
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

  const handleRetryCoverGeneration = async (book: Book, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // DEBUG: Log which book we're regenerating
    console.log('🎨 Regenerating cover for:', {
      bookId: book.id,
      characterName: book.character_name,
      createdAt: book.created_at
    });
    
    // Confirm with user which book they're regenerating
    const confirmMsg = `Regenerate cover for "${book.character_name}'s Coloring Book"?\n\nThis will create a new cover with the character name prominently displayed.`;
    if (!confirm(confirmMsg)) {
      return;
    }
    
    if (!book.pages || book.pages.length === 0) {
      toast.error('Cannot generate covers without pages');
      return;
    }
    
    setRetryingCoverId(book.id);
    
    try {
      toast.info('Retrying cover generation...');
      
      const firstPageImageUrl = book.pages[0]?.imageUrl;
      if (!firstPageImageUrl) {
        throw new Error('First page image not found');
      }
      
      // Call generate-cover edge function
      const { data, error } = await supabase.functions.invoke('generate-cover', {
        body: {
          characterName: book.character_name,
          interests: book.interests,
          photoUrl: null,
          pageCount: book.pages.length,
          firstPageImageUrl,
        }
      });
      
      if (error) {
        throw new Error(error.message || 'Cover generation failed');
      }
      
      if (!data?.frontCover || !data?.backCover) {
        throw new Error('Cover generation did not return images');
      }
      
      // Convert base64 to blobs and upload to storage
      const frontCoverBlob = await fetch(data.frontCover).then(r => r.blob());
      const backCoverBlob = await fetch(data.backCover).then(r => r.blob());
      
      const timestamp = Date.now();
      const frontCoverPath = `${user!.id}/${timestamp}-cover.png`;
      const backCoverPath = `${user!.id}/${timestamp}-back-cover.png`;
      
      // Upload front cover
      const { error: frontUploadError } = await supabase.storage
        .from('generated-pages')
        .upload(frontCoverPath, frontCoverBlob, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false
        });
      
      if (frontUploadError) {
        throw new Error('Front cover upload failed: ' + frontUploadError.message);
      }
      
      const { data: frontUrlData } = supabase.storage
        .from('generated-pages')
        .getPublicUrl(frontCoverPath);
      
      // Upload back cover
      const { error: backUploadError } = await supabase.storage
        .from('generated-pages')
        .upload(backCoverPath, backCoverBlob, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false
        });
      
      if (backUploadError) {
        throw new Error('Back cover upload failed: ' + backUploadError.message);
      }
      
      const { data: backUrlData } = supabase.storage
        .from('generated-pages')
        .getPublicUrl(backCoverPath);
      
      // Update book record with new covers
      const { error: updateError } = await supabase
        .from('books')
        .update({
          cover_image_url: frontUrlData.publicUrl,
          back_cover_image_url: backUrlData.publicUrl,
          missing_covers: false,
          missing_components: [],
          status: 'completed',
        })
        .eq('id', book.id);
      
      if (updateError) {
        throw new Error('Failed to update book: ' + updateError.message);
      }
      
      // Update local state
      setBooks(prevBooks => 
        prevBooks.map(b => 
          b.id === book.id 
            ? { 
                ...b, 
                cover_image_url: frontUrlData.publicUrl,
                back_cover_image_url: backUrlData.publicUrl,
                missing_covers: false,
                missing_components: [],
                status: 'completed'
              } 
            : b
        )
      );
      
      toast.success('Covers generated successfully! Generating cover PDF...');
      
      // Auto-generate cover PDF using the actual client-side function
      try {
        const { generateCoverWrapPdf } = await import('@/lib/repairPdf');
        
        const pdfUrl = await generateCoverWrapPdf(
          book.id,
          frontUrlData.publicUrl,
          backUrlData.publicUrl,
          book.selected_pod_package_id
        );
        
        // Update local state with new PDF URL
        setBooks(prevBooks => 
          prevBooks.map(b => 
            b.id === book.id 
              ? { ...b, cover_url: pdfUrl, missing_components: [] } 
              : b
          )
        );
        
        toast.success('Cover images and PDF generated successfully! Book is now complete.');
      } catch (pdfError) {
        console.error('Cover PDF generation error:', pdfError);
        toast.error('Cover images created, but PDF generation failed.');
      }
      
    } catch (error: any) {
      console.error('Error retrying cover generation:', error);
      toast.error(error.message || 'Failed to generate covers');
    } finally {
      setRetryingCoverId(null);
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

  const handleDownloadCoverPDF = async (book: Book) => {
    if (!book.cover_url) {
      toast.error('Cover PDF not available');
      return;
    }
    
    setDownloadingCoverId(book.id);
    try {
      toast.info('Preparing cover download...');
      
      const response = await fetch(book.cover_url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch cover PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${book.character_name}-cover.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Cover PDF downloaded successfully!');
    } catch (error: any) {
      console.error('Error downloading cover PDF:', error);
      toast.error('Failed to download cover PDF');
    } finally {
      setDownloadingCoverId(null);
    }
  };

  const handleRetryGeneration = async (book: Book) => {
    // Check if retry credit is available for this book
    const availableCredit = retryCredits.find(
      credit => credit.book_id === book.id && !credit.used_at
    );

    if (!availableCredit) {
      toast.error('No retry credit available for this book');
      return;
    }

    if (!confirm(`Retry generating PDFs for "${book.character_name}'s Coloring Book"? This will use your free retry credit.`)) {
      return;
    }
    
    setIsGeneratingPdf(book.id);
    try {
      toast.info('Using retry credit to regenerate book...');
      
      // Mark retry credit as used
      const { error: creditError } = await supabase
        .from('retry_credits')
        .update({ used_at: new Date().toISOString() })
        .eq('id', availableCredit.id);
      
      if (creditError) {
        console.error('Error marking credit as used:', creditError);
        throw new Error('Failed to use retry credit');
      }
      
      if (!book.pages || book.pages.length === 0) {
        throw new Error('Cannot retry: Book has no page data');
      }
      
      const pdfUrl = await handleGeneratePdf(book, false);
      
      if (pdfUrl) {
        const { error: updateError } = await supabase
          .from('books')
          .update({ status: 'completed' })
          .eq('id', book.id);
        
        if (updateError) {
          console.error('Error updating book status:', updateError);
        }
        
        toast.success('Book generation completed successfully!');
        await loadBooks();
        await loadRetryCredits(); // Refresh retry credits
      }
    } catch (error: any) {
      console.error('Error retrying generation:', error);
      toast.error(`Retry failed: ${error.message}`);
    } finally {
      setIsGeneratingPdf(null);
      setPdfProgress(null);
    }
  };

  const hasAssociatedOrders = (bookId: string): boolean => {
    return orders[bookId] && orders[bookId].length > 0;
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

  const handleReworkPages = async (book: Book) => {
    try {
      console.log('[Dashboard] Loading book for rework:', book.id);
      
      // Load full book data with pages
      const { data: fullBook, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', book.id)
        .single();
      
      if (bookError) throw bookError;
      if (!fullBook?.pages) throw new Error('Book pages not found');
      
      // Populate book store with all necessary data
      const bookStore = useBookStore.getState();
      
      // Add character data to store (CRITICAL FIX for rework bug)
      // Reset characters and add the book's character
      bookStore.addCharacter();
      const firstCharacterId = bookStore.characters[0]?.id;
      
      if (firstCharacterId) {
        bookStore.updateCharacter(firstCharacterId, { name: fullBook.character_name });
        
        // If there are photo URLs, add them to the character
        if (fullBook.photo_urls && fullBook.photo_urls.length > 0) {
          fullBook.photo_urls.forEach((url, idx) => {
            if (url && idx < 3) {
              // Store URL as string in photos array (will be processed later if needed)
              bookStore.setCharacterPhoto(firstCharacterId, idx, url as any);
            }
          });
        }
      }
      
      // Set all required state for rework mode
      bookStore.setGeneratedPages(fullBook.pages as any);
      bookStore.setGeneratedBookId(fullBook.id);
      bookStore.setReworkedPageNumbers((fullBook.reworked_page_numbers || []) as number[]);
      bookStore.setBookOptions(
        (fullBook.selected_page_count || 24) as PageCount,
        (fullBook.selected_binding_type || 'premium') as BindingType
      );
      bookStore.setCoverImageUrl(fullBook.cover_image_url);
      bookStore.setBackCoverImageUrl(fullBook.back_cover_image_url);
      bookStore.setComplexityLevel((fullBook.complexity || 'medium') as ComplexityLevel);
      bookStore.setInterests((fullBook.interests || []) as string[]);
      
      // Set step to complete so user sees their book with rework options
      bookStore.setStep('complete');
      
      // Navigate to app
      navigate('/app');
      
      toast.success('Book loaded for reworking');
    } catch (error: any) {
      console.error('[Dashboard] Error loading book for rework:', error);
      toast.error('Failed to load book: ' + error.message);
    }
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
        <div className="mb-8 flex items-center gap-4 flex-wrap">
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
          
          {!loading && retryCredits.length > 0 && (
            <Badge variant="secondary" className="text-sm gap-2 py-2 px-4">
              <Zap className="w-4 h-4 text-yellow-500" />
              {retryCredits.length} Free {retryCredits.length === 1 ? 'Retry' : 'Retries'} Available
            </Badge>
          )}
          
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
                  <AlertTitle className="text-amber-900 dark:text-amber-200">
                    {incompleteBooks.length} Incomplete Book(s) Found
                  </AlertTitle>
                  <AlertDescription className="text-amber-800 dark:text-amber-300">
                    <div className="space-y-2">
                      <p>The following books have missing components:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        {incompleteBooks.map(book => {
                          const missing = getMissingComponents(book);
                          return (
                            <li key={book.id}>
                              <strong>{book.character_name}'s Book</strong>: {missing.join(', ')}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-2">
                        Books with missing PDFs will be auto-generated when you click download.
                      </p>
                    </div>
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
                  {/* DEBUG: Show book ID on hover */}
                  <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                    {book.character_name} - {book.id.slice(0, 8)}
                  </div>
                      {(() => {
                        const missing = getMissingComponents(book);
                        return missing.length > 0 && (
                          <div className="absolute top-2 right-2 bg-amber-500 text-white rounded-full p-1.5 shadow-lg">
                            <AlertCircle className="w-4 h-4" />
                          </div>
                        );
                      })()}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {book.character_name}'s Coloring Book
                        </h3>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {book.pages && (
                            <Badge variant={book.pages.length === 12 ? "default" : "destructive"} className="text-xs">
                              {book.pages.length}/12
                            </Badge>
                          )}
                          {(() => {
                            const status = getBookStatusLabel(book);
                            return (
                              <Badge variant={status.variant} className="text-xs">
                                {status.label}
                              </Badge>
                            );
                          })()}
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
                      {book.missing_covers && (
                        <div className="mb-2 p-2 bg-amber-100 dark:bg-amber-950/50 border border-amber-500/50 rounded text-xs text-amber-700 dark:text-amber-300">
                          ⚠️ Book covers are missing
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
                         {(() => {
                           const completeness = validateBookCompleteness(book);
                           
                           // Show download button for completed books
                           return book.status === 'completed' ? (
                             <div className="space-y-2">
                               <Button
                                 size="default"
                                 variant="default"
                                 className="w-full"
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   handleDownloadOrGenerate(book);
                                 }}
                                 disabled={isGeneratingPdf === book.id || downloadingBookId === book.id}
                               >
                                 <BookOpen className="w-4 h-4 mr-1" />
                                 {downloadingBookId === book.id ? 'Downloading...' : isGeneratingPdf === book.id ? 'Generating...' : 'Download Book (Interior)'}
                               </Button>
                            <Button
                              size="sm"
                              variant="default"
                              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadCoverPDF(book);
                              }}
                              disabled={!book.cover_url || downloadingCoverId === book.id}
                            >
                              <FileText className="w-4 h-4 mr-1" />
                              {downloadingCoverId === book.id ? 'Downloading...' : 'Download Cover (Printing)'}
                            </Button>
                            {/* Helper text */}
                            <p className="text-xs text-muted-foreground text-center pt-1">
                              Interior for coloring • Cover for printing
                            </p>
                            
                            {/* Rework button - only show if reworks are available */}
                            {(() => {
                              const pageCount = book.selected_page_count || 12;
                              const maxReworks = Math.floor(pageCount * 0.5);
                              const usedReworks = (book.reworked_page_numbers || []).length;
                              const reworksRemaining = maxReworks - usedReworks;
                              
                              return reworksRemaining > 0 ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full border-purple-500/50 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReworkPages(book);
                                  }}
                                >
                                  <Zap className="w-4 h-4 mr-1" />
                                  Rework Pages ({reworksRemaining} left)
                                </Button>
                              ) : (
                                <div className="text-xs text-muted-foreground text-center py-2 px-3 bg-muted/50 rounded border border-border/50">
                                  All reworks used ({maxReworks}/{maxReworks})
                                </div>
                              );
                            })()}
                            
                            {/* Regenerate Cover button */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full border-pink-500/50 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/50"
                              onClick={(e) => handleRetryCoverGeneration(book, e)}
                              disabled={retryingCoverId === book.id}
                            >
                              <Sparkles className="w-4 h-4 mr-1" />
                              {retryingCoverId === book.id ? 'Regenerating...' : 'Regenerate Cover'}
                            </Button>
                            
                               <OrderPhysicalBookDialog 
                                 bookId={book.id}
                                 bookTitle={`${book.character_name}'s Coloring Book`}
                               />
                             </div>
                           ) : book.status === 'partial' || book.missing_covers ? (
                             <Button 
                               size="sm" 
                               variant="default" 
                               className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                               onClick={(e) => handleRetryCoverGeneration(book, e)}
                               disabled={retryingCoverId === book.id}
                             >
                               <Zap className="w-4 h-4 mr-1" />
                               {retryingCoverId === book.id ? 'Generating Covers...' : 'Retry Cover Generation'}
                             </Button>
                            ) : book.status === 'failed' || (book.status === 'processing' && hasAssociatedOrders(book.id)) ? (
                              (() => {
                                // PHASE 1: Accept ANY unused credit (not just book-specific)
                                const hasRetryCredit = retryCredits.some(
                                  credit => !credit.used_at
                                );
                                
                                return hasRetryCredit ? (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="w-full border-green-500/50 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRetryGeneration(book);
                                    }}
                                    disabled={isGeneratingPdf === book.id}
                                  >
                                    <Zap className="w-4 h-4 mr-1" />
                                    {isGeneratingPdf === book.id ? 'Retrying...' : 'Use Free Retry'}
                                  </Button>
                                ) : (
                                  <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-500/50 rounded text-xs text-amber-700 dark:text-amber-300">
                                    ⚠️ Book generation failed. Please contact support for assistance.
                                  </div>
                                );
                              })()
                            ) : (
                              <Button size="sm" variant="outline" className="w-full" disabled>
                                Processing...
                              </Button>
                            );
                         })()}
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
              <div 
                key={index} 
                className="relative aspect-[3/4] rounded-lg overflow-hidden border border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPageImage(page.imageUrl || page);
                  setSelectedPageIndex(index);
                }}
              >
                <img
                  src={page.imageUrl || page}
                  alt={`Page ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
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

      {/* Image Preview Dialog */}
      <Dialog open={!!selectedPageImage} onOpenChange={(open) => !open && setSelectedPageImage(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Page {(selectedPageIndex ?? 0) + 1} - Full View</DialogTitle>
          </DialogHeader>
          <div className="relative w-full max-h-[80vh] flex items-center justify-center bg-muted rounded-lg p-4">
            <img 
              src={selectedPageImage || ''} 
              alt={`Page ${(selectedPageIndex ?? 0) + 1}`}
              className="max-w-full max-h-[75vh] object-contain rounded"
            />
          </div>
          <div className="flex gap-2 justify-between">
            <Button 
              variant="outline" 
              onClick={() => {
                if (selectedPageIndex !== null && selectedPageIndex > 0 && selectedBookPages) {
                  setSelectedPageIndex(selectedPageIndex - 1);
                  const prevPage = selectedBookPages[selectedPageIndex - 1];
                  setSelectedPageImage(prevPage.imageUrl || prevPage);
                }
              }}
              disabled={selectedPageIndex === null || selectedPageIndex === 0}
            >
              Previous
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                if (selectedPageIndex !== null && selectedBookPages && selectedPageIndex < selectedBookPages.length - 1) {
                  setSelectedPageIndex(selectedPageIndex + 1);
                  const nextPage = selectedBookPages[selectedPageIndex + 1];
                  setSelectedPageImage(nextPage.imageUrl || nextPage);
                }
              }}
              disabled={selectedPageIndex === null || !selectedBookPages || selectedPageIndex === selectedBookPages.length - 1}
            >
              Next
            </Button>
          </div>
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
