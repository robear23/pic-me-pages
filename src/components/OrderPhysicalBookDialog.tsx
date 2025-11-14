import { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { createPrintOrder, ShippingAddress } from '@/lib/api';
import { Package } from 'lucide-react';

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
  const { toast } = useToast();
  
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    name: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await createPrintOrder(bookId, shippingAddress);
      
      const envNote = result.environment === 'sandbox' 
        ? ' (Test order - no actual printing will occur)'
        : '';
      
      toast({
        title: 'Order Placed!',
        description: `Your physical copy of "${bookTitle}" is being printed and will be shipped soon.${envNote}`,
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
        country: 'US',
      });
    } catch (error: any) {
      toast({
        title: 'Order Failed',
        description: error.message || 'Failed to create print order. Please try again.',
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
            Price: $29.99 + shipping
            <br />
            <span className="text-xs text-muted-foreground">Note: Currently in test mode. No actual printing will occur.</span>
          </DialogDescription>
        </DialogHeader>
        
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
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={shippingAddress.state}
                onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                placeholder="CA"
                required
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
              <Input
                id="country"
                value={shippingAddress.country}
                onChange={(e) => setShippingAddress({ ...shippingAddress, country: e.target.value })}
                placeholder="US"
                required
              />
            </div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Processing...' : 'Place Order - $29.99'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
