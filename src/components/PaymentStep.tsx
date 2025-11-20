import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useBookStore } from '@/store/bookStore';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ArrowLeft, CreditCard, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const PaymentStep = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const { 
    getSelectedBookOption,
    selectedPageCount,
    selectedBinding,
    selectedPrice,
    setStep,
    setPaymentBypassed,
    setOrderId
  } = useBookStore();

  const [loading, setLoading] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [showBypassDialog, setShowBypassDialog] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [stripeCheckoutUrl, setStripeCheckoutUrl] = useState<string | null>(null);

  const bookOption = getSelectedBookOption();
  const isPdfOnly = bookOption?.isPdfOnly || selectedBinding === 'pdf';

  // Handle payment success on mount
  useEffect(() => {
    const handlePaymentSuccess = async () => {
      const paymentStatus = searchParams.get('payment');
      const sessionId = searchParams.get('session_id');

      if (paymentStatus === 'success' && sessionId && user) {
        setVerifyingPayment(true);
        try {
          console.log('Verifying payment for session:', sessionId);

          // Call edge function to verify payment and create order
          const { data, error } = await supabase.functions.invoke('verify-payment', {
            body: { sessionId, userId: user.id }
          });

          if (error) throw error;

          if (data?.orderId) {
            setOrderId(data.orderId);
            setPaymentBypassed(false);

            toast({
              title: 'Payment Successful! 🎉',
              description: `Payment of $${data.amount.toFixed(2)} received. Starting generation...`,
            });

            // Clear URL parameters
            setSearchParams({});

            // Navigate to generating step
            setTimeout(() => {
              setStep('generating');
            }, 1000);
          }
        } catch (error) {
          console.error('Payment verification error:', error);
          toast({
            title: 'Payment Verification Failed',
            description: 'Please contact support if you were charged.',
            variant: 'destructive',
          });
          setSearchParams({});
        } finally {
          setVerifyingPayment(false);
        }
      } else if (paymentStatus === 'cancelled') {
        toast({
          title: 'Payment Cancelled',
          description: 'You can try again when ready.',
        });
        setSearchParams({});
      }
    };

    handlePaymentSuccess();
  }, [searchParams, user]);

  const handleStripeCheckout = async () => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to continue with payment',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Call edge function to create Stripe checkout session
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          pageCount: selectedPageCount,
          binding: selectedBinding,
          price: selectedPrice,
          userId: user.id,
        }
      });

      if (error) throw error;

      console.log('Opening Stripe checkout in new tab...');
      
      // Open Stripe in new tab
      const stripeWindow = window.open(data.url, '_blank');
      
      // Check if popup was blocked
      if (!stripeWindow || stripeWindow.closed || typeof stripeWindow.closed === 'undefined') {
        // Popup blocked - show manual link
        toast({
          title: 'Popup Blocked',
          description: 'Please allow popups and click the button below to open Stripe checkout',
          variant: 'destructive',
        });
        setStripeCheckoutUrl(data.url);
      } else {
        // Popup opened successfully
        toast({
          title: 'Checkout Opened',
          description: 'Complete your payment in the new tab. This page will update automatically.',
        });
        setWaitingForPayment(true);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: 'Payment Error',
        description: 'Failed to initiate checkout. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminBypass = async () => {
    if (!user || !isAdmin) return;

    setLoading(true);
    try {
      // Create test order in database
      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          order_type: 'test_mode',
          price_paid: 0,
          status: 'test',
        })
        .select()
        .single();

      if (error) throw error;

      // Set flags in store
      setPaymentBypassed(true);
      setOrderId(order.id);

      toast({
        title: '🧪 Test Mode Activated',
        description: 'Payment bypassed for testing. Proceeding to generation.',
      });

      // Navigate to generating step
      setStep('generating');
    } catch (error) {
      console.error('Bypass error:', error);
      toast({
        title: 'Error',
        description: 'Failed to create test order. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setShowBypassDialog(false);
    }
  };

  const handleBack = () => {
    setStep('book-options');
  };

  // Show loading state while verifying payment
  if (verifyingPayment) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <h2 className="text-2xl font-bold">Verifying Payment...</h2>
          <p className="text-muted-foreground">Please wait while we confirm your payment</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full px-4 py-8 md:py-12 lg:py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent"
          >
            Complete Your Purchase
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-lg text-muted-foreground"
          >
            Secure payment to create your personalized coloring book
          </motion.p>
        </div>

        {/* Order Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
              <CardDescription>
                {isPdfOnly 
                  ? 'Your instant PDF download details'
                  : 'Your personalized coloring book details'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Pages</span>
                <span className="font-semibold">{selectedPageCount} pages</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Binding</span>
                <span className="font-semibold capitalize">{selectedBinding}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Book Type</span>
                <span className="font-semibold">{bookOption.name}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Includes</span>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-sm font-medium">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Digital PDF Download</span>
                  </div>
                  {!isPdfOnly && (
                    <>
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Check className="h-4 w-4 text-green-500" />
                        <span>Physical Book Printing</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Check className="h-4 w-4 text-green-500" />
                        <span>Free Shipping</span>
                      </div>
                    </>
                  )}
                  {isPdfOnly && (
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>Instant Download</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center py-4 text-xl font-bold">
                <span>Total</span>
                <span className="text-primary">${selectedPrice.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Payment Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-4"
        >
          <Button
            onClick={handleStripeCheckout}
            disabled={loading || waitingForPayment}
            size="lg"
            className="w-full text-lg h-14"
          >
            {loading ? (
              <>Processing...</>
            ) : waitingForPayment ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Waiting for payment...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-5 w-5" />
                Pay ${selectedPrice.toFixed(2)} with Stripe
              </>
            )}
          </Button>

          {/* Waiting for payment message */}
          {waitingForPayment && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  Complete your payment in the new tab. This page will automatically update when your payment is complete.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Manual link for popup blocked */}
          {stripeCheckoutUrl && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800 dark:text-orange-200">
                  <div className="space-y-2">
                    <p className="font-semibold">Popup Blocked</p>
                    <p className="text-sm">
                      Your browser blocked the checkout popup. Click below to open Stripe checkout:
                    </p>
                    <Button
                      onClick={() => {
                        window.open(stripeCheckoutUrl, '_blank');
                        setWaitingForPayment(true);
                        setStripeCheckoutUrl(null);
                      }}
                      variant="outline"
                      className="w-full mt-2 border-orange-500 hover:bg-orange-100"
                    >
                      Open Stripe Checkout
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Admin Bypass Section */}
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <div className="space-y-2">
                    <p className="font-semibold">🔧 Admin Testing Mode</p>
                    <p className="text-sm">
                      You can bypass payment to test book generation. This creates a test order with $0 payment.
                    </p>
                    <Button
                      onClick={() => setShowBypassDialog(true)}
                      disabled={loading}
                      variant="outline"
                      className="w-full mt-2 border-amber-500 hover:bg-amber-100"
                    >
                      Skip Payment (Testing Only)
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Back Button */}
          <Button
            onClick={handleBack}
            variant="ghost"
            size="lg"
            className="w-full"
            disabled={loading}
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Back to Options
          </Button>
        </motion.div>

        {/* Security Badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center mt-8 text-sm text-muted-foreground"
        >
          <p>🔒 Secure payment powered by Stripe</p>
          <p className="mt-1">Your payment information is encrypted and secure</p>
        </motion.div>
      </motion.div>

      {/* Bypass Confirmation Dialog */}
      <AlertDialog open={showBypassDialog} onOpenChange={setShowBypassDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bypass Payment for Testing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a test order with $0 payment and proceed directly to book generation.
              This should only be used for development and testing purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAdminBypass} disabled={loading}>
              {loading ? 'Creating...' : 'Confirm Bypass'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
