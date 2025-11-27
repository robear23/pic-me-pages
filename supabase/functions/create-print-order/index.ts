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
    phoneNumber: string;
    country: string;
  };
}


async function validatePdfAccessibility(url: string, type: 'cover' | 'interior'): Promise<void> {
  console.log(`Validating ${type} PDF accessibility:`, url);
  
  const response = await fetch(url, { method: 'HEAD' });
  
  if (!response.ok) {
    throw new Error(`${type} PDF not accessible (HTTP ${response.status})`);
  }
  
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/pdf')) {
    throw new Error(`${type} file is not a PDF (Content-Type: ${contentType})`);
  }
  
  const contentLength = response.headers.get('content-length');
  if (!contentLength || parseInt(contentLength) === 0) {
    throw new Error(`${type} PDF appears to be empty`);
  }
  
  console.log(`✓ ${type} PDF validated: ${contentLength} bytes`);
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
    
    // Check if user has already paid for this book
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, stripe_payment_id, price_paid, book_id')
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .not('stripe_payment_id', 'is', null)
      .is('lulu_order_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOrder?.stripe_payment_id) {
      console.log('Found existing paid order:', existingOrder.id, '- will link to Lulu order');
    }

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
    const coverUrl = book.cover_url;
    const interiorUrl = book.pdf_url;
    
    // Use book's selected POD package ID if available, otherwise fall back to environment variable
    const selectedPodPackageId = book.selected_pod_package_id || Deno.env.get('LULU_POD_PACKAGE_ID') || '0850X1100BWSTDSS060UW444MXX';
    console.log('Using POD Package ID:', selectedPodPackageId, book.selected_pod_package_id ? '(from book)' : '(from env/default)');
    
    if (!coverUrl) {
      throw new Error('Missing cover PDF. Please regenerate the book.');
    }
    
    if (!interiorUrl) {
      throw new Error('Missing interior PDF. Please regenerate the book.');
    }
    
    console.log('Using cover URL:', coverUrl);
    console.log('Using interior URL:', interiorUrl);

    // Preflight: Validate PDF accessibility
    await validatePdfAccessibility(coverUrl, 'cover');
    await validatePdfAccessibility(interiorUrl, 'interior');

    // Import validation from shared config
    const { getBindingType, validatePageCount } = await import('../_shared/luluConfig.ts');

    // Determine binding type from POD package ID
    const bindingType = getBindingType(selectedPodPackageId);
    console.log(`Binding type: ${bindingType}`);

    // Get Lulu access token
    console.log('Authenticating with Lulu...');
    console.log('Using credentials:', {
      hasApiKey: !!luluApiKey,
      apiKeyLength: luluApiKey?.length || 0,
      hasApiSecret: !!luluApiSecret,
      apiSecretLength: luluApiSecret?.length || 0,
      environment: luluEnvironment,
    });
    
    const luluAuthResponse = await fetch(`${luluBaseUrl}/auth/realms/glasstree/protocol/openid-connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${luluApiKey}:${luluApiSecret}`)}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!luluAuthResponse.ok) {
      const errorText = await luluAuthResponse.text();
      console.error('Lulu authentication failed:');
      console.error('Status:', luluAuthResponse.status);
      console.error('Response:', errorText);
      
      let errorMessage = 'Failed to authenticate with Lulu';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error_description || errorJson.error || errorMessage;
      } catch {
        // Not JSON, use raw text if it's short enough
        if (errorText.length < 200) {
          errorMessage += `: ${errorText}`;
        }
      }
      
      throw new Error(`${errorMessage}. Please check your Lulu API credentials in Settings.`);
    }

    const { access_token } = await luluAuthResponse.json();
    console.log('✓ Successfully authenticated with Lulu');

    // Get page count from book's selected_page_count or calculate from pages array
    let interiorPageCount = book.selected_page_count || (Array.isArray(book.pages) ? book.pages.length : 12);
    
    // Validate and adjust page count based on binding type
    const validation = validatePageCount(interiorPageCount, bindingType);
    
    if (!validation.valid) {
      console.warn(validation.message);
      interiorPageCount = validation.adjustedCount;
    }
    
    console.log(`Final interior page count: ${interiorPageCount} (${bindingType} binding compliant)`);
    console.log('POD Package ID:', selectedPodPackageId);
    
    console.log('Note: Lulu validates files automatically during print job creation');

    // Determine shipping level - use basic MAIL for sandbox, more options for production
    let defaultShippingLevel = 'MAIL';
    if (luluEnvironment === 'production') {
      defaultShippingLevel = shippingAddress.country === 'US' ? 'MAIL' : 'PRIORITY_MAIL';
    }
    const shippingLevel = Deno.env.get('LULU_SHIPPING_LEVEL') || defaultShippingLevel;
    
    console.log(`Shipping level: ${shippingLevel} (country: ${shippingAddress.country}, env: ${luluEnvironment})`);
    
    const luluOrderData = {
      external_id: `order-${bookId.substring(0, 8)}`,
      line_items: [
        {
          external_id: `item-${bookId.substring(0, 8)}`,
          pod_package_id: selectedPodPackageId,
          quantity: 1,
          interior: {
            source_url: interiorUrl,
          },
          cover: {
            source_url: coverUrl,
          },
        },
      ],
      shipping_address: {
        name: shippingAddress.name,
        street1: shippingAddress.street1,
        street2: shippingAddress.street2 || '',
        city: shippingAddress.city,
        state_code: shippingAddress.country === 'US' ? shippingAddress.state : '',
        postcode: shippingAddress.postalCode,
        phone_number: shippingAddress.phoneNumber,
        country_code: shippingAddress.country,
      },
      contact_email: user.email,
      shipping_level: shippingLevel,
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
      console.error('Lulu API Error Response:', errorText);
      console.error('Status:', luluOrderResponse.status);
      
      // Check if Lulu returned HTML error page (indicates invalid product ID)
      const isHtmlError = errorText.trim().toLowerCase().startsWith('<!doctype') || 
                          errorText.trim().toLowerCase().startsWith('<html');
      
      if (isHtmlError) {
        console.error('Lulu returned HTML error page - invalid POD package ID:', selectedPodPackageId);
        
        // Suggest standard saddle stitch as fallback (verified working ID)
        const fallbackId = '0850X1100BWSTDSS060UW444MXX';
        
        return new Response(
          JSON.stringify({ 
            error: `Invalid product ID: "${selectedPodPackageId}" is not recognized by Lulu API. This typically means:\n\n` +
                   `1. The product code doesn't exist in Lulu's catalog\n` +
                   `2. Your credentials (${luluEnvironment}) don't support this product\n` +
                   `3. Saddle stitch/coil bindings require different product codes\n\n` +
                   `Please contact Lulu support to get valid POD package IDs for:\n` +
                   `- 8.5" x 11" Saddle Stitch binding\n` +
                   `- 8.5" x 11" Coil binding\n\n` +
                   `Or try standard paperback (${fallbackId}) as a temporary workaround.`,
            validationError: true,
            productNotSupported: true,
            podPackageId: selectedPodPackageId,
            environment: luluEnvironment,
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 422,
          }
        );
      }
      
      // Parse validation errors from 4xx responses
      if (luluOrderResponse.status >= 400 && luluOrderResponse.status < 500) {
        let errorMessage = `Print order failed (${luluOrderResponse.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.errors || errorJson.error) {
            const errors = errorJson.errors || [errorJson.error];
            errorMessage = Array.isArray(errors) 
              ? errors.map((e: any) => e.message || e).join('; ')
              : errors.message || errors;
          }
        } catch {
          // If not JSON, use raw text
          errorMessage = errorText || errorMessage;
        }
        
        console.error('Validation error from Lulu:', errorMessage);
        return new Response(
          JSON.stringify({ 
            error: `Print file validation failed: ${errorMessage}`,
            validationError: true,
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 422,
          }
        );
      }
      
      // If 5xx error, try alternate shipping level
      if (luluOrderResponse.status >= 500 && shippingLevel !== 'GROUND_HD') {
        console.log('Retrying with GROUND_HD shipping...');
        luluOrderData.shipping_level = 'GROUND_HD';
        
        const retryResponse = await fetch(`${luluBaseUrl}/print-jobs/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(luluOrderData),
        });
        
        if (retryResponse.ok) {
          const luluOrder = await retryResponse.json();
          console.log('Retry successful with GROUND_HD');
          
          const pricePaid = luluOrder.line_items?.[0]?.total_cost?.amount || 19.99;
          
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
            throw new Error('Failed to save order');
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              order,
              luluOrderId: luluOrder.id,
              environment: luluEnvironment,
              shippingLevel: 'GROUND_HD',
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          );
        }
      }
      
      throw new Error(`Lulu API returned ${luluOrderResponse.status}: ${errorText}`);
    }

    const luluOrder = await luluOrderResponse.json();
    console.log('Lulu order created:', luluOrder);

    // Calculate price (Lulu provides this in their response)
    const pricePaid = luluOrder.line_items?.[0]?.total_cost?.amount || 19.99;

    // Update existing paid order or create new one
    let order;
    let orderError;
    
    if (existingOrder?.id) {
      console.log('Updating existing order with Lulu details');
      const { data, error } = await supabase
        .from('orders')
        .update({
          book_id: bookId,
          lulu_order_id: luluOrder.id,
          order_type: 'digital_and_physical',
          status: 'processing',
          shipping_address: shippingAddress,
        })
        .eq('id', existingOrder.id)
        .select()
        .single();
      order = data;
      orderError = error;
    } else {
      console.log('Creating new order record');
      const { data, error } = await supabase
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
      order = data;
      orderError = error;
    }

    if (orderError) {
      console.error('Database error:', orderError);
      throw new Error('Failed to save order');
    }

    // Send confirmation email (don't fail the order if email fails)
    try {
      await supabase.functions.invoke('send-email', {
        body: {
          templateName: 'order_confirmation',
          recipientEmail: user.email,
          variables: {
            customerName: shippingAddress.name,
            childName: book.character_name,
            interests: Array.isArray(book.interests) ? book.interests.join(', ') : book.interests,
            orderId: order.id,
            orderDate: new Date().toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            }),
            totalAmount: `$${pricePaid.toFixed(2)}`,
          },
        },
      });
      console.log('Order confirmation email sent successfully');
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Don't fail the order, just log the error
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        order,
        luluOrderId: luluOrder.id,
        environment: luluEnvironment,
        shippingLevel,
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
