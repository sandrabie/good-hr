export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
  });
}
