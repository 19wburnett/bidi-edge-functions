// @deno-types="npm:@types/node"
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// Import Deno types
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Types for our request and database
interface RequestPayload {
  requestId: string;
  userId: string;
}

interface UserData {
  email: string;
  full_name: string;
}

interface RequestData {
  title: string;
  description: string;
  created_at: string;
}

// Initialize Supabase client
const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  {
    auth: {
      persistSession: false,
    },
  }
);

// Initialize Resend client
const resend = new Resend(Deno.env.get("RESEND_API_KEY") ?? "");

Deno.serve(async (req: Request) => {
  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Verify request method
    if (req.method !== "POST") {
      throw new Error("Method not allowed");
    }

    // Parse request body
    const { requestId, userId }: RequestPayload = await req.json();

    if (!requestId || !userId) {
      throw new Error("Missing required fields: requestId or userId");
    }

    // Fetch user data
    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      throw new Error(`Failed to fetch user data: ${userError?.message}`);
    }

    // Fetch request data
    const { data: requestData, error: requestError } = await supabaseClient
      .from("requests")
      .select("title, description, created_at")
      .eq("id", requestId)
      .single();

    if (requestError || !requestData) {
      throw new Error(`Failed to fetch request data: ${requestError?.message}`);
    }

    // Generate the follow-up email
    const emailResponse = await resend.emails.send({
      from: "Bidi <notifications@yourdomain.com>",
      to: userData.email,
      subject: `Follow-up: ${requestData.title}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hello ${userData.full_name},</h2>
          <p>We noticed you created a request on Bidi:</p>
          <h3>${requestData.title}</h3>
          <p>${requestData.description}</p>
          <p>Are you still looking for vendors? Click the button below to view your request:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${Deno.env.get("APP_URL")}/requests/${requestId}" 
               style="background-color: #0070f3; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              View Your Request
            </a>
          </div>
          <p>Best regards,<br>The Bidi Team</p>
        </div>
      `,
    });

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: "Follow-up email sent successfully",
        emailId: emailResponse.id,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );

  } catch (error) {
    // Log error (will appear in Supabase logs)
    console.error("Error sending follow-up:", error);

    // Return error response
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: error.message === "Method not allowed" ? 405 : 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
