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
  coverImageUrl?: string | null;
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
      coverImageUrl,
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

    // 3. Upload cover image if available
    let uploadedCoverUrl: string | null = null;
    if (coverImageUrl) {
      try {
        const response = await fetch(coverImageUrl);
        const blob = await response.blob();
        
        const coverFileName = `${userId}/${Date.now()}-cover.png`;
        
        const { error: coverUploadError } = await supabase.storage
          .from('generated-pages')
          .upload(coverFileName, blob, {
            contentType: 'image/png',
          });
        
        if (!coverUploadError) {
          const { data: coverUrlData } = supabase.storage
            .from('generated-pages')
            .getPublicUrl(coverFileName);
          
          uploadedCoverUrl = coverUrlData.publicUrl;
        }
      } catch (error) {
        console.error('Error uploading cover:', error);
      }
    }

    // 4. Generate and upload PDFs (cover + interior)
    let coverPdfUrl: string | null = null;
    let interiorPdfUrl: string | null = null;
    
    try {
      // Generate Cover PDF
      if (uploadedCoverUrl) {
        const coverPdf = new jsPDF({
          orientation: 'portrait',
          unit: 'in',
          format: 'letter',
        });

        const pageWidth = 8.5;
        const pageHeight = 11;

        // Add cover image edge-to-edge
        coverPdf.addImage(
          uploadedCoverUrl,
          'PNG',
          0,
          0,
          pageWidth,
          pageHeight,
          undefined,
          'FAST'
        );

        const coverPdfBlob = coverPdf.output('blob');
        const coverPdfFileName = `${userId}/${Date.now()}-${characterName}-cover.pdf`;

        const { error: coverPdfUploadError } = await supabase.storage
          .from('pdfs')
          .upload(coverPdfFileName, coverPdfBlob, {
            contentType: 'application/pdf',
          });

        if (!coverPdfUploadError) {
          const { data: coverPdfUrlData } = supabase.storage
            .from('pdfs')
            .getPublicUrl(coverPdfFileName);

          coverPdfUrl = coverPdfUrlData.publicUrl;
        }
      }

      // Generate Interior PDF
      const interiorPdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter',
      });
      
      const pageWidth = 8.5;
      const pageHeight = 11;
      const margin = 0.5;
      const imageWidth = pageWidth - margin * 2;
      const imageHeight = pageHeight - margin * 2;
      // Add title page
      interiorPdf.setFillColor(255, 255, 255);
      interiorPdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      interiorPdf.setFontSize(32);
      interiorPdf.setFont('helvetica', 'bold');
      const title = `${characterName}'s Coloring Book`;
      const titleWidth = interiorPdf.getTextWidth(title);
      interiorPdf.text(title, (pageWidth - titleWidth) / 2, 3);
      
      interiorPdf.setFontSize(16);
      interiorPdf.setFont('helvetica', 'normal');
      const subtitle = `${generatedPages.length} Pages of Creative Fun!`;
      const subtitleWidth = interiorPdf.getTextWidth(subtitle);
      interiorPdf.text(subtitle, (pageWidth - subtitleWidth) / 2, 3.6);
      
      if (interests && interests.length > 0) {
        interiorPdf.setFontSize(12);
        const interestsText = `Featuring: ${interests.slice(0, 3).join(', ')}`;
        const interestsWidth = interiorPdf.getTextWidth(interestsText);
        interiorPdf.text(interestsText, (pageWidth - interestsWidth) / 2, 4.3);
      }

      // Add coloring pages
      for (let i = 0; i < generatedPages.length; i++) {
        const page = generatedPages[i];
        if (!page.imageUrl) continue;

        interiorPdf.addPage();

        interiorPdf.addImage(
          page.imageUrl,
          'PNG',
          margin,
          margin,
          imageWidth,
          imageHeight,
          undefined,
          'FAST'
        );

        interiorPdf.setFontSize(10);
        interiorPdf.setTextColor(100);
        interiorPdf.text(`Page ${i + 1} of ${generatedPages.length}`, pageWidth / 2, pageHeight - 0.25, {
          align: 'center',
        });
      }

      const interiorPdfBlob = interiorPdf.output('blob');
      const interiorPdfFileName = `${userId}/${Date.now()}-${characterName}-interior.pdf`;

      const { error: interiorPdfUploadError } = await supabase.storage
        .from('pdfs')
        .upload(interiorPdfFileName, interiorPdfBlob, {
          contentType: 'application/pdf',
        });

      if (!interiorPdfUploadError) {
        const { data: interiorPdfUrlData } = supabase.storage
          .from('pdfs')
          .getPublicUrl(interiorPdfFileName);

        interiorPdfUrl = interiorPdfUrlData.publicUrl;
      }
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
    }

    // 5. Save book metadata to database
    // Use cover PDF for pdf_url (main download), and store interior separately
    const mainPdfUrl = coverPdfUrl || interiorPdfUrl;
    
    const { data, error } = await supabase
      .from('books')
      .insert({
        user_id: userId,
        character_name: characterName,
        interests,
        photo_urls: photoUrls,
        pdf_url: mainPdfUrl,
        cover_url: coverPdfUrl,
        pages: generatedPages.map((p, i) => ({
          pageNumber: p.pageNumber,
          imageUrl: pageUrls[i] || p.imageUrl,
          prompt: p.prompt,
          interiorPdfUrl: interiorPdfUrl, // Store interior PDF URL in pages metadata
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
