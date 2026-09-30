// Hands the browser the Supabase project URL and its public (anon / publishable) key.
// Both are designed to be public; row-level security in supabase/schema.sql protects the data.
// Set by Vercel's Supabase integration, or add them by hand under Project → Settings → Environment Variables.
module.exports = (req, res) => {
  const env = process.env;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(url && key ? { url, key } : { url: '', key: '' }));
};
