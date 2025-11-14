import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PrintOrderRequest {
  bookId: string;
  shippingAddress: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const luluApiKey = Deno.env.get('LULU_API_KEY')!;
    const luluApiSecret = Deno.env.get('LULU_API_SECRET')!;
    const luluEnvironment = Deno.env.get('LULU_ENVIRONMENT') || 'sandbox';
    
    const luluBaseUrl = luluEnvironment === 'production' 
      ? 'https://api.lulu.com'
      : 'https://api.sandbox.lulu.com';
    
    console.log(`Using Lulu ${luluEnvironment} environment: ${luluBaseUrl}`);
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { bookId, shippingAddress }: PrintOrderRequest = await req.json();

    console.log('Creating print order for book:', bookId);

    // Fetch book data
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .eq('user_id', user.id)
      .single();

    if (bookError || !book) {
      throw new Error('Book not found');
    }

    // Get cover and interior PDF URLs
    const coverUrl = book.cover_url || book.pdf_url;
    const interiorUrl = book.pages?.[0]?.interiorPdfUrl || book.pdf_url;
    
    if (!coverUrl || !interiorUrl) {
      throw new Error('Book PDFs not available');
    }
    
    console.log('Using cover URL:', coverUrl);
    console.log('Using interior URL:', interiorUrl);

    // Get Lulu access token
    const luluAuthResponse = await fetch(`${luluBaseUrl}/auth/realms/glasstree/protocol/openid-connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: luluApiKey,
        client_secret: luluApiSecret,
      }),
    });

    if (!luluAuthResponse.ok) {
      throw new Error('Failed to authenticate with Lulu');
    }

    const { access_token } = await luluAuthResponse.json();

    // Calculate page count (assuming each page is a coloring page + cover)
    const pageCount = book.pages?.length || 0;
    const totalPages = pageCount + 1; // +1 for cover page

    // Create print job with Lulu
    const luluOrderData = {
      line_items: [
        {
          page_count: totalPages,
          pod_package_id: 'PBKCSTD075', // Standard color paperback
          title: `${book.character_name}'s Coloring Book`,
          cover: coverUrl,
          interior: interiorUrl,
          quantity: 1,
        },
      ],
      shipping_address: {
        name: shippingAddress.name,
        street1: shippingAddress.street1,
        street2: shippingAddress.street2 || '',
        city: shippingAddress.city,
        state_code: shippingAddress.state,
        postcode: shippingAddress.postalCode,
        phone_number: shippingAddress.phoneNumber,
        country_code: shippingAddress.country,
      },
      contact_email: user.email,
      shipping_level: 'MAIL', // Valid options: MAIL, GROUND_HD, PRIORITY_MAIL
    };

    console.log('Creating Lulu order:', JSON.stringify(luluOrderData, null, 2));

    const luluOrderResponse = await fetch(`${luluBaseUrl}/print-jobs/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(luluOrderData),
    });

    if (!luluOrderResponse.ok) {
      const errorText = await luluOrderResponse.text();
      console.error('Lulu order error:', errorText);
      throw new Error(`Failed to create print order: ${errorText}`);
    }

    const luluOrder = await luluOrderResponse.json();
    console.log('Lulu order created:', luluOrder);

    // Calculate price (Lulu provides this in their response)
    const pricePaid = luluOrder.line_items?.[0]?.total_cost?.amount || 29.99;

    // Save order to database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        book_id: bookId,
        lulu_order_id: luluOrder.id,
        order_type: 'physical',
        status: 'processing',
        price_paid: pricePaid,
        shipping_address: shippingAddress,
      })
      .select()
      .single();

    if (orderError) {
      console.error('Database error:', orderError);
      throw new Error('Failed to save order');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        order,
        luluOrderId: luluOrder.id,
        environment: luluEnvironment,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error creating print order:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
