import { jsPDF } from 'jspdf';
import { UK_PDF_CONFIG, getUKContentArea, inchesToPoints } from './ukPdfConfig';
import { supabase } from '@/integrations/supabase/client';
import { toDataUrl } from './repairPdf';
import { convertToGrayscale, ensureImageDPI } from './imageProcessing';
import { getStoredSession } from '@/contexts/AuthContext';
/**
 * Create a colored cover page (front or back) for UK book
 * 
 * @param doc - jsPDF instance
 * @param type - 'front' or 'back' cover
 * @param childName - Child's name to display on cover
 */
function createCoverPage(
  doc: jsPDF,
  type: 'front' | 'back',
  childName: string
): void {
  const w = inchesToPoints(UK_PDF_CONFIG.PAGE_WIDTH_INCHES);
  const h = inchesToPoints(UK_PDF_CONFIG.PAGE_HEIGHT_INCHES);
  
  // Draw background with gradient-like effect
  doc.setFillColor(UK_PDF_CONFIG.COVER_BACKGROUND);
  doc.rect(0, 0, w, h, 'F');
  
  if (type === 'front') {
    // Front cover design
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(UK_PDF_CONFIG.COVER_TITLE_SIZE);
    doc.setTextColor(UK_PDF_CONFIG.COVER_TEXT_PRIMARY);
    
    // Main title - child's name
    const nameText = `${childName}'s`;
    doc.text(nameText, w / 2, h * 0.35, { align: 'center' });
    
    const adventureText = 'Coloring Adventure';
    doc.text(adventureText, w / 2, h * 0.45, { align: 'center' });
    
    // Subtitle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(UK_PDF_CONFIG.COVER_SUBTITLE_SIZE);
    doc.setTextColor(UK_PDF_CONFIG.COVER_TEXT_SECONDARY);
    doc.text('18 Personalized Coloring Pages', w / 2, h * 0.55, { align: 'center' });
    
    // Footer branding
    doc.setFontSize(UK_PDF_CONFIG.COVER_FOOTER_SIZE);
    doc.setTextColor(UK_PDF_CONFIG.COVER_ACCENT);
    doc.text('ColorMeInBooks.com', w / 2, h * 0.92, { align: 'center' });
    
  } else {
    // Back cover design
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(UK_PDF_CONFIG.BACK_COVER_TITLE_SIZE);
    doc.setTextColor(UK_PDF_CONFIG.COVER_TEXT_PRIMARY);
    
    // Main heading
    doc.text('Keep Coloring!', w / 2, h * 0.35, { align: 'center' });
    
    // Description text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(UK_PDF_CONFIG.BACK_COVER_TEXT_SIZE);
    doc.setTextColor(UK_PDF_CONFIG.COVER_TEXT_SECONDARY);
    
    const lines = [
      `This book created especially for ${childName}`,
      '',
      '18 pages of coloring fun!',
      '',
      'Created with love by',
      'Color Me In Books'
    ];
    
    let yPos = h * 0.50;
    lines.forEach((line) => {
      doc.text(line, w / 2, yPos, { align: 'center' });
      yPos += 20;
    });
  }
}

/**
 * Generate UK A4 PDF with 20 pages total:
 * - Page 1: Front cover (full color)
 * - Pages 2-19: 18 coloring pages (black & white)
 * - Page 20: Back cover (full color)
 * 
 * IMPORTANT: This function REUSES existing AI-generated images.
 * It only handles PDF assembly, not image generation.
 * 
 * @param bookId - Book ID for storage path
 * @param coloringPages - Array of 18 generated page objects with imageUrl
 * @param childName - Child's name for cover pages
 * @param onProgress - Optional progress callback
 * @returns Public URL of generated PDF
 */
export async function generateUKBookPdf(
  bookId: string,
  coloringPages: Array<{ imageUrl: string }>,
  childName: string,
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  try {
    const userId = getStoredSession()?.user?.id;
    if (!userId) {
      throw new Error('User must be authenticated to generate PDF');
    }
    
    if (coloringPages.length !== UK_PDF_CONFIG.COLORING_PAGES) {
      throw new Error(
        `Expected ${UK_PDF_CONFIG.COLORING_PAGES} coloring pages, got ${coloringPages.length}`
      );
    }
    
    console.log(`[UK PDF] Generating A4 PDF for ${childName} (${UK_PDF_CONFIG.TOTAL_PAGES} pages total)`);
    console.log(`  Dimensions: ${UK_PDF_CONFIG.PAGE_WIDTH_MM}mm x ${UK_PDF_CONFIG.PAGE_HEIGHT_MM}mm (A4)`);
    console.log(`  ${UK_PDF_CONFIG.COLORING_PAGES} coloring pages + 2 covers`);
    
    // Create A4 PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: [
        inchesToPoints(UK_PDF_CONFIG.PAGE_WIDTH_INCHES),
        inchesToPoints(UK_PDF_CONFIG.PAGE_HEIGHT_INCHES)
      ],
      compress: false, // Maintain quality
      putOnlyUsedFonts: true,
      floatPrecision: 16,
    });
    
    pdf.setProperties({
      title: `${childName}'s Coloring Book`,
      subject: 'Personalized Coloring Book - UK Edition',
      author: 'Color Me In Books',
      keywords: 'coloring book, personalized, A4, UK',
      creator: 'ColorMeInBooks.com'
    });
    
    const contentArea = getUKContentArea();
    const w = inchesToPoints(UK_PDF_CONFIG.PAGE_WIDTH_INCHES);
    const h = inchesToPoints(UK_PDF_CONFIG.PAGE_HEIGHT_INCHES);
    const marginPt = inchesToPoints(UK_PDF_CONFIG.MARGIN_INCHES);
    
    let currentPage = 0;
    const totalPages = UK_PDF_CONFIG.TOTAL_PAGES;
    
    // PAGE 1: Front cover (color)
    createCoverPage(pdf, 'front', childName);
    currentPage++;
    onProgress?.(currentPage, totalPages);
    console.log('✓ Front cover added (page 1)');
    
    // PAGES 2-19: Coloring pages (B&W)
    for (let i = 0; i < coloringPages.length; i++) {
      pdf.addPage([w, h], 'portrait');
      
      const page = coloringPages[i];
      if (!page.imageUrl) {
        console.warn(`Page ${i + 1} missing imageUrl, skipping`);
        currentPage++;
        onProgress?.(currentPage, totalPages);
        continue;
      }
      
      try {
        // Convert to data URL
        let dataUrl = await toDataUrl(page.imageUrl);
        
        // Convert to grayscale for coloring pages
        dataUrl = await convertToGrayscale(dataUrl);
        
        // Ensure 300 DPI
        dataUrl = await ensureImageDPI(
          dataUrl,
          contentArea.width,
          contentArea.height
        );
        
        // Load image to get dimensions
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = dataUrl;
        });
        
        // Calculate dimensions in points
        const imgWidthPt = (img.naturalWidth / UK_PDF_CONFIG.DPI) * UK_PDF_CONFIG.POINTS_PER_INCH;
        const imgHeightPt = (img.naturalHeight / UK_PDF_CONFIG.DPI) * UK_PDF_CONFIG.POINTS_PER_INCH;
        const contentWidthPt = inchesToPoints(contentArea.width);
        const contentHeightPt = inchesToPoints(contentArea.height);
        
        // Center the image in the content area with margins
        const xOffset = marginPt + (contentWidthPt - imgWidthPt) / 2;
        const yOffset = marginPt + (contentHeightPt - imgHeightPt) / 2;
        
        // Add image to PDF
        pdf.addImage(
          dataUrl,
          'PNG',
          xOffset,
          yOffset,
          imgWidthPt,
          imgHeightPt,
          `page${i + 1}`,
          'FAST'
        );
        
        currentPage++;
        onProgress?.(currentPage, totalPages);
        console.log(`✓ Coloring page ${i + 1}/${UK_PDF_CONFIG.COLORING_PAGES} added (page ${currentPage})`);
      } catch (error) {
        console.error(`Failed to add page ${i + 1}:`, error);
        currentPage++;
        onProgress?.(currentPage, totalPages);
      }
    }
    
    // PAGE 20: Back cover (color)
    pdf.addPage([w, h], 'portrait');
    createCoverPage(pdf, 'back', childName);
    currentPage++;
    onProgress?.(currentPage, totalPages);
    console.log('✓ Back cover added (page 20)');
    
    // Convert to blob
    const pdfBlob = pdf.output('blob');
    const sizeMB = (pdfBlob.size / 1024 / 1024).toFixed(2);
    console.log(`✓ UK PDF generated: ${sizeMB} MB`);
    
    // Upload to storage
    const fileName = `${userId}/${bookId}/uk-book-${Date.now()}.pdf`;
    console.log('[UK PDF] Uploading to path:', fileName);
    
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });
    
    if (uploadError) {
      throw new Error(`Failed to upload UK PDF: ${uploadError.message}`);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName);
    
    console.log('✓ UK PDF uploaded:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error: any) {
    console.error('Error generating UK PDF:', error);
    throw error;
  }
}

/**
 * Generate UK book cover only (for preview purposes)
 * This creates just the front cover as a single-page PDF
 */
export async function generateUKCoverOnly(
  bookId: string,
  childName: string
): Promise<string> {
  try {
    const userId = getStoredSession()?.user?.id;
    if (!userId) {
      throw new Error('User must be authenticated to generate PDF');
    }
    
    const w = inchesToPoints(UK_PDF_CONFIG.PAGE_WIDTH_INCHES);
    const h = inchesToPoints(UK_PDF_CONFIG.PAGE_HEIGHT_INCHES);
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: [w, h],
      compress: false,
    });
    
    pdf.setProperties({
      title: `${childName}'s Coloring Book Cover`,
      subject: 'UK Book Cover',
      creator: 'ColorMeInBooks.com'
    });
    
    createCoverPage(pdf, 'front', childName);
    
    const pdfBlob = pdf.output('blob');
    const fileName = `${userId}/${bookId}/uk-cover-${Date.now()}.pdf`;
    
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });
    
    if (uploadError) {
      throw new Error(`Failed to upload UK cover: ${uploadError.message}`);
    }
    
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName);
    
    return urlData.publicUrl;
  } catch (error: any) {
    console.error('Error generating UK cover:', error);
    throw error;
  }
}
