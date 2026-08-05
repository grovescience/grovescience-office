export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    url: process.env.SUPABASE_URL || "",
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
  });
}
