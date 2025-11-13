import { supabase } from '@/integrations/supabase/client';
import { jsPDF } from 'jspdf';

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function repairBookPdf(bookId: string, pages: Array<{ imageUrl: string }>): Promise<string> {
  try {
    // Generate interior PDF from existing page images
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: 'letter',
    });

    const pageWidth = 8.5;
    const pageHeight = 11;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page.imageUrl) continue;

      if (i > 0) {
        pdf.addPage();
      }

      try {
        // Convert remote URL to data URL to avoid CORS issues
        const dataUrl = await toDataUrl(page.imageUrl);
        pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight);
      } catch (error) {
        console.error(`Failed to add page ${i + 1} to PDF:`, error);
        // Continue with other pages
      }
    }

    // Convert PDF to blob
    const pdfBlob = pdf.output('blob');

    // Upload to storage
    const fileName = `${bookId}/interior-${Date.now()}.pdf`;
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
