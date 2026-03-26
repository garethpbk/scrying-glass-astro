import type { APIRoute } from "astro";

export const prerender = false;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ART_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".rtf",
  ".pdf",
  ".odt",
  ".txt",
]);
const ALLOWED_ART_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
  ".bmp",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface SubmitBody {
  submissionType?: "story" | "art";
  authorName: string;
  email: string;
  storyTitle: string;
  coverLetter?: string;
  additionalNotes?: string;
  manuscript?: { name: string; base64: string };
  artAttachment?: { name: string; base64: string };
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
  const submissionType = body.submissionType || "story";
  const manuscript = body.manuscript;
  const artAttachment = body.artAttachment;

  // --- validation ---
  if (!authorName) return jsonError("Author name is required.");
  if (!email || !EMAIL_RE.test(email))
    return jsonError("A valid email is required.");
  if (!storyTitle) return jsonError("Story title is required.");

  // Manuscript is required for story submissions
  if (submissionType === "story") {
    if (!manuscript?.name || !manuscript?.base64)
      return jsonError("A manuscript file is required.");
  }

  // Art is required for art-only submissions
  if (submissionType === "art") {
    if (!artAttachment?.name || !artAttachment?.base64)
      return jsonError("An art file is required.");
  }

  // Validate manuscript if provided
  if (manuscript?.name && manuscript?.base64) {
    const ext = "." + manuscript.name.split(".").pop()!.toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext))
      return jsonError(`File type "${ext}" is not accepted.`);

    const approxSize = (manuscript.base64.length * 3) / 4;
    if (approxSize > MAX_FILE_SIZE)
      return jsonError("File exceeds the 10 MB limit.");
  }

  // Validate art attachment if provided
  if (artAttachment?.name && artAttachment?.base64) {
    const artExt = "." + artAttachment.name.split(".").pop()!.toLowerCase();
    if (!ALLOWED_ART_EXTENSIONS.has(artExt))
      return jsonError(`Art file type "${artExt}" is not accepted.`);

    const artApproxSize = (artAttachment.base64.length * 3) / 4;
    if (artApproxSize > MAX_ART_FILE_SIZE)
      return jsonError("Art file exceeds the 5 MB limit.");
  }

  // --- build email body ---
  const typeLabel = submissionType === "art" ? "Art" : "Story";
  const textBody = [
    `New ${typeLabel.toLowerCase()} submission from ${authorName} <${email}>`,
    "",
    `${typeLabel} title: ${storyTitle}`,
    "",
    manuscript ? `Manuscript: ${manuscript.name}` : "",
    artAttachment ? `Art attachment: ${artAttachment.name}` : "",
    coverLetter ? `Cover letter:\n${coverLetter}` : "",
    additionalNotes ? `Additional notes:\n${additionalNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // --- build attachments ---
  const attachments: { filename: string; content: string }[] = [];
  if (manuscript) {
    attachments.push({ filename: manuscript.name, content: manuscript.base64 });
  }
  if (artAttachment) {
    attachments.push({
      filename: artAttachment.name,
      content: artAttachment.base64,
    });
  }

  // --- send via Resend ---
  const subjectPrefix = submissionType === "art" ? "Art" : "Submission";
  const resendPayload = {
    from: "Scrying Glass Submissions <submissions@scryingglass.argent.works>",
    to: ["scryingglass@argent.works"],
    reply_to: email,
    subject: `${subjectPrefix}: "${storyTitle}" by ${authorName}`,
    text: textBody,
    attachments,
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
