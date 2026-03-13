import type { APIRoute } from "astro";

export const prerender = false;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".rtf",
  ".pdf",
  ".odt",
  ".txt",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface SubmitBody {
  authorName: string;
  email: string;
  storyTitle: string;
  coverLetter?: string;
  additionalNotes?: string;
  manuscript: { name: string; base64: string };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  let body: SubmitBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.");
  }

  const authorName = body.authorName?.trim();
  const email = body.email?.trim();
  const storyTitle = body.storyTitle?.trim();
  const coverLetter = body.coverLetter?.trim() || "";
  const additionalNotes = body.additionalNotes?.trim() || "";
  const manuscript = body.manuscript;

  // --- validation ---
  if (!authorName) return jsonError("Author name is required.");
  if (!email || !EMAIL_RE.test(email))
    return jsonError("A valid email is required.");
  if (!storyTitle) return jsonError("Story title is required.");
  if (!manuscript?.name || !manuscript?.base64)
    return jsonError("A manuscript file is required.");

  const ext = "." + manuscript.name.split(".").pop()!.toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext))
    return jsonError(`File type "${ext}" is not accepted.`);

  // Check approximate file size from base64 (base64 is ~4/3 of original)
  const approxSize = (manuscript.base64.length * 3) / 4;
  if (approxSize > MAX_FILE_SIZE)
    return jsonError("File exceeds the 10 MB limit.");

  const base64Content = manuscript.base64;

  // --- build email body ---
  const textBody = [
    `New submission from ${authorName} <${email}>`,
    "",
    `Story title: ${storyTitle}`,
    "",
    coverLetter ? `Cover letter:\n${coverLetter}` : "",
    additionalNotes ? `Additional notes:\n${additionalNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // --- send via Resend ---
  const resendPayload = {
    from: "Scrying Glass Submissions <submissions@scryingglass.argent.works>",
    to: ["scryingglass@argent.works"],
    reply_to: email,
    subject: `Submission: "${storyTitle}" by ${authorName}`,
    text: textBody,
    attachments: [
      {
        filename: manuscript.name,
        content: base64Content,
      },
    ],
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(resendPayload),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Resend error:", res.status, body);
    return jsonError(
      "Failed to send your submission. Please try again later.",
      500
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
