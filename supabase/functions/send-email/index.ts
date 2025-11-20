import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  templateName: string;
  recipientEmail: string;
  variables: {
    customerName?: string;
    childName?: string;
    interests?: string;
    orderId?: string;
    orderDate?: string;
    totalAmount?: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { templateName, recipientEmail, variables }: EmailRequest = await req.json();

    // Fetch template from database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("template_name", templateName)
      .eq("is_published", true)
      .single();

    if (templateError || !template) {
      console.error("Template fetch error:", templateError);
      return new Response(
        JSON.stringify({ error: "Template not found or not published" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Replace variables in content
    const replaceVariables = (text: string): string => {
      let result = text;
      Object.entries(variables).forEach(([key, value]) => {
        result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value || "");
      });
      return result;
    };

    const content = template.content as any;

    // Build email HTML
    const emailHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${replaceVariables(content.subject)}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background-color: ${template.primary_color}; padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                        ${replaceVariables(content.headerTitle)}
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Greeting -->
                  <tr>
                    <td style="padding: 40px 30px 20px;">
                      <p style="margin: 0; color: #111827; font-size: 16px; line-height: 1.6;">
                        Hi ${variables.customerName || "there"},
                      </p>
                      <p style="margin: 16px 0 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                        ${replaceVariables(content.openingParagraph)}
                      </p>
                    </td>
                  </tr>
                  
                  <!-- What Happens Next -->
                  <tr>
                    <td style="padding: 20px 30px;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${template.accent_color}; border-radius: 8px; padding: 30px;">
                        <tr>
                          <td>
                            <h2 style="margin: 0 0 20px; color: #111827; font-size: 20px; font-weight: bold;">
                              What Happens Next
                            </h2>
                            
                            <!-- Step 1 -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                              <tr>
                                <td width="40" valign="top">
                                  <div style="width: 32px; height: 32px; background-color: ${template.primary_color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 16px;">1</div>
                                </td>
                                <td valign="top">
                                  <h3 style="margin: 0 0 8px; color: #111827; font-size: 16px; font-weight: 600;">
                                    ${replaceVariables(content.step1Title)}
                                  </h3>
                                  <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
                                    ${replaceVariables(content.step1Description)}
                                  </p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Step 2 -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                              <tr>
                                <td width="40" valign="top">
                                  <div style="width: 32px; height: 32px; background-color: ${template.primary_color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 16px;">2</div>
                                </td>
                                <td valign="top">
                                  <h3 style="margin: 0 0 8px; color: #111827; font-size: 16px; font-weight: 600;">
                                    ${replaceVariables(content.step2Title)}
                                  </h3>
                                  <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
                                    ${replaceVariables(content.step2Description)}
                                  </p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Step 3 -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td width="40" valign="top">
                                  <div style="width: 32px; height: 32px; background-color: ${template.primary_color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 16px;">3</div>
                                </td>
                                <td valign="top">
                                  <h3 style="margin: 0 0 8px; color: #111827; font-size: 16px; font-weight: 600;">
                                    ${replaceVariables(content.step3Title)}
                                  </h3>
                                  <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
                                    ${replaceVariables(content.step3Description)}
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 40px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 8px; color: #111827; font-size: 18px; font-weight: 600;">
                        Color Me In Books
                      </p>
                      <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                        ${replaceVariables(content.footerTagline)}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    // Send email via Resend
    const { error: sendError } = await resend.emails.send({
      from: "Color Me In Books <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: replaceVariables(content.subject),
      html: emailHTML,
    });

    if (sendError) {
      console.error("Email send error:", sendError);
      return new Response(
        JSON.stringify({ error: sendError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully to:", recipientEmail);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
