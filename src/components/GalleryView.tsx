import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { AppConfig } from "../types";
import { GRADES, TERMS } from "../constants";
import { GalleryIcon, RefreshIcon, AlertIcon } from "./icons";

interface Props {
  config: AppConfig;
}

interface PageRow {
  id?: string;
  [key: string]: unknown;
}

const ALL = "__all__";

export default function GalleryView({ config }: Props) {
  const [selectedGrade, setSelectedGrade] = useState<string>(ALL);
  const [selectedTerm, setSelectedTerm] = useState<string>(ALL);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    if (!config.tableName) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from(config.tableName)
        .select("*")
        .order(config.columns.pageNumber || "page_number", { ascending: true });
      if (selectedGrade !== ALL) query = query.eq(config.columns.grade, selectedGrade);
      if (selectedTerm !== ALL) query = query.eq(config.columns.term, selectedTerm);
      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setPages((data as PageRow[]) ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "حدث خطأ أثناء جلب البيانات");
    } finally {
      setLoading(false);
    }
  }, [config.tableName, config.columns.pageNumber, config.columns.grade, config.columns.term, selectedGrade, selectedTerm]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const getPublicUrl = (imagePath: string): string => {
    if (!imagePath) return "";
    if (imagePath.startsWith("http")) return imagePath;
    const { data } = supabase.storage.from(config.storageBucket).getPublicUrl(imagePath);
    return data.publicUrl;
  };

  return (
    <section className="card">
      <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
            <GalleryIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-800">معاينة الصور المسجلة</h2>
            <p className="text-xs text-slate-500">تأكد من التسلسل الصحيح للصور مباشرة من قاعدة البيانات</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select className="input max-w-[200px] py-2" value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)}>
            <option value={ALL}>كل الصفوف</option>
            {GRADES.map((g) => (<option key={g} value={g}>{g}</option>))}
          </select>
          <select className="input max-w-[160px] py-2" value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)}>
            <option value={ALL}>كل الترمات</option>
            {TERMS.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
          <button className="btn-ghost" onClick={fetchPages}>
            <RefreshIcon className="h-4 w-4" /> تحديث
          </button>
        </div>
      </header>

      <div className="px-5 py-5">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-400">جاري تحميل الصور من قاعدة البيانات...</div>
        ) : pages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center text-slate-400">
            لا توجد صفحات مرفوعة تطابق خيارات التصفية الحالية.
          </div>
        ) : (
          <>
            <div className="mb-3 text-xs text-slate-500">
              عدد الصفحات: <span className="font-bold text-slate-700">{pages.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {pages.map((page, index) => {
                const imgPath = String(
                  (page[config.columns.storagePath] as string) ??
                  (page.image_url as string) ??
                  (page.file_path as string) ?? ""
                );
                const pageNum = (page[config.columns.pageNumber] as number) ?? (page.page_number as number) ?? index + 1;
                const imageUrl = getPublicUrl(imgPath);
                return (
                  <div key={page.id ?? index} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-xs transition-all hover:shadow-md">
                    <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-slate-200">
                      {imageUrl ? (
                        <img src={imageUrl} alt={`Page ${pageNum}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                      ) : (
                        <span className="text-xs text-slate-400">لا يوجد رابط</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 bg-white p-2.5">
                      <span className="text-xs font-bold text-slate-800">صفحة {pageNum}</span>
                      <span className="max-w-[80px] truncate text-[10px] text-slate-400" title={imgPath} dir="ltr">{imgPath?.split("/").pop()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
