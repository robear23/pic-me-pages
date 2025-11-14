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

interface LuluValidationResponse {
  id: string;
  status: 'CREATED' | 'PROCESSING' | 'VALIDATED' | 'ERROR';
  errors?: Array<{
    message: string;
    code: string;
  }>;
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

async function validateWithLulu(
  accessToken: string,
  baseUrl: string,
  type: 'interior' | 'cover',
  pdfUrl: string,
  podPackageId: string,
  pageCount: number
): Promise<void> {
  console.log(`Starting Lulu ${type} validation...`);
  
  const endpoint = type === 'interior' ? 'print-job-interior-files' : 'print-job-cover-files';
  const payload = type === 'interior' 
    ? {
        pod_package_id: podPackageId,
        page_count: pageCount,
        source_url: pdfUrl,
      }
    : {
        pod_package_id: podPackageId,
        source_url: pdfUrl,
      };
  
  const response = await fetch(`${baseUrl}/${endpoint}/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lulu ${type} validation request failed (${response.status}): ${errorText}`);
  }
  
  const validation: LuluValidationResponse = await response.json();
  console.log(`Lulu ${type} validation started:`, validation.id);
  
  // Poll for validation result (max 30 seconds)
  for (let i = 0; i < 15; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    const statusResponse = await fetch(`${baseUrl}/${endpoint}/${validation.id}/`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!statusResponse.ok) {
      console.warn(`Failed to check ${type} validation status`);
      continue;
    }
    
    const status: LuluValidationResponse = await statusResponse.json();
    console.log(`${type} validation status:`, status.status);
    
    if (status.status === 'VALIDATED') {
      console.log(`✓ ${type} validated successfully`);
      return;
    }
    
    if (status.status === 'ERROR') {
      const errors = status.errors?.map(e => e.message).join('; ') || 'Unknown validation error';
      throw new Error(`Lulu ${type} validation failed: ${errors}`);
    }
  }
  
  console.warn(`${type} validation timeout - proceeding anyway`);
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
    
    // Configurable product and shipping
    const podPackageId = Deno.env.get('LULU_POD_PACKAGE_ID') || '0850X1100FCPRECO060UW444MXX';
    
    const luluBaseUrl = luluEnvironment === 'production' 
      ? 'https://api.lulu.com'
      : 'https://api.sandbox.lulu.com';
    
    console.log(`Using Lulu ${luluEnvironment} environment: ${luluBaseUrl}`);
    console.log(`Product: ${podPackageId}`);
    
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
    const coverUrl = book.cover_url;
    const interiorUrl = book.pdf_url;
    
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

    // Calculate page count (interior pages only, ensure even)
    let interiorPageCount = book.pages?.length || 0;
    if (interiorPageCount % 2 !== 0) {
      console.log(`Adjusting page count from ${interiorPageCount} to ${interiorPageCount + 1} (must be even)`);
      interiorPageCount += 1;
    }

    console.log('Interior page count:', interiorPageCount);
    console.log('POD Package ID:', podPackageId);

    // Validate files with Lulu before creating the job
    try {
      await validateWithLulu(access_token, luluBaseUrl, 'interior', interiorUrl, podPackageId, interiorPageCount);
      await validateWithLulu(access_token, luluBaseUrl, 'cover', coverUrl, podPackageId, interiorPageCount);
    } catch (validationError: any) {
      console.error('Lulu validation failed:', validationError.message);
      return new Response(
        JSON.stringify({ 
          error: `Print file validation failed: ${validationError.message}`,
          validationError: true,
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 422,
        }
      );
    }

    // Determine shipping level based on country
    const defaultShippingLevel = shippingAddress.country === 'US' ? 'MAIL' : 'PRIORITY_MAIL';
    const shippingLevel = Deno.env.get('LULU_SHIPPING_LEVEL') || defaultShippingLevel;
    
    console.log(`Shipping level: ${shippingLevel} (country: ${shippingAddress.country})`);
    
    const luluOrderData = {
      line_items: [
        {
          page_count: interiorPageCount,
          pod_package_id: podPackageId,
          title: `${book.character_name}'s Coloring Book`,
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
      
      // If 5xx error after successful validation, try alternate shipping level
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
