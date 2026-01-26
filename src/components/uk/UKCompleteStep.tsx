import { motion } from 'framer-motion';
import { Check, Download, Package, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useUKBookStore } from '@/store/ukBookStore';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/clientSafe';
import { UK_UPGRADE_PRICE, UK_UPGRADE_PRICE_ID } from '@/types/ukBookOptions';
import confetti from 'canvas-confetti';

export function UKCompleteStep() {
  const {
    selectedProduct,
    generatedBookId,
    ukOrderId,
    characters,
    shippingAddress,
    reset,
  } = useUKBookStore();

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);

  useEffect(() => {
    // Trigger confetti celebration
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    fetchOrderDetails();
  }, []);

  const fetchOrderDetails = async () => {
    if (!ukOrderId) return;

    const { data, error } = await supabase
      .from('orders_uk')
      .select('*')
      .eq('id', ukOrderId)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch order:', error);
      return;
    }

    if (data) {
      setOrderDetails(data);
      if (data.pdf_url) {
        setPdfUrl(data.pdf_url);
      }
    }
  };

  const handleDownloadPDF = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };

  const handleUpgrade = async () => {
    // TODO: Implement upgrade flow (Phase 9)
    alert('Upgrade flow coming soon!');
  };

  const handleCreateAnother = () => {
    reset();
    window.location.href = '/uk/create';
  };

  const isPDF = selectedProduct === 'pdf';
  const childName = characters[0]?.name || 'your child';

  return (
    <div className="container max-w-4xl mx-auto px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Success Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full mb-6"
          >
            <Check className="w-10 h-10 text-green-500" />
          </motion.div>

          <h1 className="text-4xl font-bold text-foreground mb-4">
            {isPDF ? 'Your Coloring Book is Ready!' : 'Order Confirmed!'}
          </h1>

          <p className="text-xl text-muted-foreground">
            18 pages of personalized coloring fun for {childName}
          </p>
        </div>

        {/* Order Details Card */}
        <Card className="p-8 mb-8">
          {isPDF ? (
            <>
              {/* PDF Download Section */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-4 text-foreground">
                  Download Your Book
                </h2>
                <p className="text-muted-foreground mb-6">
                  Your personalized coloring book is ready to download and print at home.
                </p>

                <Button
                  size="lg"
                  onClick={handleDownloadPDF}
                  disabled={!pdfUrl}
                  className="px-8"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download PDF
                </Button>

                <p className="text-sm text-muted-foreground mt-4">
                  We've also sent a copy to {orderDetails?.customer_email}
                </p>
              </div>

              {/* Printing Tips */}
              <div className="bg-muted/50 rounded-lg p-6 mb-6">
                <h3 className="font-semibold mb-3 text-foreground">Printing Tips:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Print on standard A4 paper (210mm × 297mm)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Use "Actual Size" or 100% scale (not "Fit to Page")</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Works with any home printer</span>
                  </li>
                </ul>
              </div>

              {/* Upgrade Section */}
              <div className="border-t pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg flex-shrink-0">
                    <Package className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2 text-foreground">
                      Want a Professionally Printed Version?
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Upgrade to a premium printed booklet delivered to your door for just £{UK_UPGRADE_PRICE.toFixed(2)} more.
                    </p>
                    <Button variant="outline" onClick={handleUpgrade}>
                      Upgrade to Printed Booklet - £{UK_UPGRADE_PRICE.toFixed(2)}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Booklet Order Section */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="default" className="text-sm">
                    Order #{orderDetails?.id?.slice(0, 8)}
                  </Badge>
                  <Badge variant="secondary">
                    {orderDetails?.product_type?.toUpperCase()}
                  </Badge>
                </div>

                <h2 className="text-2xl font-bold mb-4 text-foreground">
                  Your Book is Being Printed
                </h2>

                <div className="space-y-3 text-muted-foreground">
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-medium text-foreground">Child's Name:</span>
                    <span>{orderDetails?.child_name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-medium text-foreground">Pages:</span>
                    <span>18 coloring pages + covers</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-medium text-foreground">Format:</span>
                    <span>A4 Premium Print</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-medium text-foreground">Delivery:</span>
                    <span>5-7 business days</span>
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              {shippingAddress && (
                <div className="bg-muted/50 rounded-lg p-6 mb-6">
                  <h3 className="font-semibold mb-3 text-foreground">
                    Delivery Address:
                  </h3>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>{shippingAddress.name}</p>
                    <p>{shippingAddress.line1}</p>
                    {shippingAddress.line2 && <p>{shippingAddress.line2}</p>}
                    <p>{shippingAddress.city}, {shippingAddress.postcode}</p>
                    <p className="pt-2">{shippingAddress.phone}</p>
                  </div>
                </div>
              )}

              {/* What's Next */}
              <div className="border-t pt-6">
                <h3 className="font-semibold mb-4 text-foreground">What Happens Next:</h3>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-foreground">We're printing your book now</p>
                      <p className="text-sm text-muted-foreground">
                        Professional quality on premium paper
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Shipped via Royal Mail Tracked 48</p>
                      <p className="text-sm text-muted-foreground">
                        You'll receive tracking info by email
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Delivered to your door</p>
                      <p className="text-sm text-muted-foreground">
                        Expected in 5-7 business days
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={handleCreateAnother}
            className="px-8"
          >
            Create Another Book
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
