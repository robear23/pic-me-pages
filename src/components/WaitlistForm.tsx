import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2 } from 'lucide-react';

const waitlistSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  child_age: z.string().optional(),
});

type WaitlistFormData = z.infer<typeof waitlistSchema>;

export const WaitlistForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<WaitlistFormData>({
    resolver: zodResolver(waitlistSchema),
  });

  const childAge = watch('child_age');

  const onSubmit = async (data: WaitlistFormData) => {
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase.from('waitlist').insert({
        name: data.name,
        email: data.email,
        child_age: data.child_age ? parseInt(data.child_age) : null,
      });

      if (error) {
        if (error.code === '23505') {
          toast.error('This email is already on the waitlist!');
        } else {
          throw error;
        }
      } else {
        setIsSuccess(true);
        toast.success("You're on the list! We'll email you when we launch.");
      }
    } catch (error) {
      console.error('Waitlist signup error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card/40 backdrop-blur-lg border border-border rounded-2xl p-8 text-center"
      >
        <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-primary" />
        <h3 className="text-2xl font-bold mb-2">You're on the list!</h3>
        <p className="text-muted-foreground">
          We'll email you as soon as we launch. Get ready to create magical coloring books!
        </p>
      </motion.div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      onSubmit={handleSubmit(onSubmit)}
      className="bg-card/40 backdrop-blur-lg border border-border rounded-2xl p-8 max-w-md mx-auto"
    >
      <div className="space-y-5">
        <div>
          <Label htmlFor="name" className="text-base font-medium">
            Your Name
          </Label>
          <Input
            id="name"
            placeholder="Jane Smith"
            {...register('name')}
            className="mt-2 h-12 text-base"
            disabled={isSubmitting}
          />
          {errors.name && (
            <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="email" className="text-base font-medium">
            Email Address
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="jane@example.com"
            {...register('email')}
            className="mt-2 h-12 text-base"
            disabled={isSubmitting}
          />
          {errors.email && (
            <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="child_age" className="text-base font-medium">
            Child's Age (Optional)
          </Label>
          <Select
            value={childAge}
            onValueChange={(value) => setValue('child_age', value)}
            disabled={isSubmitting}
          >
            <SelectTrigger className="mt-2 h-12 text-base">
              <SelectValue placeholder="Select age..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 years old</SelectItem>
              <SelectItem value="4">4 years old</SelectItem>
              <SelectItem value="5">5 years old</SelectItem>
              <SelectItem value="6">6 years old</SelectItem>
              <SelectItem value="7">7 years old</SelectItem>
              <SelectItem value="8">8+ years old</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full h-12 text-base font-semibold"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Joining Waitlist...
            </>
          ) : (
            'Join the Waitlist'
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-4">
        We'll never share your email. Unsubscribe anytime.
      </p>
    </motion.form>
  );
};
