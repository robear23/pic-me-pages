import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createPrintOrder, ShippingAddress } from '@/lib/api';
import { Package, Book, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { generateCoverWrapPdf, repairBookPdf } from '@/lib/repairPdf';
import type { BindingType } from '@/types/bookOptions';

interface OrderPhysicalBookDialogProps {
  bookId: string;
  bookTitle: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function OrderPhysicalBookDialog({ 
  bookId, 
  bookTitle, 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange 
}: OrderPhysicalBookDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;
  const [loading, setLoading] = useState(false);
  const [bookDetails, setBookDetails] = useState<{
    pageCount: number;
    bindingType: BindingType;
    price: number;
  } | null>(null);
  const { toast } = useToast();
  
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    name: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    postalCode: '',
    phoneNumber: '',
    country: 'US',
  });

  // Fetch book details when dialog opens
  useEffect(() => {
    if (open && bookId) {
      const fetchBookDetails = async () => {
        const { data: book } = await supabase
          .from('books')
          .select('selected_page_count, selected_binding_type, selected_price')
          .eq('id', bookId)
          .single();
        
        if (book) {
          setBookDetails({
            pageCount: book.selected_page_count || 12,
            bindingType: (book.selected_binding_type as BindingType) || 'premium',
            price: book.selected_price || 24.99,
          });
        }
      };
      
      fetchBookDetails();
    }
  }, [open, bookId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // PDFs are now pre-generated during book creation, so just create the order
      const result = await createPrintOrder(bookId, shippingAddress);
      
      const envNote = result.environment === 'sandbox' 
        ? ' (Test order - no actual printing will occur)'
        : '';
      
      const shippingNote = result.shippingLevel && result.shippingLevel !== 'MAIL'
        ? ` Shipping via ${result.shippingLevel}.`
        : '';
      
      toast({
        title: 'Order Placed!',
        description: `Your physical copy of "${bookTitle}" is being printed and will be shipped soon.${envNote}${shippingNote}`,
      });
      
      setOpen(false);
      
      // Reset form
      setShippingAddress({
        name: '',
        street1: '',
        street2: '',
        city: '',
        state: '',
        postalCode: '',
        phoneNumber: '',
        country: 'US',
      });
    } catch (error: any) {
      console.error('Order error:', error);
      
      // Check if this is a validation error with specific details
      const isValidationError = error.message?.includes('validation failed') || 
                               error.message?.includes('not accessible') ||
                               error.message?.includes('not a PDF') ||
                               error.message?.includes('appears to be empty');
      
      const title = isValidationError ? 'Print File Validation Failed' : 'Order Failed';
      const suggestion = isValidationError 
        ? ' Try regenerating your book and ensure all pages are complete.'
        : ' Please try again or contact support if the issue persists.';
      
      toast({
        title,
        description: (error.message || 'Failed to place order.') + suggestion,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="gap-2 bg-black text-white hover:bg-black/90">
          <Package className="w-4 h-4" />
          Order Physical Book
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Order Physical Copy
            <Badge variant="outline" className="text-xs">
              Test Mode
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Order a professionally printed physical copy of "{bookTitle}".
            <br />
            <span className="text-xs text-muted-foreground">Note: Currently in test mode. No actual printing will occur.</span>
          </DialogDescription>
        </DialogHeader>
        
        {/* Book Specifications */}
        {bookDetails && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Book className="w-4 h-4 text-primary" />
              <h4 className="font-semibold text-sm">Book Specifications</h4>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pages:</span>
                <span className="font-medium">{bookDetails.pageCount} pages</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Binding:</span>
                <span className="font-medium flex items-center gap-1">
                  {bookDetails.bindingType === 'premium' ? (
                    <>
                      <Sparkles className="w-3 h-3 text-primary" />
                      Premium Coil Binding
                    </>
                  ) : (
                    'Standard Binding'
                  )}
                </span>
              </div>
              {bookDetails.bindingType === 'premium' && (
                <div className="text-xs text-muted-foreground italic pt-1">
                  ✨ Lays completely flat for easy coloring
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="text-muted-foreground">Price:</span>
                <span className="font-bold text-base">
                  ${bookDetails.price.toFixed(2)} + shipping
                </span>
              </div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={shippingAddress.name}
              onChange={(e) => setShippingAddress({ ...shippingAddress, name: e.target.value })}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              type="tel"
              value={shippingAddress.phoneNumber}
              onChange={(e) => setShippingAddress({ ...shippingAddress, phoneNumber: e.target.value })}
              placeholder="+44 1234 567890"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="street1">Street Address</Label>
            <Input
              id="street1"
              value={shippingAddress.street1}
              onChange={(e) => setShippingAddress({ ...shippingAddress, street1: e.target.value })}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="street2">Apartment, Suite, etc. (Optional)</Label>
            <Input
              id="street2"
              value={shippingAddress.street2}
              onChange={(e) => setShippingAddress({ ...shippingAddress, street2: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={shippingAddress.city}
                onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="state">State/Region/County</Label>
              <Input
                id="state"
                value={shippingAddress.state}
                onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                placeholder="CA (leave empty for non-US)"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                value={shippingAddress.postalCode}
                onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: e.target.value })}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="country">Country</Label>
              <Select
                value={shippingAddress.country}
                onValueChange={(value) => setShippingAddress({ ...shippingAddress, country: value })}
                required
              >
                <SelectTrigger id="country">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="AU">Australia</SelectItem>
                  <SelectItem value="DE">Germany</SelectItem>
                  <SelectItem value="FR">France</SelectItem>
                  <SelectItem value="ES">Spain</SelectItem>
                  <SelectItem value="IT">Italy</SelectItem>
                  <SelectItem value="NL">Netherlands</SelectItem>
                  <SelectItem value="BE">Belgium</SelectItem>
                  <SelectItem value="IE">Ireland</SelectItem>
                  <SelectItem value="CH">Switzerland</SelectItem>
                  <SelectItem value="AT">Austria</SelectItem>
                  <SelectItem value="SE">Sweden</SelectItem>
                  <SelectItem value="NO">Norway</SelectItem>
                  <SelectItem value="DK">Denmark</SelectItem>
                  <SelectItem value="FI">Finland</SelectItem>
                  <SelectItem value="PL">Poland</SelectItem>
                  <SelectItem value="PT">Portugal</SelectItem>
                  <SelectItem value="NZ">New Zealand</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Processing...' : 'Place Order - $19.99'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
