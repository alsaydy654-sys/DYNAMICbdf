import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** JWT قديم (ثلاثة أجزاء مفصولة بنقاط) أو مفتاح النشر الجديد. */
const looksLikeValidKey = (key: string) =>
  /^sb_(publishable|secret)_/.test(key) || key.split(".").length === 3;

/**
 * رسالة عربية توضّح خطأ الإعداد، أو null إن كانت المتغيّرات سليمة.
 * وجود قيمة هنا يعني أن أي طلب سيفشل بـ "Invalid Compact JWS" أو ما شابه.
 */
export const supabaseConfigError: string | null = (() => {
  if (!url || !anonKey) {
    return "إعدادات Supabase مفقودة: يجب ضبط VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY قبل بناء التطبيق.";
  }
  if (!/^https:\/\/[^\s]+\.supabase\.(co|in)$/.test(url)) {
    return `عنوان Supabase غير صالح: "${url}" — المتوقع مثل https://xxxx.supabase.co`;
  }
  if (!looksLikeValidKey(anonKey)) {
    return "مفتاح Supabase (VITE_SUPABASE_ANON_KEY) غير صالح — يجب أن يكون JWT من ثلاثة أجزاء أو مفتاحاً يبدأ بـ sb_publishable_. هذا سبب رسالة \"Invalid Compact JWS\".";
  }
  return null;
})();

if (supabaseConfigError) {
  // eslint-disable-next-line no-console
  console.error(supabaseConfigError);
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: { persistSession: false },
});
