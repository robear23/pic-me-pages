import { supabase } from '@/integrations/supabase/client';
import { jsPDF } from 'jspdf';

interface SaveBookParams {
  userId: string;
  characterName: string;
  interests: string[];
  complexity: string;
  artStyle: string;
  consistentCharacters: boolean;
  characterPhotos: File[];
  generatedPages: Array<{ pageNumber: number; imageUrl: string; prompt: string }>;
}

export async function saveBookToDatabase(params: SaveBookParams): Promise<string | null> {
  try {
    const {
      userId,
      characterName,
      interests,
      complexity,
      artStyle,
      consistentCharacters,
      characterPhotos,
      generatedPages,
    } = params;

    // 1. Upload character photos to storage
    const photoUrls: string[] = [];
    for (let i = 0; i < characterPhotos.length; i++) {
      const file = characterPhotos[i];
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}-${i}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from('user-photos')
        .getPublicUrl(fileName);

      photoUrls.push(urlData.publicUrl);
    }

    // 2. Upload generated page images to storage
    const pageUrls: string[] = [];
    for (let i = 0; i < generatedPages.length; i++) {
      const page = generatedPages[i];
      if (!page.imageUrl) continue;

      try {
        // Convert base64 to blob
        const response = await fetch(page.imageUrl);
        const blob = await response.blob();

        const fileName = `${userId}/${Date.now()}-page-${page.pageNumber}.png`;

        const { error: uploadError } = await supabase.storage
          .from('generated-pages')
          .upload(fileName, blob, {
            contentType: 'image/png',
          });

        if (uploadError) {
          console.error('Page upload error:', uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('generated-pages')
          .getPublicUrl(fileName);

        pageUrls.push(urlData.publicUrl);
      } catch (error) {
        console.error('Error processing page image:', error);
      }
    }

    // 3. Generate and upload PDF
    let pdfUrl: string | null = null;
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter',
      });

      const pageWidth = 8.5;
      const pageHeight = 11;
      const margin = 0.5;
      const imageWidth = pageWidth - margin * 2;
      const imageHeight = pageHeight - margin * 2;

      // Add cover page
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      pdf.setFontSize(32);
      pdf.setFont('helvetica', 'bold');
      const title = `${characterName}'s Coloring Book`;
      const titleWidth = pdf.getTextWidth(title);
      pdf.text(title, (pageWidth - titleWidth) / 2, 3);
      
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'normal');
      const subtitle = `${generatedPages.length} Pages of Creative Fun!`;
      const subtitleWidth = pdf.getTextWidth(subtitle);
      pdf.text(subtitle, (pageWidth - subtitleWidth) / 2, 3.6);
      
      if (interests && interests.length > 0) {
        pdf.setFontSize(12);
        const interestsText = `Featuring: ${interests.slice(0, 3).join(', ')}`;
        const interestsWidth = pdf.getTextWidth(interestsText);
        pdf.text(interestsText, (pageWidth - interestsWidth) / 2, 4.3);
      }

      // Add coloring pages
      for (let i = 0; i < generatedPages.length; i++) {
        const page = generatedPages[i];
        if (!page.imageUrl) continue;

        pdf.addPage();

        pdf.addImage(
          page.imageUrl,
          'PNG',
          margin,
          margin,
          imageWidth,
          imageHeight,
          undefined,
          'FAST'
        );

        pdf.setFontSize(10);
        pdf.setTextColor(100);
        pdf.text(`Page ${i + 1} of ${generatedPages.length}`, pageWidth / 2, pageHeight - 0.25, {
          align: 'center',
        });
      }

      const pdfBlob = pdf.output('blob');
      const pdfFileName = `${userId}/${Date.now()}-${characterName}.pdf`;

      const { error: pdfUploadError } = await supabase.storage
        .from('pdfs')
        .upload(pdfFileName, pdfBlob, {
          contentType: 'application/pdf',
        });

      if (!pdfUploadError) {
        const { data: pdfUrlData } = supabase.storage
          .from('pdfs')
          .getPublicUrl(pdfFileName);

        pdfUrl = pdfUrlData.publicUrl;
      }
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
    }

    // 4. Save book metadata to database
    const { data, error } = await supabase
      .from('books')
      .insert({
        user_id: userId,
        character_name: characterName,
        interests,
        photo_urls: photoUrls,
        pdf_url: pdfUrl,
        pages: generatedPages.map((p, i) => ({
          pageNumber: p.pageNumber,
          imageUrl: pageUrls[i] || p.imageUrl,
          prompt: p.prompt,
        })),
        complexity,
        art_style: artStyle,
        consistent_characters: consistentCharacters,
        status: 'completed',
      })
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error saving book:', error);
    return null;
  }
}
