import { supabase } from '@/integrations/supabase/client';
import { jsPDF } from 'jspdf';

export async function toDataUrl(url: string): Promise<string> {
  // If already a data URL, return as-is to avoid re-converting
  if (url.startsWith('data:')) {
    return url;
  }
  
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateCoverPdf(bookId: string, coverImageUrl: string): Promise<string> {
  try {
    // Get current user for proper path structure
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('User must be authenticated to generate PDF');
    }

    // Generate single-page cover PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: 'letter',
    });

    const pageWidth = 8.5;
    const pageHeight = 11;

    try {
      // Convert remote URL to data URL to avoid CORS issues
      const dataUrl = await toDataUrl(coverImageUrl);
      pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight);
    } catch (error) {
      console.error('Failed to add cover image to PDF:', error);
      throw new Error('Failed to process cover image');
    }

    // Convert PDF to blob
    const pdfBlob = pdf.output('blob');

    // Upload to storage with userId/bookId path structure for RLS compliance
    const fileName = `${user.id}/${bookId}/cover-${Date.now()}.pdf`;
    console.log('[generateCoverPdf] Uploading to path:', fileName);
    
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
      });

    if (uploadError) {
      throw new Error(`Failed to upload cover PDF: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName);

    const pdfUrl = urlData.publicUrl;

    // Update book record with cover_url
    const { error: updateError } = await supabase
      .from('books')
      .update({ cover_url: pdfUrl })
      .eq('id', bookId);

    if (updateError) {
      throw new Error(`Failed to update book: ${updateError.message}`);
    }

    return pdfUrl;
  } catch (error: any) {
    console.error('Error generating cover PDF:', error);
    throw error;
  }
}

export async function generateCoverWrapPdf(
  bookId: string,
  frontImageUrl: string,
  interiorPageCount: number
): Promise<string> {
  try {
    // Get current user for proper path structure
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('User must be authenticated to generate PDF');
    }

    // Constants for cover wrap (in inches)
    const width = 8.5;
    const height = 11;
    const bleed = 0.125;
    
    // Calculate spine width (60# white paper: ~0.002252" per page, minimum 0.02")
    const spineWidth = Math.max(0.02, 0.002252 * interiorPageCount);
    
    // Full wrap dimensions
    const fullWidth = (2 * width) + spineWidth + (2 * bleed);
    const fullHeight = height + (2 * bleed);
    
    console.log(`[generateCoverWrapPdf] Creating wrap cover:`);
    console.log(`  Pages: ${interiorPageCount}, Spine: ${spineWidth.toFixed(4)}"`);
    console.log(`  Full size: ${fullWidth.toFixed(3)}" x ${fullHeight.toFixed(3)}"`);

    // Create PDF with custom dimensions
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'in',
      format: [fullWidth, fullHeight],
    });

    // Fill background with white
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, fullWidth, fullHeight, 'F');

    // Add front cover image on the right panel
    try {
      const dataUrl = await toDataUrl(frontImageUrl);
      const frontX = bleed + width + spineWidth;
      const frontY = bleed;
      pdf.addImage(dataUrl, 'PNG', frontX, frontY, width, height);
      console.log(`  Front cover placed at x=${frontX.toFixed(3)}", y=${frontY}"`);
    } catch (error) {
      console.error('Failed to add front cover image:', error);
      throw new Error('Failed to process front cover image');
    }

    // Convert PDF to blob
    const pdfBlob = pdf.output('blob');

    // Upload to storage
    const fileName = `${user.id}/${bookId}/cover-wrap-${Date.now()}.pdf`;
    console.log('[generateCoverWrapPdf] Uploading to path:', fileName);
    
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
      });

    if (uploadError) {
      throw new Error(`Failed to upload cover wrap PDF: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName);

    const pdfUrl = urlData.publicUrl;

    // Update book record with cover_url
    const { error: updateError } = await supabase
      .from('books')
      .update({ cover_url: pdfUrl })
      .eq('id', bookId);

    if (updateError) {
      throw new Error(`Failed to update book: ${updateError.message}`);
    }

    return pdfUrl;
  } catch (error: any) {
    console.error('Error generating cover wrap PDF:', error);
    throw error;
  }
}

export async function repairBookPdf(
  bookId: string,
  pages: Array<{ imageUrl: string }>,
  options?: { minPages?: number; padWith?: 'blank' | 'repeat'; pageCount?: number; onProgress?: (current: number, total: number) => void }
): Promise<string> {
  try {
    // Get current user for proper path structure
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('User must be authenticated to generate PDF');
    }

    const { minPages = 24, padWith = 'blank', pageCount, onProgress } = options || {};
    // Use pageCount if provided, otherwise use minPages
    const targetPages = pageCount || minPages;

    // Generate interior PDF from existing page images
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: 'letter',
    });

    const pageWidth = 8.5;
    const pageHeight = 11;

    let processedPages = 0;

    // Add existing pages
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page.imageUrl) continue;

      if (processedPages > 0) {
        pdf.addPage();
      }

      try {
        // Report progress
        if (onProgress) {
          onProgress(i + 1, pages.length);
        }
        
        // Convert remote URL to data URL to avoid CORS issues
        const dataUrl = await toDataUrl(page.imageUrl);
        pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight);
        processedPages++;
      } catch (error) {
        console.error(`Failed to add page ${i + 1} to PDF:`, error);
        // Continue with other pages
      }
    }

    // Pad to target page count
    while (processedPages < targetPages) {
      pdf.addPage();
      // Leave blank (white background by default)
      processedPages++;
    }

    // Ensure even page count
    if (processedPages % 2 !== 0) {
      pdf.addPage();
      processedPages++;
    }

    console.log(`[repairBookPdf] Final page count: ${processedPages} (target: ${targetPages})`);

    // Convert PDF to blob
    const pdfBlob = pdf.output('blob');

    // Upload to storage with userId/bookId path structure for RLS compliance
    const fileName = `${user.id}/${bookId}/interior-${Date.now()}.pdf`;
    console.log('[repairPdf] Uploading to path:', fileName);
    
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
      });

    if (uploadError) {
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName);

    const pdfUrl = urlData.publicUrl;

    // Update book record
    const { error: updateError } = await supabase
      .from('books')
      .update({ pdf_url: pdfUrl })
      .eq('id', bookId);

    if (updateError) {
      throw new Error(`Failed to update book: ${updateError.message}`);
    }

    return pdfUrl;
  } catch (error: any) {
    console.error('Error repairing PDF:', error);
    throw error;
  }
}
