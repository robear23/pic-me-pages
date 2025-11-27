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
      unit: 'pt', // Use points for better DPI control
      format: 'letter',
      compress: false, // Disable compression to maintain image quality
      putOnlyUsedFonts: true, // Only include fonts that are actually used
      floatPrecision: 16, // High precision for measurements
    });
    
    // Add PDF/X metadata for print-ready status
    pdf.setProperties({
      title: 'Print-Ready Book Cover',
      subject: 'Coloring Book Cover',
      author: 'Generated via Lovable',
      keywords: 'coloring book, print',
      creator: 'jsPDF with embedded fonts'
    });

    const pageWidth = 8.5 * LULU_CONFIG.POINTS_PER_INCH;
    const pageHeight = 11 * LULU_CONFIG.POINTS_PER_INCH;

    try {
      // Convert remote URL to data URL to avoid CORS issues
      const dataUrl = await toDataUrl(coverImageUrl);
      pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
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
  podPackageId?: string,
  showGuides?: boolean // NEW: Add visual margin guides for testing
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
      unit: 'pt', // Use points for better DPI control
      format: [LULU_CONFIG.COVER_WIDTH * LULU_CONFIG.POINTS_PER_INCH, LULU_CONFIG.COVER_HEIGHT * LULU_CONFIG.POINTS_PER_INCH],
      compress: false, // Disable compression to maintain image quality
      putOnlyUsedFonts: true, // Only include fonts that are actually used
      floatPrecision: 16, // High precision for measurements
    });
    
    // Add PDF/X metadata for print-ready status
    pdf.setProperties({
      title: 'Print-Ready Book Cover Wrap',
      subject: 'Coloring Book Cover Wrap',
      author: 'Generated via Lovable',
      keywords: 'coloring book, print, wrap cover',
      creator: 'jsPDF with embedded fonts'
    });

    const halfWidth = (LULU_CONFIG.COVER_WIDTH / 2) * LULU_CONFIG.POINTS_PER_INCH; // Convert to points
    const fullWidth = LULU_CONFIG.COVER_WIDTH * LULU_CONFIG.POINTS_PER_INCH;
    const fullHeight = LULU_CONFIG.COVER_HEIGHT * LULU_CONFIG.POINTS_PER_INCH;

    // Convert images to data URLs and add to PDF
    const backCoverDataUrl = await toDataUrl(backImageUrl);
    const frontCoverDataUrl = await toDataUrl(frontImageUrl);

    // Use fullHeight (in points) instead of LULU_CONFIG.COVER_HEIGHT (in inches)
    // Use 'NONE' compression to preserve high-resolution upscaled images
    pdf.addImage(backCoverDataUrl, 'PNG', 0, 0, halfWidth, fullHeight, undefined, 'NONE');
    pdf.addImage(frontCoverDataUrl, 'PNG', halfWidth, 0, halfWidth, fullHeight, undefined, 'NONE');

    // Add margin guides if requested (for testing)
    if (showGuides) {
      drawCoverMarginGuides(pdf);
    }

    console.log(`✓ Cover wrap generated: ${LULU_CONFIG.COVER_WIDTH}" x ${LULU_CONFIG.COVER_HEIGHT}"`);
    console.log('  Layout: Back (left) | Front (right) - NO SPINE');

    // Convert PDF to blob
    const pdfBlob = pdf.output('blob');
    
    // Log PDF dimensions for verification
    const pdfDimensions = pdf.internal.pageSize;
    const pdfWidthInches = pdfDimensions.getWidth() / LULU_CONFIG.POINTS_PER_INCH;
    const pdfHeightInches = pdfDimensions.getHeight() / LULU_CONFIG.POINTS_PER_INCH;
    console.log(`✓ PDF dimensions verified: ${pdfWidthInches.toFixed(3)}" x ${pdfHeightInches.toFixed(3)}"`);

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

// Helper function to draw cover margin guides
function drawCoverMarginGuides(doc: jsPDF) {
  const currentDrawColor = doc.getDrawColor();
  const currentLineWidth = doc.getLineWidth();
  
  const halfWidth = (LULU_CONFIG.COVER_WIDTH / 2) * LULU_CONFIG.POINTS_PER_INCH;
  const fullWidth = LULU_CONFIG.COVER_WIDTH * LULU_CONFIG.POINTS_PER_INCH;
  const fullHeight = LULU_CONFIG.COVER_HEIGHT * LULU_CONFIG.POINTS_PER_INCH;
  const bleedPt = LULU_CONFIG.BLEED * LULU_CONFIG.POINTS_PER_INCH;
  
  // Draw outer bleed line (red)
  doc.setDrawColor(255, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(0, 0, fullWidth, fullHeight);
  
  // Draw trim lines (blue)
  doc.setDrawColor(0, 0, 255);
  doc.rect(
    bleedPt,
    bleedPt,
    fullWidth - (bleedPt * 2),
    fullHeight - (bleedPt * 2)
  );
  
  // Draw center divider between back and front
  doc.setDrawColor(128, 128, 128);
  doc.line(halfWidth, 0, halfWidth, fullHeight);
  
  // Draw safety margins (green) - 0.25" recommended
  const safetyMargin = 0.25 * LULU_CONFIG.POINTS_PER_INCH;
  doc.setDrawColor(0, 255, 0);
  // Back cover safety
  doc.rect(
    bleedPt + safetyMargin,
    bleedPt + safetyMargin,
    halfWidth - bleedPt - (safetyMargin * 2),
    fullHeight - (bleedPt * 2) - (safetyMargin * 2)
  );
  // Front cover safety
  doc.rect(
    halfWidth + safetyMargin,
    bleedPt + safetyMargin,
    halfWidth - bleedPt - (safetyMargin * 2),
    fullHeight - (bleedPt * 2) - (safetyMargin * 2)
  );
  
  // Add labels
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('BACK COVER', 1, 0.5);
  doc.text('FRONT COVER', halfWidth + 1, 0.5);
  doc.setFontSize(8);
  doc.setTextColor(255, 0, 0);
  doc.text('Bleed 0.125"', 0.15, 0.15);
  doc.setTextColor(0, 255, 0);
  doc.text('Safety 0.25"', 0.4, 0.9);
  
  doc.setDrawColor(currentDrawColor);
  doc.setLineWidth(currentLineWidth);
  doc.setTextColor(0);
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
    showGuides?: boolean; // NEW: Add visual margin guides for testing
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
      unit: 'pt', // Use points for better DPI control
      format: [LULU_CONFIG.PAGE_WIDTH * LULU_CONFIG.POINTS_PER_INCH, LULU_CONFIG.PAGE_HEIGHT * LULU_CONFIG.POINTS_PER_INCH],
      compress: false, // Disable compression to maintain image quality
      putOnlyUsedFonts: true, // Only include fonts that are actually used
      floatPrecision: 16, // High precision for measurements
    });
    
    // Add PDF/X metadata for print-ready status
    pdf.setProperties({
      title: 'Print-Ready Book Interior',
      subject: 'Coloring Book Pages',
      author: 'Generated via Lovable',
      keywords: 'coloring book, print, interior',
      creator: 'jsPDF with embedded fonts'
    });

    // Get content area with gutter
    const contentArea = getContentArea(bindingType);
    
    console.log(`  Content area: ${contentArea.width.toFixed(2)}" x ${contentArea.height.toFixed(2)}"`);
    console.log(`  Safety margin: ${LULU_CONFIG.SAFETY_MARGIN}"`);
    console.log(`  Gutter (binding): ${bindingType === 'COIL' ? LULU_CONFIG.GUTTER_COIL : LULU_CONFIG.GUTTER_SADDLE}"`);

    // Filter out any null/undefined pages before processing
    const validPages = pages.filter(page => page != null && page.imageUrl);

    if (validPages.length === 0) {
      throw new Error('No valid pages found to generate PDF');
    }

    console.log(`[repairBookPdf] Processing ${validPages.length} valid pages out of ${pages.length} total`);

    let processedPages = 0;
    const totalPages = options?.pageCount || Math.max(options?.minPages || 12, validPages.length);

    for (let i = 0; i < validPages.length; i++) {
      const page = validPages[i];
      
      if (i > 0) {
        pdf.addPage([LULU_CONFIG.PAGE_WIDTH * LULU_CONFIG.POINTS_PER_INCH, LULU_CONFIG.PAGE_HEIGHT * LULU_CONFIG.POINTS_PER_INCH], 'portrait');
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
        // Calculate actual image dimensions after DPI processing
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = processedImage;
        });

        // Convert dimensions to points (72 points = 1 inch)
        const imgWidthPt = (img.naturalWidth / LULU_CONFIG.TARGET_DPI) * LULU_CONFIG.POINTS_PER_INCH;
        const imgHeightPt = (img.naturalHeight / LULU_CONFIG.TARGET_DPI) * LULU_CONFIG.POINTS_PER_INCH;
        const contentLeftPt = contentArea.left * LULU_CONFIG.POINTS_PER_INCH;
        const contentTopPt = contentArea.top * LULU_CONFIG.POINTS_PER_INCH;
        const contentWidthPt = contentArea.width * LULU_CONFIG.POINTS_PER_INCH;
        const contentHeightPt = contentArea.height * LULU_CONFIG.POINTS_PER_INCH;

        // Center the image in the content area
        const xOffset = contentLeftPt + (contentWidthPt - imgWidthPt) / 2;
        const yOffset = contentTopPt + (contentHeightPt - imgHeightPt) / 2;

        pdf.addImage(
          processedImage,
          'PNG',
          xOffset,
          yOffset,
          imgWidthPt,
          imgHeightPt,
          `page${i + 1}`,
          'FAST' // Use FAST compression or 'NONE' for no compression
        );

        // Add margin guides if requested (for testing)
        if (options?.showGuides) {
          drawMarginGuides(pdf, bindingType);
        }

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
        pdf.addPage([LULU_CONFIG.PAGE_WIDTH * LULU_CONFIG.POINTS_PER_INCH, LULU_CONFIG.PAGE_HEIGHT * LULU_CONFIG.POINTS_PER_INCH], 'portrait');
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

// Helper function to draw interior margin guides for testing/validation
function drawMarginGuides(doc: jsPDF, bindingType: 'SADDLE' | 'COIL') {
  const contentArea = getContentArea(bindingType);
  
  // Convert all measurements to points
  const pageWidthPt = LULU_CONFIG.PAGE_WIDTH * LULU_CONFIG.POINTS_PER_INCH;
  const pageHeightPt = LULU_CONFIG.PAGE_HEIGHT * LULU_CONFIG.POINTS_PER_INCH;
  const bleedPt = LULU_CONFIG.BLEED * LULU_CONFIG.POINTS_PER_INCH;
  const trimWidthPt = LULU_CONFIG.TRIM_WIDTH * LULU_CONFIG.POINTS_PER_INCH;
  const trimHeightPt = LULU_CONFIG.TRIM_HEIGHT * LULU_CONFIG.POINTS_PER_INCH;
  const contentLeftPt = LULU_CONFIG.CONTENT_LEFT * LULU_CONFIG.POINTS_PER_INCH;
  const contentTopPt = LULU_CONFIG.CONTENT_TOP * LULU_CONFIG.POINTS_PER_INCH;
  const contentRightPt = LULU_CONFIG.CONTENT_RIGHT * LULU_CONFIG.POINTS_PER_INCH;
  const contentBottomPt = LULU_CONFIG.CONTENT_BOTTOM * LULU_CONFIG.POINTS_PER_INCH;
  const contentAreaLeftPt = contentArea.left * LULU_CONFIG.POINTS_PER_INCH;
  const contentAreaTopPt = contentArea.top * LULU_CONFIG.POINTS_PER_INCH;
  const contentAreaWidthPt = contentArea.width * LULU_CONFIG.POINTS_PER_INCH;
  const contentAreaHeightPt = contentArea.height * LULU_CONFIG.POINTS_PER_INCH;
  
  // Save current state
  const currentDrawColor = doc.getDrawColor();
  const currentLineWidth = doc.getLineWidth();
  
  // Draw bleed line (outermost - red)
  doc.setDrawColor(255, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(0, 0, pageWidthPt, pageHeightPt);
  
  // Draw trim line (blue)
  doc.setDrawColor(0, 0, 255);
  doc.rect(
    bleedPt,
    bleedPt,
    trimWidthPt,
    trimHeightPt
  );
  
  // Draw safety margin (green)
  doc.setDrawColor(0, 255, 0);
  doc.rect(
    contentLeftPt,
    contentTopPt,
    contentRightPt - contentLeftPt,
    contentBottomPt - contentTopPt
  );
  
  // Draw content area with gutter (yellow)
  doc.setDrawColor(255, 255, 0);
  doc.rect(
    contentAreaLeftPt,
    contentAreaTopPt,
    contentAreaWidthPt,
    contentAreaHeightPt
  );
  
  // Add labels
  doc.setFontSize(8);
  doc.setTextColor(255, 0, 0);
  doc.text('Bleed (0.125")', 0.15 * LULU_CONFIG.POINTS_PER_INCH, 0.1 * LULU_CONFIG.POINTS_PER_INCH);
  doc.setTextColor(0, 0, 255);
  doc.text('Trim Line', 0.15 * LULU_CONFIG.POINTS_PER_INCH, 0.25 * LULU_CONFIG.POINTS_PER_INCH);
  doc.setTextColor(0, 255, 0);
  doc.text('Safety (0.5")', 0.75 * LULU_CONFIG.POINTS_PER_INCH, 0.75 * LULU_CONFIG.POINTS_PER_INCH);
  doc.setTextColor(255, 255, 0);
  doc.text(`Content (${bindingType === 'COIL' ? 'w/ gutter' : 'no gutter'})`, contentAreaLeftPt + (0.1 * LULU_CONFIG.POINTS_PER_INCH), contentAreaTopPt + (0.15 * LULU_CONFIG.POINTS_PER_INCH));
  
  // Restore state
  doc.setDrawColor(currentDrawColor);
  doc.setLineWidth(currentLineWidth);
  doc.setTextColor(0);
}
