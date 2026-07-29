import { createClient } from "@supabase/supabase-js";

const url = https://ljypbnvzjheztuwtajcn.supabase.coimport.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey =eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXBibnZ6amhlenR1d3RhamNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NDczOTIsImV4cCI6MjEwMDIyMzM5Mn0.RpQ7zTmsdSqNyatnl5Xlzb8jkwygF4C0Xpg-oEXHdNk import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: { persistSession: false },
});
