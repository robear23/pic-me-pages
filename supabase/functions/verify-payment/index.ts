import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user first
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      throw new Error('User not authenticated');
    }

    console.log('Authenticated user:', user.id);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('Stripe secret key not configured');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { sessionId } = await req.json();

    console.log('Verifying payment session:', sessionId, 'for user:', user.id);

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // SECURITY: Verify the session belongs to the authenticated user
    const sessionUserId = session.metadata?.supabase_user_id;
    if (sessionUserId !== user.id) {
      console.error('User ID mismatch. Session user:', sessionUserId, 'Authenticated user:', user.id);
      throw new Error('Payment session does not belong to authenticated user');
    }

    // Verify the session is paid
    if (session.payment_status !== 'paid') {
      throw new Error('Payment not completed');
    }

    console.log('Payment verified, creating order...');

    // Extract shipping address from Stripe session
    const shippingDetails = session.shipping_details;
    let shippingAddress = null;

    if (shippingDetails?.address) {
      shippingAddress = {
        name: shippingDetails.name || '',
        street1: shippingDetails.address.line1 || '',
        street2: shippingDetails.address.line2 || '',
        city: shippingDetails.address.city || '',
        state: shippingDetails.address.state || '',
        postalCode: shippingDetails.address.postal_code || '',
        country: shippingDetails.address.country || 'US',
        phoneNumber: shippingDetails.phone || '',
      };
      console.log('Shipping address extracted from Stripe:', shippingAddress);
    }

    // Create Supabase client with service role for order creation
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Check if payment has already been claimed
    // The unique constraint on stripe_payment_id will prevent duplicates
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('stripe_payment_id', session.payment_intent as string)
      .maybeSingle();

    if (existingOrder) {
      console.log('Payment already claimed for order:', existingOrder.id);
      return new Response(
        JSON.stringify({ 
          success: true, 
          orderId: existingOrder.id,
          message: 'Order already exists'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Create order in database
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: user.id,
        order_type: 'digital_and_physical',
        price_paid: session.amount_total! / 100, // Convert from cents
        status: 'paid',
        stripe_payment_id: session.payment_intent as string,
        shipping_address: shippingAddress,
      })
      .select()
      .single();

    if (orderError) {
      console.error('Failed to create order:', orderError);
      throw orderError;
    }

    console.log('Order created:', order.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        orderId: order.id,
        amount: session.amount_total! / 100 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error verifying payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
