import { supabase } from '@/integrations/supabase/client';
import { jsPDF } from 'jspdf';
import { LULU_CONFIG, getBindingType, isColorPackage, validatePageCount, getContentArea } from './luluConfig';
import { validateImageResolution, convertToGrayscale, ensureImageDPI } from './imageProcessing';

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
  backImageUrl: string,
  podPackageId?: string
): Promise<string> {
  try {
    // Get current user for proper path structure
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('User must be authenticated to generate PDF');
    }

    console.log(`[generateCoverWrapPdf] Creating Lulu-compliant wrap cover`);
    console.log(`  Dimensions: ${LULU_CONFIG.COVER_WIDTH}" x ${LULU_CONFIG.COVER_HEIGHT}"`);
    console.log(`  No spine (coil/saddle stitch binding)`);

    // Create PDF with Lulu-compliant dimensions (NO SPINE)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'in',
      format: [LULU_CONFIG.COVER_HEIGHT, LULU_CONFIG.COVER_WIDTH],
    });

    const halfWidth = LULU_CONFIG.COVER_WIDTH / 2; // 8.625" each side

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
  options?: {
    minPages?: number;
    padWith?: 'blank' | 'repeat';
    pageCount?: number;
    podPackageId?: string;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<string> {
  try {
    // Get current user for proper path structure
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('User must be authenticated to generate PDF');
    }

    // Determine binding type and color mode
    const bindingType = options?.podPackageId 
      ? getBindingType(options.podPackageId) 
      : 'SADDLE';
    const isColor = options?.podPackageId 
      ? isColorPackage(options.podPackageId) 
      : false;

    console.log(`[repairBookPdf] Creating Lulu-compliant interior PDF`);
    console.log(`  Binding: ${bindingType}`);
    console.log(`  Color: ${isColor ? 'Full Color' : 'Black & White'}`);
    console.log(`  Dimensions: ${LULU_CONFIG.PAGE_WIDTH}" x ${LULU_CONFIG.PAGE_HEIGHT}" (with bleed)`);

    // Create PDF with Lulu-compliant dimensions
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: [LULU_CONFIG.PAGE_WIDTH, LULU_CONFIG.PAGE_HEIGHT],
      compress: true,
    });

    // Get content area with gutter
    const contentArea = getContentArea(bindingType);
    
    console.log(`  Content area: ${contentArea.width.toFixed(2)}" x ${contentArea.height.toFixed(2)}"`);
    console.log(`  Safety margin: ${LULU_CONFIG.SAFETY_MARGIN}"`);
    console.log(`  Gutter (binding): ${bindingType === 'COIL' ? LULU_CONFIG.GUTTER_COIL : LULU_CONFIG.GUTTER_SADDLE}"`);

    let processedPages = 0;
    const totalPages = options?.pageCount || Math.max(options?.minPages || 12, pages.length);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      if (i > 0) {
        pdf.addPage([LULU_CONFIG.PAGE_WIDTH, LULU_CONFIG.PAGE_HEIGHT], 'portrait');
      }

      if (!page.imageUrl) {
        console.log(`Skipping page ${i + 1} - no image URL`);
        processedPages++;
        options?.onProgress?.(processedPages, totalPages);
        continue;
      }

      try {
        // Convert to data URL
        const dataUrl = await toDataUrl(page.imageUrl);

        // Validate resolution (warning only)
        const resValidation = await validateImageResolution(
          dataUrl,
          contentArea.width,
          contentArea.height
        );

        if (!resValidation.valid) {
          console.warn(`Page ${i + 1}: ${resValidation.message}`);
        }

        // Convert to grayscale for B&W books
        let processedImage = dataUrl;
        if (!isColor) {
          processedImage = await convertToGrayscale(dataUrl);
        }

        // Ensure 300 DPI
        processedImage = await ensureImageDPI(
          processedImage,
          contentArea.width,
          contentArea.height
        );

        // Add image with proper placement respecting margins
        pdf.addImage(
          processedImage,
          'PNG',
          contentArea.left,
          contentArea.top,
          contentArea.width,
          contentArea.height,
          `page${i + 1}`,
          'NONE',
          0
        );

        console.log(`✓ Page ${i + 1} added`);
      } catch (error) {
        console.error(`Failed to add page ${i + 1}:`, error);
      }

      processedPages++;
      options?.onProgress?.(processedPages, totalPages);
    }

    // Validate and adjust page count for binding type
    const validation = validatePageCount(processedPages, bindingType);
    
    if (!validation.valid) {
      console.warn(validation.message);
      
      // Add blank pages to reach adjusted count
      const blankPagesNeeded = validation.adjustedCount - processedPages;
      console.log(`Adding ${blankPagesNeeded} blank pages for ${bindingType} binding compliance`);
      
      for (let i = 0; i < blankPagesNeeded; i++) {
        pdf.addPage([LULU_CONFIG.PAGE_WIDTH, LULU_CONFIG.PAGE_HEIGHT], 'portrait');
        processedPages++;
        options?.onProgress?.(processedPages, validation.adjustedCount);
      }
    }

    console.log(`✓ Final page count: ${processedPages} (${bindingType} binding compliant)`);

    // Convert PDF to blob
    const pdfBlob = pdf.output('blob');
    console.log(`✓ PDF generated: ${(pdfBlob.size / 1024 / 1024).toFixed(2)} MB`);

    // Upload to storage with userId/bookId path structure for RLS compliance
    const fileName = `${user.id}/${bookId}/interior-${Date.now()}.pdf`;
    console.log('[repairBookPdf] Uploading to path:', fileName);
    
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload interior PDF: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName);

    const pdfUrl = urlData.publicUrl;
    console.log('✓ Interior PDF uploaded:', pdfUrl);

    // Update book record with pdf_url
    const { error: updateError } = await supabase
      .from('books')
      .update({ pdf_url: pdfUrl })
      .eq('id', bookId);

    if (updateError) {
      throw new Error(`Failed to update book: ${updateError.message}`);
    }

    return pdfUrl;
  } catch (error: any) {
    console.error('Error generating interior PDF:', error);
    throw error;
  }
}
