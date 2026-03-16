import type { APIRoute } from "astro";

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = await res.json() as { success: boolean };
  return data.success;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  let body: { email?: string; "cf-turnstile-response"?: string; website?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.");
  }

  // Honeypot: if the hidden "website" field has a value, it's a bot
  if (body.website) {
    // Return success so bots think it worked
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify Turnstile token
  const turnstileToken = body["cf-turnstile-response"];
  if (!turnstileToken) {
    return jsonError("Verification failed. Please try again.");
  }
  const turnstileValid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY as string);
  if (!turnstileValid) {
    return jsonError("Verification failed. Please try again.");
  }

  const email = body.email?.trim();
  if (!email || !EMAIL_RE.test(email)) {
    return jsonError("A valid email is required.");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Scrying Glass Mailing List <submissions@scryingglass.argent.works>",
      to: ["scryingglass@argent.works"],
      subject: "Scrying Glass Mailing List Signup",
      text: email,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Resend error:", res.status, text);
    return jsonError("Failed to sign up. Please try again later.", 500);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
