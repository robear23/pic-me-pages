export interface Book {
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
}

export interface BookCompleteness {
  isComplete: boolean;
  missingComponents: string[];
  canAutoFix: boolean;
  canDownload: boolean;
  canOrder: boolean;
}

export function getMissingComponents(book: Book): string[] {
  const missing: string[] = [];
  
  if (!book.pdf_url) missing.push('Interior PDF');
  if (!book.cover_url) missing.push('Cover PDF');
  if (!book.cover_image_url) missing.push('Cover Image');
  if (!book.back_cover_image_url) missing.push('Back Cover Image');
  
  const pageCount = book.pages?.length || 0;
  if (pageCount > 0 && pageCount < 12) missing.push(`${12 - pageCount} Pages`);
  
  return missing;
}

export function validateBookCompleteness(book: Book): BookCompleteness {
  const missing: string[] = [];
  
  // Check for missing files
  if (!book.pdf_url) missing.push('interior_pdf');
  if (!book.cover_url) missing.push('cover_pdf');
  if (!book.cover_image_url) missing.push('cover_image');
  if (!book.back_cover_image_url) missing.push('back_cover_image');
  
  // Check for incomplete generation
  if (book.status === 'processing') missing.push('processing');
  if (book.status === 'failed') missing.push('failed');
  if (book.status === 'partial') missing.push('partial');
  
  // Check pages
  const pageCount = book.pages?.length || 0;
  if (pageCount < 12) missing.push(`${12 - pageCount}_pages`);
  
  // Determine if can auto-fix (has all pages and covers, just needs PDFs)
  const canAutoFix = 
    book.status === 'completed' &&
    pageCount === 12 &&
    book.cover_image_url &&
    book.back_cover_image_url &&
    (missing.includes('interior_pdf') || missing.includes('cover_pdf'));
  
  return {
    isComplete: missing.length === 0,
    missingComponents: missing,
    canAutoFix,
    canDownload: book.pdf_url !== null,
    canOrder: !missing.includes('cover_pdf') && !missing.includes('cover_image') && !missing.includes('back_cover_image'),
  };
}

export function findIncompleteBooks(books: Book[]): Book[] {
  return books.filter(book => !validateBookCompleteness(book).isComplete);
}

export function getBookStatusLabel(book: Book): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const missing = getMissingComponents(book);
  
  if (book.status === 'failed') return { label: 'Failed', variant: 'destructive' };
  if (book.status === 'processing') return { label: 'Generating...', variant: 'secondary' };
  if (book.status === 'partial' || book.missing_covers) return { label: 'Partial', variant: 'secondary' };
  
  if (missing.length > 0) {
    return { label: `Missing: ${missing.join(', ')}`, variant: 'outline' };
  }
  
  return { label: 'Ready', variant: 'default' };
}
