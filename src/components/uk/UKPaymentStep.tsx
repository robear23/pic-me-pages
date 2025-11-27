import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useUKBookStore } from '@/store/ukBookStore';
import { UK_BOOK_OPTIONS } from '@/types/ukBookOptions';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

export function UKPaymentStep() {
  const {
    selectedProduct,
    characters,
    selectedInterests,
    customPrompt,
    complexityLevel,
    shippingAddress,
    setUKOrderId,
    setGeneratedBookId,
    setStep,
  } = useUKBookStore();

  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    // Check for payment callback
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (payment === 'success' && sessionId) {
      verifyPayment(sessionId);
    } else if (payment === 'cancelled') {
      toast({
        title: 'Payment Cancelled',
        description: 'You cancelled the payment. You can try again when ready.',
        variant: 'default',
      });
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const verifyPayment = async (sessionId: string) => {
    setIsVerifying(true);

    try {
      console.log('[UK Payment] Verifying payment session:', sessionId);

      const { data, error } = await supabase.functions.invoke('uk-verify-payment', {
        body: { sessionId }
      });

      if (error) {
        throw error;
      }

      if (data && data.success) {
        console.log('[UK Payment] Payment verified:', data);

        // Store order ID
        setUKOrderId(data.ukOrderId);

        toast({
          title: 'Payment Successful!',
          description: 'Starting book generation...',
        });

        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);

        // Proceed to generation
        setStep('uk-generating');
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (error: any) {
      console.error('[UK Payment] Verification error:', error);
      toast({
        title: 'Payment Verification Failed',
        description: error.message || 'Please contact support if payment was deducted.',
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCheckout = async () => {
    if (!selectedProduct) {
      toast({
        title: 'Product Not Selected',
        description: 'Please select a product first.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setPopupBlocked(false);

    try {
      const productOption = UK_BOOK_OPTIONS[selectedProduct];
      const characterName = characters[0]?.name;

      if (!characterName) {
        throw new Error('Character name is required');
      }

      console.log('[UK Payment] Creating checkout session');

      const { data, error } = await supabase.functions.invoke('uk-create-checkout', {
        body: {
          productType: selectedProduct,
          stripePriceId: productOption.stripePriceId,
          childName: characterName,
          interests: selectedInterests,
          customPrompt: customPrompt || null,
          shippingAddress: shippingAddress || null,
        }
      });

      if (error) {
        throw error;
      }

      if (!data || !data.url) {
        throw new Error('No checkout URL received');
      }

      console.log('[UK Payment] Opening checkout:', data.url);

      // Open in new tab
      const checkoutWindow = window.open(data.url, '_blank');

      if (!checkoutWindow || checkoutWindow.closed || typeof checkoutWindow.closed === 'undefined') {
        console.warn('[UK Payment] Popup was blocked');
        setPopupBlocked(true);
        // Fallback to same window
        window.location.href = data.url;
      } else {
        toast({
          title: 'Checkout Opened',
          description: 'Please complete payment in the new tab.',
        });
      }
    } catch (error: any) {
      console.error('[UK Payment] Checkout error:', error);
      toast({
        title: 'Checkout Failed',
        description: error.message || 'Failed to create checkout session',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 max-w-md w-full text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Verifying Payment...</h2>
          <p className="text-muted-foreground">Please wait while we confirm your payment.</p>
        </Card>
      </div>
    );
  }

  if (!selectedProduct) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No product selected. Please go back and select a product.
          </AlertDescription>
        </Alert>
        <Button onClick={() => setStep('uk-product-selection')} className="mt-4">
          Back to Product Selection
        </Button>
      </div>
    );
  }

  const productOption = UK_BOOK_OPTIONS[selectedProduct];
  const childName = characters[0]?.name || 'your child';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="container max-w-4xl mx-auto px-4 py-12"
    >
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          Complete Your Order
        </h1>
        <p className="text-xl text-muted-foreground">
          Secure payment powered by Stripe
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-8">
        {/* Order Summary */}
        <Card className="p-6">
          <h2 className="text-2xl font-bold mb-6 text-foreground">Order Summary</h2>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Product</p>
              <p className="font-semibold text-foreground">{productOption.name}</p>
              <Badge variant="secondary" className="mt-1">
                {productOption.badge}
              </Badge>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground mb-1">Child's Name</p>
              <p className="font-semibold text-foreground">{childName}</p>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground mb-1">Interests</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedInterests.map((interest) => (
                  <Badge key={interest} variant="outline">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>

            {shippingAddress && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Delivery Address</p>
                  <div className="text-sm space-y-1">
                    <p>{shippingAddress.name}</p>
                    <p>{shippingAddress.line1}</p>
                    {shippingAddress.line2 && <p>{shippingAddress.line2}</p>}
                    <p>{shippingAddress.city}, {shippingAddress.postcode}</p>
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="flex justify-between items-center pt-4">
              <span className="text-lg font-semibold text-foreground">Total</span>
              <span className="text-3xl font-bold text-primary">
                £{productOption.price.toFixed(2)}
              </span>
            </div>
          </div>
        </Card>

        {/* Payment Section */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-2xl font-bold mb-6 text-foreground">Payment</h2>

            <Button
              size="lg"
              className="w-full mb-4"
              onClick={handleCheckout}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5 mr-2" />
                  Pay with Stripe
                </>
              )}
            </Button>

            {popupBlocked && (
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Popup was blocked. Redirecting to checkout...
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <span>Secure payment powered by Stripe</span>
            </div>
          </Card>

          {/* What Happens Next */}
          <Card className="p-6 bg-muted/50">
            <h3 className="font-semibold mb-4 text-foreground">What Happens Next:</h3>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                  1
                </span>
                <span>Complete secure payment with Stripe</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                  2
                </span>
                <span>We'll generate 18 personalized coloring pages</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                  3
                </span>
                <span>
                  {selectedProduct === 'pdf'
                    ? 'Download your book instantly'
                    : 'Your book will be professionally printed and delivered'}
                </span>
              </li>
            </ol>
          </Card>
        </div>
      </div>

      {/* Back Button */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={() => setStep('uk-product-selection')}
          disabled={isProcessing}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Product Selection
        </Button>
      </div>
    </motion.div>
  );
}
