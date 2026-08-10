import { AppConfig } from "../types";
import { resetConfig, previewPath } from "../config";
import { SettingsIcon, RotateIcon, CheckIcon, FolderIcon } from "./icons";

interface Props {
  config: AppConfig;
  onChange: (next: AppConfig) => void;
}

export default function SettingsPanel({ config, onChange }: Props) {
  const update = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    onChange({ ...config, [key]: value });

  const updateColumn = (key: keyof AppConfig["columns"], value: string) =>
    onChange({ ...config, columns: { ...config.columns, [key]: value } });

  const updateIngest = (key: keyof AppConfig["ingest"], value: string) =>
    onChange({ ...config, ingest: { ...config.ingest, [key]: value } });

  const handleReset = () => onChange(resetConfig());

  const livePreview = previewPath(config);

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-l from-emerald-50/60 to-white px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
          <SettingsIcon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-bold text-slate-800">إعدادات المسارات والجداول</h2>
          <p className="text-xs text-slate-500">تحكّم في المسار الأساسي والجدول وقواعد تسمية الملفات</p>
        </div>
      </header>

      <div className="space-y-6 px-5 py-5">
        {/* Storage + Base Path */}
        <Group title="تخزين Supabase" badge="1">
          <Field label="اسم حاوية التخزين (Storage Bucket)">
            <input className="input" value={config.storageBucket} onChange={(e) => update("storageBucket", e.target.value)} placeholder="textbooks" dir="ltr" />
          </Field>
          <Field
            label="المسار الأساسي (Root Base Path)"
            hint="أدخل الجذر فقط، وسيُلحق التطبيق تلقائيًا الصف ثم الترم ثم اسم الصورة."
          >
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-slate-400">
                <FolderIcon className="h-4 w-4" />
              </span>
              <input
                className="input pr-10"
                value={config.basePath}
                onChange={(e) => update("basePath", e.target.value)}
                placeholder="المناهج/صنعاء"
              />
            </div>
          </Field>

          {/* Live path preview */}
          <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-3">
            <span className="text-xs font-semibold text-slate-600">معاينة المسار الكامل للصفحة الأولى: </span>
            <code className="mt-1 block break-all font-mono text-xs text-emerald-700" dir="ltr">
              {config.storageBucket} / {livePreview}
            </code>
            <p className="mt-2 text-[11px] text-slate-400">
              التركيب: <span dir="ltr" className="font-mono">[المسار الأساسي] / [الصف] / [الترم] / [اسم الملف]</span>
            </p>
          </div>
        </Group>

        {/* Database */}
        <Group title="قاعدة البيانات" badge="2">
          <Field label="اسم الجدول الهدف">
            <input className="input" value={config.tableName} onChange={(e) => update("tableName", e.target.value)} placeholder="textbook_pages" dir="ltr" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ColumnField label="اسم الملف" value={config.columns.fileName} onChange={(v) => updateColumn("fileName", v)} />
            <ColumnField label="مسار التخزين" value={config.columns.storagePath} onChange={(v) => updateColumn("storagePath", v)} />
            <ColumnField label="رقم الصفحة" value={config.columns.pageNumber} onChange={(v) => updateColumn("pageNumber", v)} />
            <ColumnField label="الصف" value={config.columns.grade} onChange={(v) => updateColumn("grade", v)} />
            <ColumnField label="الترم" value={config.columns.term} onChange={(v) => updateColumn("term", v)} />
            <ColumnField label="اسم ملف PDF الأصلي" value={config.columns.originalPdfName} onChange={(v) => updateColumn("originalPdfName", v)} />
            <ColumnField label="عنوان الكتاب" value={config.columns.bookTitle} onChange={(v) => updateColumn("bookTitle", v)} />
            <ColumnField label="نوع MIME" value={config.columns.mimeType} onChange={(v) => updateColumn("mimeType", v)} />
            <ColumnField label="حجم الملف" value={config.columns.fileSize} onChange={(v) => updateColumn("fileSize", v)} />
          </div>
        </Group>

        {/* Naming */}
        <Group title="قواعد تسمية الملفات" badge="3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="عدد أرقام التعبئة (Zero-padding)">
              <input type="number" min={1} max={8} className="input" value={config.zeroPadDigits}
                onChange={(e) => update("zeroPadDigits", Math.max(1, Math.min(8, Number(e.target.value) || 3)))} dir="ltr" />
            </Field>
            <Field label="بادئة مخصصة (اختياري)" hint="مثال: page_ — ستنتج page_001.jpeg">
              <input className="input" value={config.customPrefix} onChange={(e) => update("customPrefix", e.target.value)} placeholder="page_" dir="ltr" />
            </Field>
            <Field label="صيغة الصورة">
              <div className="flex gap-2">
                <FormatButton active={config.imageFormat === "image/jpeg"} onClick={() => update("imageFormat", "image/jpeg")} label="JPEG" />
                <FormatButton active={config.imageFormat === "image/png"} onClick={() => update("imageFormat", "image/png")} label="PNG" />
              </div>
            </Field>
            {config.imageFormat === "image/jpeg" && (
              <Field label={`جودة JPEG: ${Math.round(config.jpegQuality * 100)}%`}>
                <input type="range" min={0.3} max={1} step={0.05} className="w-full accent-emerald-600" value={config.jpegQuality}
                  onChange={(e) => update("jpegQuality", Number(e.target.value))} />
              </Field>
            )}
            <Field label={`مقياس العرض (الجودة): ${config.renderScale.toFixed(1)}×`} hint="أعلى = جودة أفضل وحجم أكبر">
              <input type="range" min={0.5} max={3} step={0.1} className="w-full accent-emerald-600" value={config.renderScale}
                onChange={(e) => update("renderScale", Number(e.target.value))} />
            </Field>
          </div>
        </Group>

        {/* Siraj ingestion (admin only) */}
        <Group title="رفع إلى سراج — وضع إداري" badge="4">
          <p className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-xs leading-5 text-indigo-800">
            عند تعبئة الحقلين يظهر تبويب «رفع إلى سراج» الذي يرفع الكتب عبر طبقة استقبال معزولة
            (schema مستقل + حاوية مستقلة)، ثم يُضيف الكتاب إلى سراج كدرس جديد دون مساس بأي بيانات قائمة.
            التوكن يُحفظ في متصفّحك فقط ولا يُدمج في ملفات البناء؛ اتركه فارغاً لإخفاء الوضع الإداري تماماً.
          </p>
          <Field
            label="عنوان خدمة الاستقبال (Edge Function)"
            hint="مثال: https://xxxx.supabase.co/functions/v1/curriculum-ingest"
          >
            <input
              className="input"
              value={config.ingest.functionUrl}
              onChange={(e) => updateIngest("functionUrl", e.target.value)}
              placeholder="https://xxxx.supabase.co/functions/v1/curriculum-ingest"
              dir="ltr"
            />
          </Field>
          <Field label="التوكن الإداري (INGEST_ADMIN_TOKEN)">
            <input
              className="input"
              type="password"
              value={config.ingest.adminToken}
              onChange={(e) => updateIngest("adminToken", e.target.value)}
              placeholder="••••••••••••"
              dir="ltr"
            />
          </Field>
        </Group>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <CheckIcon className="h-4 w-4" /> يُحفظ تلقائيًا
          </span>
          <button className="btn-ghost" onClick={handleReset}>
            <RotateIcon className="h-4 w-4" /> استعادة الافتراضي
          </button>
        </div>
      </div>
    </section>
  );
}

function Group({ title, badge, children }: { title: string; badge: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{badge}</span>
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function ColumnField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label text-xs">{label}</label>
      <input className="input py-2 text-xs" value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" />
    </div>
  );
}

function FormatButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 rounded-xl border px-4 py-2 text-sm font-semibold transition " +
        (active
          ? "border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")
      }
    >
      {label}
    </button>
  );
}
