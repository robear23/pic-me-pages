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
    console.log('[uk-verify-payment] Starting payment verification');

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
      console.error('[uk-verify-payment] Auth error:', authError);
      throw new Error('User not authenticated');
    }

    console.log('[uk-verify-payment] Authenticated user:', user.id);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('Stripe secret key not configured');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { sessionId } = await req.json();

    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    console.log('[uk-verify-payment] Verifying session:', sessionId);

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // SECURITY: Verify the session belongs to the authenticated user
    const sessionUserId = session.metadata?.supabase_user_id;
    if (sessionUserId !== user.id) {
      console.error('[uk-verify-payment] User ID mismatch. Session:', sessionUserId, 'Auth:', user.id);
      throw new Error('Payment session does not belong to authenticated user');
    }

    // Verify the session is paid
    if (session.payment_status !== 'paid') {
      throw new Error('Payment not completed');
    }

    console.log('[uk-verify-payment] Payment verified, creating order');

    // Parse metadata
    const productType = session.metadata?.product_type as 'pdf' | 'booklet' | 'booklet_upgrade';
    const childName = session.metadata?.child_name || '';
    const interests = session.metadata?.interests ? JSON.parse(session.metadata.interests) : [];
    const customPrompt = session.metadata?.custom_prompt || null;
    const shippingAddress = session.metadata?.shipping_address ? JSON.parse(session.metadata.shipping_address) : null;
    const bookId = session.metadata?.book_id || null;

    // Create Supabase client with service role for order creation
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Check if payment has already been claimed
    const { data: existingOrder } = await supabaseAdmin
      .from('orders_uk')
      .select('id')
      .eq('stripe_payment_id', session.payment_intent as string)
      .maybeSingle();

    if (existingOrder) {
      console.log('[uk-verify-payment] Payment already claimed:', existingOrder.id);
      return new Response(
        JSON.stringify({ 
          success: true, 
          ukOrderId: existingOrder.id,
          message: 'Order already exists'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Determine initial status
    const initialStatus = productType === 'pdf' ? 'pending' : 'pending_fulfillment';

    // Create order in orders_uk table
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders_uk')
      .insert({
        user_id: user.id,
        book_id: bookId,
        product_type: productType,
        child_name: childName,
        selected_interests: interests,
        custom_prompt: customPrompt,
        amount_paid: session.amount_total! / 100, // Convert from pence to pounds
        currency: 'GBP',
        stripe_payment_id: session.payment_intent as string,
        customer_email: user.email || '',
        customer_name: session.customer_details?.name || '',
        shipping_address: shippingAddress,
        status: initialStatus
      })
      .select()
      .single();

    if (orderError) {
      console.error('[uk-verify-payment] Failed to create order:', orderError);
      throw orderError;
    }

    console.log('[uk-verify-payment] Order created:', order.id);

    // TODO: Send confirmation email (Phase 9)
    // await supabaseAdmin.functions.invoke('send-email', { ... })

    return new Response(
      JSON.stringify({ 
        success: true, 
        ukOrderId: order.id,
        productType: productType,
        amount: session.amount_total! / 100 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[uk-verify-payment] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
