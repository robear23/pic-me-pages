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
  backCoverImageUrl?: string | null;
  selectedPageCount?: number;
  selectedBinding?: string;
  selectedPrice?: number;
  selectedPodPackageId?: string;
  reworkedPageNumbers?: number[];
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
      backCoverImageUrl,
      selectedPageCount,
      selectedBinding,
      selectedPrice,
      selectedPodPackageId,
      reworkedPageNumbers,
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

    // 2. Upload generated page images to storage and get URLs
    const uploadedPageUrls: string[] = [];
    for (let i = 0; i < generatedPages.length; i++) {
      const page = generatedPages[i];
      if (!page.imageUrl) {
        uploadedPageUrls.push('');
        continue;
      }

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
          uploadedPageUrls.push('');
        } else {
          // Get the public URL for the uploaded image
          const { data: urlData } = supabase.storage
            .from('generated-pages')
            .getPublicUrl(fileName);
          
          uploadedPageUrls.push(urlData.publicUrl);
        }
      } catch (error) {
        console.error('Error processing page image:', error);
        uploadedPageUrls.push('');
      }
    }

    // 3. Upload cover images if available
    let uploadedCoverUrl: string | null = null;
    let uploadedBackCoverUrl: string | null = null;
    
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
        console.error('Error uploading front cover:', error);
      }
    }

    if (backCoverImageUrl) {
      try {
        const response = await fetch(backCoverImageUrl);
        const blob = await response.blob();
        
        const backCoverFileName = `${userId}/${Date.now()}-back-cover.png`;
        
        const { error: backCoverUploadError } = await supabase.storage
          .from('generated-pages')
          .upload(backCoverFileName, blob, {
            contentType: 'image/png',
          });
        
        if (!backCoverUploadError) {
          const { data: backCoverUrlData } = supabase.storage
            .from('generated-pages')
            .getPublicUrl(backCoverFileName);
          
          uploadedBackCoverUrl = backCoverUrlData.publicUrl;
        }
      } catch (error) {
        console.error('Error uploading back cover:', error);
      }
    }

    // 4. Create or update book record
    let bookId: string;
    
    if (isUpdate && existingBookId) {
      // Update existing book - preserve covers if not regenerated
      console.log('Updating existing book:', existingBookId);
      
      // Fetch existing book to preserve covers if new ones weren't generated
      const { data: existingBook } = await supabase
        .from('books')
        .select('cover_image_url, back_cover_image_url')
        .eq('id', existingBookId)
        .single();
      
      const updateData: any = {
        pages: generatedPages.map((page, index) => ({
          pageNumber: page.pageNumber,
          imageUrl: uploadedPageUrls[index] || page.imageUrl || '',
          prompt: page.prompt,
        })),
        photo_urls: photoUrls.length > 0 ? photoUrls : undefined,
        updated_at: new Date().toISOString(),
        // Clear PDFs to force regeneration with new pages
        pdf_url: null,
        cover_url: null,
        status: 'processing', // Set back to processing while PDFs regenerate
      };
      
      // Only update covers if new ones were provided, otherwise preserve existing
      if (uploadedCoverUrl) {
        updateData.cover_image_url = uploadedCoverUrl;
      }
      if (uploadedBackCoverUrl) {
        updateData.back_cover_image_url = uploadedBackCoverUrl;
      }
      
      // Add reworked page numbers if provided
      if (reworkedPageNumbers !== undefined) {
        updateData.reworked_page_numbers = reworkedPageNumbers;
      }
      
      const { error: bookUpdateError } = await supabase
        .from('books')
        .update(updateData)
        .eq('id', existingBookId);

      if (bookUpdateError) {
        console.error('Book update error:', bookUpdateError);
        return null;
      }
      
      bookId = existingBookId;
      console.log('Updated book with ID:', bookId);
      
      // Use existing covers if new ones weren't provided
      if (!uploadedCoverUrl && existingBook?.cover_image_url) {
        uploadedCoverUrl = existingBook.cover_image_url;
      }
      if (!uploadedBackCoverUrl && existingBook?.back_cover_image_url) {
        uploadedBackCoverUrl = existingBook.back_cover_image_url;
      }
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
          pages: generatedPages.map((page, index) => ({
            pageNumber: page.pageNumber,
            imageUrl: uploadedPageUrls[index] || page.imageUrl || '',
            prompt: page.prompt,
          })),
          status: 'processing',
          selected_page_count: selectedPageCount,
          selected_binding_type: selectedBinding,
          selected_price: selectedPrice,
          selected_pod_package_id: selectedPodPackageId,
          reworked_page_numbers: reworkedPageNumbers || [],
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
        generatedPages.map((page, index) => ({ imageUrl: uploadedPageUrls[index] || page.imageUrl || '' })),
        { 
          pageCount: pdfPageCount, 
          padWith: 'blank',
          podPackageId: selectedPodPackageId  // Pass POD package ID for binding/color detection
        }
      );
      console.log('Interior PDF generated:', interiorPdfUrl);

      // Generate wrap cover PDF if we have cover images
      // Now uses separate front and back cover images
      if (uploadedCoverUrl && uploadedBackCoverUrl) {
        console.log('Generating Lulu-compliant wrap cover PDF with separate covers...');
        
        coverPdfUrl = await generateCoverWrapPdf(
          bookId,
          uploadedCoverUrl,
          uploadedBackCoverUrl,
          selectedPodPackageId
        );
        console.log('Wrap cover PDF generated:', coverPdfUrl);
      } else if (uploadedCoverUrl) {
        console.log('Generating Lulu-compliant wrap cover PDF (using front cover for both sides)...');
        
        coverPdfUrl = await generateCoverWrapPdf(
          bookId,
          uploadedCoverUrl,
          uploadedCoverUrl,  // Use front cover for back as fallback
          selectedPodPackageId
        );
        console.log('Wrap cover PDF generated:', coverPdfUrl);
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      
      // Mark book as failed instead of leaving it in processing
      await supabase
        .from('books')
        .update({ status: 'failed' })
        .eq('id', bookId);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown PDF generation error';
      // Re-throw the error so it bubbles up to GeneratingStep error handler
      throw new Error(`Failed to generate print-ready PDFs: ${errorMessage}. Please check that your images meet the requirements and try again.`);
    }

    // 6. Update book with PDF URLs and determine status
    const hasInteriorPdf = !!interiorPdfUrl;
    const hasFrontCover = !!uploadedCoverUrl;
    const hasBackCover = !!uploadedBackCoverUrl;
    const hasCoverPdf = !!coverPdfUrl;
    
    // Determine book status based on what we have
    let bookStatus: 'completed' | 'partial' | 'failed' = 'completed';
    let missingCovers = false;
    let missingComponents: string[] = [];
    
    if (!hasInteriorPdf) {
      // No interior PDF = truly failed
      bookStatus = 'failed';
    } else if (!hasFrontCover || !hasBackCover || !hasCoverPdf) {
      // Has interior but missing some/all covers = partial completion
      bookStatus = 'partial';
      missingCovers = true;
      
      // Track what's missing
      if (!hasFrontCover) missingComponents.push('front_cover');
      if (!hasBackCover) missingComponents.push('back_cover');
      if (!hasCoverPdf) missingComponents.push('cover_pdf');
      
      console.log(`⚠️ Book ${bookId} is PARTIAL - missing covers:`, missingComponents);
    } else {
      // Has everything = complete
      bookStatus = 'completed';
      missingCovers = false;
      missingComponents = [];
    }
    
    console.log(`Book ${bookId} status: ${bookStatus}`, {
      hasInteriorPdf,
      hasFrontCover,
      hasBackCover,
      hasCoverPdf,
      missingCovers,
      missingComponents,
    });
    
    const { error: updateError } = await supabase
      .from('books')
      .update({
        cover_url: coverPdfUrl,
        cover_image_url: uploadedCoverUrl,
        back_cover_image_url: uploadedBackCoverUrl,
        pdf_url: interiorPdfUrl,
        status: bookStatus,
        missing_covers: missingCovers,
        missing_components: missingComponents,
        last_cover_attempt_at: missingCovers ? new Date().toISOString() : null,
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
