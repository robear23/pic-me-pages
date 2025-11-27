import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { generateCoverWrapPdf } from '@/lib/repairPdf';

export default function RegenerateCoverUtil() {
  const [bookId, setBookId] = useState('1093808a-48cb-4c14-ab9e-41a570d4e26a');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [bookData, setBookData] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (bookId) {
      loadBookData();
    }
  }, [bookId]);

  const loadBookData = async () => {
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (error) {
        console.error('Error loading book:', error);
        return;
      }

      setBookData(data);
    } catch (error) {
      console.error('Error loading book:', error);
    }
  };

  const handleRegenerate = async () => {
    if (!bookId.trim()) {
      toast.error('Please enter a book ID');
      return;
    }

    if (!bookData) {
      toast.error('Book not found. Please check the ID.');
      return;
    }

    if (!bookData.cover_image_url || !bookData.back_cover_image_url) {
      toast.error('Book is missing cover images. Use "Regenerate Cover" button in dashboard instead.');
      return;
    }

    setIsRegenerating(true);
    try {
      toast.info('Regenerating cover PDF with correct dimensions...');
      
      const pdfUrl = await generateCoverWrapPdf(
        bookId,
        bookData.cover_image_url,
        bookData.back_cover_image_url,
        bookData.selected_pod_package_id
      );

      toast.success(`Cover PDF regenerated successfully! New dimensions: 17.25" × 11.25"`);
      console.log('New cover PDF URL:', pdfUrl);
      
      // Reload book data to show updated info
      await loadBookData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to regenerate cover PDF');
      console.error('Regeneration error:', error);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Regenerate Book Cover PDF (Admin Utility)</CardTitle>
            <CardDescription>
              Force regeneration of cover wrap PDF for a specific book using the fixed dimensions.
              This will use existing cover images and create a new PDF with correct 17.25" × 11.25" dimensions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bookId">Book ID</Label>
              <Input
                id="bookId"
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                placeholder="Enter book ID"
              />
            </div>

            {bookData && (
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                <p className="font-semibold">Book Info:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li><strong>Name:</strong> {bookData.character_name}'s Coloring Book</li>
                  <li><strong>Status:</strong> {bookData.status}</li>
                  <li><strong>Has Front Cover:</strong> {bookData.cover_image_url ? '✓' : '✗'}</li>
                  <li><strong>Has Back Cover:</strong> {bookData.back_cover_image_url ? '✓' : '✗'}</li>
                  <li><strong>Current Cover PDF:</strong> {bookData.cover_url ? '✓' : '✗'}</li>
                  <li><strong>POD Package:</strong> {bookData.selected_pod_package_id || 'Not selected'}</li>
                </ul>
              </div>
            )}

            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
              <p className="font-semibold">What this does:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Uses existing front and back cover images</li>
                <li>Creates new cover wrap PDF with correct dimensions (17.25" × 11.25")</li>
                <li>Fixes the jsPDF format parameter order bug</li>
                <li>Updates the book record with new PDF URL</li>
                <li><strong>Note:</strong> If cover images are missing, use the dashboard button instead</li>
              </ul>
            </div>

            <Button
              onClick={handleRegenerate}
              disabled={isRegenerating || !bookData}
              className="w-full"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
              {isRegenerating ? 'Regenerating PDF...' : 'Regenerate Cover PDF'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
