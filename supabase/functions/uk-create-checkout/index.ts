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
    console.log('[uk-create-checkout] Starting checkout session creation');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user || !user.email) {
      console.error('[uk-create-checkout] Auth error:', authError);
      throw new Error('User not authenticated or email not available');
    }

    console.log('[uk-create-checkout] Authenticated user:', user.id);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('Stripe secret key not configured');
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const requestBody = await req.json();
    const { 
      productType, 
      stripePriceId, 
      childName, 
      interests,
      customPrompt,
      shippingAddress,
      bookId
    } = requestBody;

    // Validation
    if (!productType || !stripePriceId || !childName) {
      throw new Error('Missing required checkout parameters');
    }

    console.log('[uk-create-checkout] Creating session for:', { 
      productType, 
      childName, 
      userId: user.id,
      bookId
    });

    // Create or retrieve Stripe customer
    const customers = await stripe.customers.list({ 
      email: user.email,
      limit: 1 
    });
    let customerId = customers.data[0]?.id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;
      console.log('[uk-create-checkout] Created new Stripe customer:', customerId);
    } else {
      console.log('[uk-create-checkout] Using existing customer:', customerId);
    }

    // Build metadata
    const metadata: Record<string, string> = {
      supabase_user_id: user.id,
      product_type: productType,
      child_name: childName,
      uk_system: 'true',
      interests: interests ? JSON.stringify(interests) : '',
      custom_prompt: customPrompt || '',
    };

    // Add bookId if provided (for existing books)
    if (bookId) {
      metadata.book_id = bookId;
    }

    // Add shipping address for booklet orders
    if (productType === 'booklet' && shippingAddress) {
      metadata.shipping_address = JSON.stringify(shippingAddress);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/uk/create?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/uk/create?payment=cancelled`,
      metadata,
    });

    console.log('[uk-create-checkout] Session created:', session.id);

    return new Response(
      JSON.stringify({ url: session.url }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[uk-create-checkout] Error:', error);
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
