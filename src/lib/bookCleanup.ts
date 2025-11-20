import { supabase } from '@/integrations/supabase/client';

export interface CleanupResult {
  duplicatesFound: number;
  incompleteFound: number;
  duplicatesDeleted: number;
  incompleteDeleted: number;
  retryCreditsGranted: number;
  errors: string[];
}

/**
 * Find duplicate books for a user (same character, interests, created within 1 hour)
 */
export async function findDuplicateBooks(userId: string) {
  const { data: books, error } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !books) {
    console.error('Error fetching books:', error);
    return [];
  }

  const duplicateGroups: Record<string, any[]> = {};
  
  books.forEach(book => {
    const key = `${book.character_name}-${book.interests.join(',')}-${book.selected_page_count}`;
    if (!duplicateGroups[key]) {
      duplicateGroups[key] = [];
    }
    duplicateGroups[key].push(book);
  });

  // Return groups with more than one book created within 1 hour of each other
  return Object.values(duplicateGroups).filter(group => {
    if (group.length <= 1) return false;
    
    // Check if books were created within 1 hour of each other
    const times = group.map(b => new Date(b.created_at!).getTime());
    const maxDiff = Math.max(...times) - Math.min(...times);
    return maxDiff < 60 * 60 * 1000; // 1 hour in milliseconds
  });
}

/**
 * Find incomplete books (missing PDFs or covers, or status is processing/failed)
 */
export async function findIncompleteBooks(userId: string) {
  const { data: books, error } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', userId);

  if (error || !books) {
    console.error('Error fetching books:', error);
    return [];
  }

  return books.filter(book => 
    book.status === 'processing' ||
    book.status === 'failed' ||
    book.status === 'partial' ||
    !book.pdf_url ||
    !book.cover_image_url ||
    !book.back_cover_image_url
  );
}

/**
 * Clean up duplicate books - keeps the most complete/recent one
 */
export async function cleanupDuplicates(userId: string): Promise<CleanupResult> {
  const result: CleanupResult = {
    duplicatesFound: 0,
    incompleteFound: 0,
    duplicatesDeleted: 0,
    incompleteDeleted: 0,
    retryCreditsGranted: 0,
    errors: [],
  };

  const duplicateGroups = await findDuplicateBooks(userId);
  result.duplicatesFound = duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);

  for (const group of duplicateGroups) {
    // Sort by completeness and recency
    const sorted = group.sort((a, b) => {
      // Prefer completed over partial over processing/failed
      const statusOrder = { completed: 3, partial: 2, processing: 1, failed: 0 };
      const aScore = (statusOrder[a.status as keyof typeof statusOrder] || 0);
      const bScore = (statusOrder[b.status as keyof typeof statusOrder] || 0);
      
      if (aScore !== bScore) return bScore - aScore;
      
      // Then by recency
      return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime();
    });

    // Keep the first (best) one, delete the rest
    const toKeep = sorted[0];
    const toDelete = sorted.slice(1);

    console.log(`Keeping book ${toKeep.id}, deleting ${toDelete.length} duplicates`);

    for (const book of toDelete) {
      try {
        const { error } = await supabase
          .from('books')
          .delete()
          .eq('id', book.id);

        if (error) {
          result.errors.push(`Failed to delete duplicate ${book.id}: ${error.message}`);
        } else {
          result.duplicatesDeleted++;
        }
      } catch (err) {
        result.errors.push(`Error deleting duplicate ${book.id}: ${err}`);
      }
    }
  }

  return result;
}

/**
 * Clean up incomplete books and grant retry credits for system failures
 */
export async function cleanupIncomplete(userId: string, grantRetryCredits = true): Promise<CleanupResult> {
  const result: CleanupResult = {
    duplicatesFound: 0,
    incompleteFound: 0,
    duplicatesDeleted: 0,
    incompleteDeleted: 0,
    retryCreditsGranted: 0,
    errors: [],
  };

  const incompleteBooks = await findIncompleteBooks(userId);
  result.incompleteFound = incompleteBooks.length;

  for (const book of incompleteBooks) {
    try {
      // Grant retry credit if this looks like a system failure
      const isSystemFailure = book.status === 'partial' || 
                             (book.status === 'failed' && !book.pdf_url);
      
      if (grantRetryCredits && isSystemFailure) {
        const { error: creditError } = await supabase
          .from('retry_credits')
          .insert({
            user_id: userId,
            book_id: book.id,
            reason: `System failure during generation - ${book.status} status`,
          });

        if (!creditError) {
          result.retryCreditsGranted++;
        } else {
          result.errors.push(`Failed to grant credit for book ${book.id}: ${creditError.message}`);
        }
      }

      // Delete the incomplete book
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', book.id);

      if (error) {
        result.errors.push(`Failed to delete incomplete book ${book.id}: ${error.message}`);
      } else {
        result.incompleteDeleted++;
      }
    } catch (err) {
      result.errors.push(`Error processing incomplete book ${book.id}: ${err}`);
    }
  }

  return result;
}

/**
 * Comprehensive cleanup - both duplicates and incomplete books
 */
export async function performComprehensiveCleanup(userId: string): Promise<CleanupResult> {
  const duplicateResult = await cleanupDuplicates(userId);
  const incompleteResult = await cleanupIncomplete(userId, true);

  return {
    duplicatesFound: duplicateResult.duplicatesFound,
    incompleteFound: incompleteResult.incompleteFound,
    duplicatesDeleted: duplicateResult.duplicatesDeleted,
    incompleteDeleted: incompleteResult.incompleteDeleted,
    retryCreditsGranted: incompleteResult.retryCreditsGranted,
    errors: [...duplicateResult.errors, ...incompleteResult.errors],
  };
}
