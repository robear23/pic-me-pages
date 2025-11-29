import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Book, Check, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UK_BOOK_OPTIONS, type UKProductType } from '@/types/ukBookOptions';
import { useUKBookStore } from '@/store/ukBookStore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAdmin } from '@/hooks/useAdmin';

// UK postcode validation regex (supports various formats)
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;

const shippingSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  line1: z.string()
    .trim()
    .min(1, 'Address is required')
    .max(200, 'Address must be less than 200 characters'),
  line2: z.string()
    .trim()
    .max(200, 'Address must be less than 200 characters')
    .optional()
    .default(''),
  city: z.string()
    .trim()
    .min(1, 'City is required')
    .max(100, 'City must be less than 100 characters'),
  postcode: z.string()
    .trim()
    .regex(UK_POSTCODE_REGEX, 'Invalid UK postcode')
    .transform(val => val.toUpperCase()),
  phone: z.string()
    .trim()
    .min(10, 'Phone number is required')
    .max(20, 'Phone number must be less than 20 characters'),
  email: z.string()
    .trim()
    .email('Invalid email address')
    .max(255, 'Email must be less than 255 characters'),
  specialInstructions: z.string()
    .trim()
    .max(500, 'Instructions must be less than 500 characters')
    .optional()
    .default('')
});

type ShippingFormData = z.infer<typeof shippingSchema>;

export function UKProductSelection() {
  const { 
    selectedProduct, 
    setSelectedProduct, 
    setShippingAddress, 
    setStep,
    selectedInterests,
    setSelectedInterests,
    customPrompt,
    setCustomPrompt
  } = useUKBookStore();
  const [showShippingForm, setShowShippingForm] = useState(false);
  const { isAdmin } = useAdmin();
  
  const form = useForm<ShippingFormData>({
    resolver: zodResolver(shippingSchema),
    defaultValues: {
      name: '',
      line1: '',
      line2: '',
      city: '',
      postcode: '',
      phone: '',
      email: '',
      specialInstructions: ''
    }
  });
  
  const handleProductSelect = (type: UKProductType) => {
    setSelectedProduct(type);
    setShowShippingForm(type === 'booklet');
    
    // Reset form when switching products
    if (type === 'pdf') {
      form.reset();
    }
  };
  
  const handleContinue = () => {
    if (selectedProduct === 'booklet') {
      form.handleSubmit((data) => {
        // Ensure all fields are present for ShippingAddress type
        const shippingData = {
          name: data.name,
          line1: data.line1,
          line2: data.line2 || '',
          city: data.city,
          postcode: data.postcode,
          phone: data.phone,
          email: data.email,
          specialInstructions: data.specialInstructions || ''
        };
        setShippingAddress(shippingData);
        setStep('uk-payment');
      })();
    } else {
      setShippingAddress(null);
      setStep('uk-payment');
    }
  };
  
  const canContinue = selectedProduct && (
    selectedProduct === 'pdf' || 
    (selectedProduct === 'booklet' && form.formState.isValid)
  );
  
  const handleAdminSkipPayment = () => {
    console.log('[ADMIN] Skipping payment and proceeding directly to generation');
    
    // If no interests and no custom prompt, add defaults for testing
    if (selectedInterests.length === 0 && !customPrompt) {
      console.log('[ADMIN] No interests/prompt set, adding default test data');
      setSelectedInterests(['adventure', 'magic']);
      setCustomPrompt('A fun test adventure');
    }
    
    setStep('uk-generating');
  };
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="container max-w-6xl mx-auto px-4 py-12"
    >
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Choose Your Format
        </h1>
      </div>
      
      {/* Product Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {Object.values(UK_BOOK_OPTIONS).map((option) => (
          <Card
            key={option.type}
            className={`relative cursor-pointer transition-all duration-300 hover:bg-gray-50 ${
              selectedProduct === option.type
                ? 'ring-4 ring-primary ring-offset-2 shadow-2xl scale-105'
                : 'hover:shadow-xl hover:scale-[1.02]'
            }`}
            onClick={() => handleProductSelect(option.type)}
          >
            {option.badge && (
              <Badge className="absolute -top-3 right-4 bg-amber-500 hover:bg-amber-600 text-white">
                {option.badge}
              </Badge>
            )}
            
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  {option.type === 'pdf' ? (
                    <Download className="w-8 h-8 text-primary" />
                  ) : (
                    <Book className="w-8 h-8 text-primary" />
                  )}
                </div>
                
                {selectedProduct === option.type && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="p-2 bg-primary rounded-full"
                  >
                    <Check className="w-5 h-5 text-primary-foreground" />
                  </motion.div>
                )}
              </div>
              
              <h3 className="text-2xl font-bold mb-2 text-gray-900">{option.name}</h3>
              <p className="text-3xl font-bold text-primary mb-2">
                £{option.price.toFixed(2)}
              </p>
              <p className="text-gray-600 mb-4">{option.description}</p>
              
              <ul className="space-y-2">
                {option.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </div>
      
      {/* Shipping Form (conditionally shown) */}
      <AnimatePresence>
        {showShippingForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <Card className="p-6 mb-8">
              <h3 className="text-2xl font-bold mb-6 text-gray-900">Shipping Address</h3>
              
              <form className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="name" className="text-gray-900">Full Name *</Label>
                  <Input 
                    id="name" 
                    {...form.register('name')}
                    className="mt-1"
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="line1" className="text-gray-900">Address Line 1 *</Label>
                  <Input 
                    id="line1" 
                    {...form.register('line1')}
                    className="mt-1"
                  />
                  {form.formState.errors.line1 && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.line1.message}
                    </p>
                  )}
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="line2" className="text-gray-900">Address Line 2</Label>
                  <Input 
                    id="line2" 
                    {...form.register('line2')}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="city" className="text-gray-900">City *</Label>
                  <Input 
                    id="city" 
                    {...form.register('city')}
                    className="mt-1"
                  />
                  {form.formState.errors.city && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.city.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="postcode" className="text-gray-900">Postcode *</Label>
                  <Input 
                    id="postcode" 
                    {...form.register('postcode')}
                    placeholder="SW1A 1AA"
                    className="mt-1"
                  />
                  {form.formState.errors.postcode && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.postcode.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="phone" className="text-gray-900">Phone Number *</Label>
                  <Input 
                    id="phone" 
                    type="tel"
                    {...form.register('phone')}
                    placeholder="07123 456789"
                    className="mt-1"
                  />
                  {form.formState.errors.phone && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="email" className="text-gray-900">Email *</Label>
                  <Input 
                    id="email" 
                    type="email"
                    {...form.register('email')}
                    className="mt-1"
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="specialInstructions" className="text-gray-900">
                    Special Delivery Instructions (Optional)
                  </Label>
                  <Textarea 
                    id="specialInstructions"
                    {...form.register('specialInstructions')}
                    rows={3}
                    placeholder="e.g., Leave with neighbor, Safe place instructions, etc."
                    className="mt-1"
                  />
                  {form.formState.errors.specialInstructions && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.specialInstructions.message}
                    </p>
                  )}
                </div>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Continue Button */}
      <div className="flex justify-center gap-4">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setStep('uk-interests')}
          className="px-8"
        >
          Back
        </Button>
        
        {isAdmin && (
          <Button
            variant="outline"
            size="lg"
            onClick={handleAdminSkipPayment}
            className="px-8 border-amber-500 text-amber-700 hover:bg-amber-50"
          >
            <Shield className="w-4 h-4 mr-2" />
            Skip Payment (Admin)
          </Button>
        )}
        
        <Button
          size="lg"
          disabled={!canContinue}
          onClick={handleContinue}
          className="px-12"
        >
          Continue to Checkout
        </Button>
      </div>
    </motion.div>
  );
}
