import { ResultLog } from "../types";
import {
  AlertIcon,
  CheckCircleIcon,
  RotateIcon,
  PlusIcon,
  GalleryIcon,
} from "./icons";

interface Props {
  logs: ResultLog[];
  onRetryFailed: () => void;
  onReset: () => void;
  onViewGallery?: () => void;
}

export default function ResultsScreen({
  logs,
  onRetryFailed,
  onReset,
  onViewGallery,
}: Props) {
  const successCount = logs.filter((l) => l.status === "success").length;
  const errorLogs = logs.filter((l) => l.status === "error");
  const totalCount = logs.length;
  // لا نتائج = لم تُرفع أي صفحة؛ ليس نجاحاً
  const hasErrors = errorLogs.length > 0 || totalCount === 0;

  const getTroubleshootingAdvice = (errorMessage: string) => {
    if (
      errorMessage.includes("(404)") ||
      errorMessage.includes("Failed to send a request to the Edge Function") ||
      (errorMessage.includes("Ingest") && errorMessage.includes("Failed to fetch"))
    ) {
      return {
        cause: "خدمة الاستقبال (Edge Function) غير منشورة أو عنوانها غير صحيح",
        fix: "انشر الدالة عبر supabase functions deploy curriculum-ingest --no-verify-jwt، واضبط INGEST_ADMIN_TOKEN، ثم تأكد من مطابقة الرابط في الإعدادات → رفع إلى سراج.",
      };
    }
    if (errorMessage.includes("(401)") || errorMessage.includes("Unauthorized")) {
      return {
        cause: "التوكن الإداري غير صحيح (رفضته خدمة الاستقبال)",
        fix: "تأكد من تطابق التوكن في الإعدادات مع قيمة INGEST_ADMIN_TOKEN المضبوطة في أسرار Supabase.",
      };
    }
    if (
      errorMessage.includes("row-level security") ||
      errorMessage.includes("RLS") ||
      errorMessage.includes("permission")
    ) {
      return {
        cause: "رفض الصلاحيات من قاعدة البيانات (RLS Policy Violation)",
        fix: "تأكد من تفعيل سياسات الـ RLS في جدول Supabase والسماح بعمليات الإدخال (Insert) للمستخدمين Anon أو العامة.",
      };
    }
    if (
      errorMessage.includes("storage") ||
      errorMessage.includes("bucket") ||
      errorMessage.includes("not found")
    ) {
      return {
        cause: "مشكلة في التخزين (Supabase Storage Bucket)",
        fix: "تأكد من أن اسم الـ Bucket مطابق تماماً للإعدادات وأنه عام (Public) لتقبل رفع الصور.",
      };
    }
    if (
      errorMessage.includes("Compact JWS") ||
      errorMessage.includes("JWT") ||
      errorMessage.includes("API key") ||
      errorMessage.includes("VITE_SUPABASE")
    ) {
      return {
        cause: "مفتاح أو عنوان Supabase غير صالح في نسخة التطبيق الحالية",
        fix: "اضبط VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY (Project Settings → API) في بيئة البناء: متغيّرات Vercel أو GitHub Secrets أو ملف .env محلياً، ثم أعد بناء التطبيق — القيم تُدمج وقت البناء وليس وقت التشغيل.",
      };
    }
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("fetch") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("timed out") ||
      errorMessage.includes("Load failed")
    ) {
      return {
        cause: "انقطاع أو بطء في اتصال الإنترنت (بعد 5 محاولات تلقائية)",
        fix: "التطبيق يعيد المحاولة تلقائياً وينتظر عودة الاتصال، والرفع يتم صفحة بصفحة فلا حاجة لتقسيم الكتاب. تحقق من الاتصال ثم اضغط «إعادة محاولة الصفحات الفاشلة» — الصفحات الناجحة لا تُرفع مرتين.",
      };
    }
    return {
      cause: errorMessage || "خطأ غير معروف أثناء المعالجة أو الرفع",
      fix: "جرب إعادة تسمية ملف الـ PDF ليكون بأحرف إنجليزية بسيطة، أو تأكد من صحة أعمدة الجدول في إعدادات التطبيق.",
    };
  };

  return (
    <div className="card space-y-6 p-6">
      <div
        className={`flex flex-col items-center justify-between gap-4 rounded-2xl border p-6 md:flex-row ${
          hasErrors
            ? "border-amber-200 bg-amber-50/50"
            : "border-emerald-200 bg-emerald-50/50"
        }`}
      >
        <div className="flex items-center gap-4 text-right">
          <div
            className={`grid h-14 w-14 place-items-center rounded-2xl ${
              hasErrors
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {hasErrors ? (
              <AlertIcon className="h-7 w-7" />
            ) : (
              <CheckCircleIcon className="h-7 w-7" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {totalCount === 0
                ? "لم تُرفع أي صفحة"
                : hasErrors
                  ? "اكتملت العملية مع وجود بعض الأخطاء"
                  : "تمت عملية معالجة ورفع الكتاب بنجاح تام!"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              إجمالي الصفحات: <span className="font-semibold">{totalCount}</span> | الناجحة:{" "}
              <span className="font-semibold text-emerald-600">{successCount}</span> | الفاشلة:{" "}
              <span className="font-semibold text-rose-600">{errorLogs.length}</span>
            </p>
          </div>
        </div>
        <div className="flex w-full items-center gap-3 md:w-auto">
          {errorLogs.length > 0 && (
            <button
              onClick={onRetryFailed}
              className="flex-1 gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-amber-700 md:flex-none"
            >
              <RotateIcon className="h-4 w-4" /> إعادة محاولة الصفحات الفاشلة
            </button>
          )}
          <button
            onClick={onReset}
            className="flex-1 gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-slate-800 md:flex-none"
          >
            <PlusIcon className="h-4 w-4" /> رفع كتاب جديد
          </button>
        </div>
      </div>

      {errorLogs.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">سجل الأخطاء والتشخيص الفوري:</h3>
          <div className="space-y-3">
            {errorLogs.map((log, index) => {
              const diagnosis = getTroubleshootingAdvice(log.message);
              return (
                <div key={index} className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-rose-900">
                      {log.pageNumber > 0 ? `صفحة رقم (${log.pageNumber})` : "فشل قبل معالجة الصفحات"}
                    </span>
                    <span className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">فشلت</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 pt-1 text-xs md:grid-cols-2">
                    <div className="rounded-lg border border-rose-100 bg-white/80 p-3">
                      <span className="mb-1 block font-bold text-slate-700">السبب المحتمل:</span>
                      <span className="break-all font-mono text-rose-700">{diagnosis.cause}</span>
                      {log.message && log.message !== diagnosis.cause && (
                        <span className="mt-2 block break-all font-mono text-[11px] text-slate-500">
                          {log.message}
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg border border-emerald-100 bg-white/80 p-3">
                      <span className="mb-1 block font-bold text-slate-700">كيفية الإصلاح:</span>
                      <span className="text-emerald-800">{diagnosis.fix}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl border border-slate-200/60 bg-slate-50 p-8 text-center">
          <p className="font-medium text-slate-700">
            {totalCount === 0
              ? "لم تكتمل أي صفحة — راجع السجل وأعد المحاولة."
              : "جميع صفحات الكتاب تم تقطيعها، تسميتها بدقة، ورفعها إلى السحاب وقاعدة البيانات بنجاح."}
          </p>
          {onViewGallery && totalCount > 0 && (
            <>
              <p className="text-xs text-slate-400">
                يمكنك الانتقال فوراً إلى تبويب "معاينة الصور المسجلة" للتأكد من تسلسلها.
              </p>
              <button onClick={onViewGallery} className="btn-primary mx-auto mt-4">
                <GalleryIcon className="h-4 w-4" /> معاينة الصور المرفوعة
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
