import { supabase } from '@/integrations/supabase/client';
import { repairBookPdf, generateCoverWrapPdf } from './repairPdf';

interface SaveBookParams {
  userId: string;
  characterName: string;
  interests: string[];
  consistentCharacters: boolean;
  characterPhotos: File[];
  generatedPages: Array<{ pageNumber: number; imageUrl: string; prompt: string }>;
  coverImageUrl?: string | null;
  selectedPageCount?: number;
  selectedBinding?: string;
  selectedPrice?: number;
  selectedPodPackageId?: string;
  bookId?: string | null; // Optional: if provided, update existing book instead of creating new
}

export async function saveBookToDatabase(params: SaveBookParams): Promise<string | null> {
  try {
    const {
      userId,
      characterName,
      interests,
      consistentCharacters,
      characterPhotos,
      generatedPages,
      coverImageUrl,
      selectedPageCount,
      selectedBinding,
      selectedPrice,
      selectedPodPackageId,
      bookId: existingBookId,
    } = params;
    
    // If bookId is provided, we're updating an existing book
    const isUpdate = !!existingBookId;

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
        }
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

    // 4. Create or update book record
    let bookId: string;
    
    if (isUpdate && existingBookId) {
      // Update existing book
      console.log('Updating existing book:', existingBookId);
      const { error: bookUpdateError } = await supabase
        .from('books')
        .update({
          pages: generatedPages.map(page => ({
            pageNumber: page.pageNumber,
            imageUrl: page.imageUrl || '',
            prompt: page.prompt,
          })),
          photo_urls: photoUrls.length > 0 ? photoUrls : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingBookId);

      if (bookUpdateError) {
        console.error('Book update error:', bookUpdateError);
        return null;
      }
      
      bookId = existingBookId;
      console.log('Updated book with ID:', bookId);
    } else {
      // Create new book
      const { data: bookData, error: bookInsertError } = await supabase
        .from('books')
        .insert({
          user_id: userId,
          character_name: characterName,
          interests,
          complexity: 'medium', // Default photogenic style
          art_style: 'photogenic',
          consistent_characters: consistentCharacters,
          photo_urls: photoUrls,
          pages: generatedPages.map(page => ({
            pageNumber: page.pageNumber,
            imageUrl: page.imageUrl || '',
            prompt: page.prompt,
          })),
          status: 'completed',
          selected_page_count: selectedPageCount,
          selected_binding_type: selectedBinding,
          selected_price: selectedPrice,
          selected_pod_package_id: selectedPodPackageId,
        })
        .select()
        .single();

      if (bookInsertError || !bookData) {
        console.error('Book insert error:', bookInsertError);
        return null;
      }

      bookId = bookData.id;
      console.log('Created book with ID:', bookId);
    }

    // 5. Generate Lulu-compliant PDFs using repair functions
    let coverPdfUrl: string | null = null;
    let interiorPdfUrl: string | null = null;
    
    try {
      // Generate interior PDF with selected page count (or default to generated pages)
      const pdfPageCount = selectedPageCount || Math.max(12, generatedPages.length);
      console.log(`Generating Lulu-compliant interior PDF with ${pdfPageCount} pages...`);
      interiorPdfUrl = await repairBookPdf(
        bookId,
        generatedPages.map(page => ({ imageUrl: page.imageUrl || '' })),
        { 
          pageCount: pdfPageCount, 
          padWith: 'blank',
          podPackageId: selectedPodPackageId  // Pass POD package ID for binding/color detection
        }
      );
      console.log('Interior PDF generated:', interiorPdfUrl);

      // Generate wrap cover PDF if we have a cover image
      // Use same image for both front and back for now (will be updated by generate-cover)
      if (uploadedCoverUrl) {
        console.log('Generating Lulu-compliant wrap cover PDF...');
        
        coverPdfUrl = await generateCoverWrapPdf(
          bookId,
          uploadedCoverUrl,
          uploadedCoverUrl,  // Use same for back cover for now
          selectedPodPackageId
        );
        console.log('Wrap cover PDF generated:', coverPdfUrl);
      }
    } catch (error) {
      console.error('PDF generation error:', error);
    }

    // 6. Update book with PDF URLs
    const { error: updateError } = await supabase
      .from('books')
      .update({
        cover_url: coverPdfUrl,
        cover_image_url: uploadedCoverUrl,
        pdf_url: interiorPdfUrl,
      })
      .eq('id', bookId);

    if (updateError) {
      console.error('Book update error:', updateError);
    }

    return bookId;
  } catch (error) {
    console.error('Error saving book to database:', error);
    return null;
  }
}
