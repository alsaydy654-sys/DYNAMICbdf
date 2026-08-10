/*
  واجهة الرفع الإدارية إلى سراج.

  تظهر فقط عند تهيئة خدمة الاستقبال والتوكن الإداري (App.tsx)، فلا يراها المستخدم العادي.
  القيم تُقرأ من شجرة سراج نفسها، فلا مجال لخطأ في الأسماء أو إنشاء مواد جديدة.
*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppConfig, LogEntry, LogLevel, PageRecord, ResultLog } from "../types";
import { parsePdfToImages } from "../lib/pdf";
import { supabaseConfigError } from "../lib/supabase";
import { isPermanentError } from "../lib/retry";
import { fetchCurriculumNames, fetchGradeNames, fetchSubjectNames } from "../lib/siraj";
import {
  IngestSession,
  ingestConfigError,
  ingestPage,
  publishUpload,
  startUpload,
} from "../lib/ingest";
import ProgressLog from "./ProgressLog";
import ResultsScreen from "./ResultsScreen";
import { FileIcon, PlayIcon, TrashIcon, UploadIcon } from "./icons";

interface Props {
  config: AppConfig;
}

type Phase = "idle" | "processing" | "results";

const nowTime = () => new Date().toLocaleTimeString("ar-EG");
const newId = () => Math.random().toString(36).slice(2);

export default function SirajUploader({ config }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [curricula, setCurricula] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [curriculum, setCurriculum] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [unitTitle, setUnitTitle] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<ResultLog[]>([]);
  const [running, setRunning] = useState(false);
  const [currentLabel, setCurrentLabel] = useState("");
  const cancelRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const configError = supabaseConfigError ?? ingestConfigError(config);

  const pushLog = useCallback((level: LogLevel, message: string) => {
    setLogs((prev) => [{ id: newId(), time: nowTime(), level, message }, ...prev].slice(0, 200));
  }, []);

  useEffect(() => {
    if (configError) return;
    fetchCurriculumNames()
      .then((names) => {
        setCurricula(names);
        setCurriculum((current) => current || names[0] || "");
      })
      .catch((err: Error) => setTaxonomyError(err.message));
  }, [configError]);

  useEffect(() => {
    if (!curriculum) return;
    setGrades([]);
    setSubjects([]);
    fetchGradeNames(curriculum)
      .then((names) => {
        setGrades(names);
        setGrade(names[0] ?? "");
      })
      .catch((err: Error) => setTaxonomyError(err.message));
  }, [curriculum]);

  useEffect(() => {
    if (!curriculum || !grade) return;
    setSubjects([]);
    fetchSubjectNames(curriculum, grade)
      .then((names) => {
        setSubjects(names);
        setSubject(names[0] ?? "");
      })
      .catch((err: Error) => setTaxonomyError(err.message));
  }, [curriculum, grade]);

  const total = pages.length;
  const processed = useMemo(
    () => pages.filter((p) => p.status === "done" || p.status === "failed").length,
    [pages]
  );

  const updatePage = (index: number, patch: Partial<PageRecord>) =>
    setPages((prev) => prev.map((p) => (p.index === index ? { ...p, ...patch } : p)));

  const canStart = !!file && !running && !configError && !!curriculum && !!grade && !!subject;

  const uploadOne = async (session: IngestSession, rec: PageRecord): Promise<ResultLog> => {
    setCurrentLabel(rec.fileName);
    updatePage(rec.index, { status: "processing", error: undefined });
    try {
      const storagePath = await ingestPage(config, session, rec, ({ attempt, attempts, delayMs, message }) =>
        pushLog(
          "warning",
          `تعذّر رفع ${rec.fileName} (محاولة ${attempt}/${attempts}): ${message} — إعادة المحاولة بعد ${Math.round(delayMs / 1000)}ث`
        )
      );
      updatePage(rec.index, { status: "done", storagePath, blob: new Blob([]) });
      pushLog("success", `رفع ${rec.fileName} → ${storagePath}`);
      return { pageNumber: rec.pageNumber, status: "success", message: `رفعت إلى ${storagePath}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updatePage(rec.index, { status: "failed", error: msg });
      pushLog("error", `فشل ${rec.fileName}: ${msg}`);
      if (isPermanentError(err)) {
        cancelRef.current = true;
        pushLog("error", "تم إيقاف العملية: الخطأ يتعلق بالإعدادات أو الصلاحيات، فإعادة المحاولة لن تفيد.");
      }
      return { pageNumber: rec.pageNumber, status: "error", message: msg };
    }
  };

  const handleStart = async () => {
    if (!file || configError) return;
    cancelRef.current = false;
    setRunning(true);
    setPhase("processing");
    setPages([]);
    setLogs([]);
    setResults([]);

    const book = bookTitle.trim() || file.name.replace(/\.pdf$/i, "");
    pushLog("info", `الوجهة في سراج: ${curriculum} / ${grade} / ${subject}`);

    try {
      const session = await startUpload(config, {
        curriculum,
        grade,
        subject,
        bookTitle: book,
        unitTitle: unitTitle.trim() || undefined,
        originalPdfName: file.name,
      });
      pushLog("info", `فُتحت عملية استقبال: ${session.uploadId}`);

      const streamResults: ResultLog[] = [];
      await parsePdfToImages(file, config, { grade, term: "", bookTitle: book }, async (record, totalP) => {
        if (cancelRef.current) return;
        setPages((prev) => [...prev, record]);
        pushLog("info", `تحويل الصفحة ${record.pageNumber} من ${totalP}`);
        streamResults.push(await uploadOne(session, record));
      });
      setResults(streamResults.sort((a, b) => a.pageNumber - b.pageNumber));

      const failed = streamResults.filter((r) => r.status === "error").length;
      if (cancelRef.current) {
        pushLog("warning", "تم الإيقاف — لم يُنشر الكتاب في سراج. البيانات محفوظة في طبقة الاستقبال ويمكن استئنافها.");
      } else if (failed > 0) {
        pushLog("error", `${failed} صفحة فاشلة — لن يُنشر الكتاب حتى تنجح كل الصفحات.`);
      } else {
        const { lessonId } = await publishUpload(config, session.uploadId);
        pushLog("success", `تم النشر في سراج — معرف الدرس: ${lessonId}`);
      }
      setPhase("results");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog("error", `خطأ: ${msg}`);
      // سجلّ الأخطاء لا يُعرض في شاشة النتائج، فنمرّر الخطأ القاتل كنتيجة لئلا يظهر نجاح وهمي
      setResults((prev) => [...prev, { pageNumber: 0, status: "error", message: msg }]);
      setPhase("results");
    } finally {
      setRunning(false);
      setCurrentLabel("");
    }
  };

  const handleReset = () => {
    setPhase("idle");
    setPages([]);
    setLogs([]);
    setResults([]);
    setFile(null);
    setBookTitle("");
    if (inputRef.current) inputRef.current.value = "";
  };

  if (phase === "results") {
    return <ResultsScreen logs={results} onRetryFailed={handleStart} onReset={handleReset} />;
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
            <UploadIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-800">رفع كتاب إلى سراج (إداري)</h2>
            <p className="text-xs text-slate-500">
              الرفع يمر عبر طبقة استقبال معزولة، ولا يُعدّل أي بيانات قائمة في سراج
            </p>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5">
          {configError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <p className="font-bold">الإعداد غير مكتمل</p>
              <p className="mt-1">{configError}</p>
            </div>
          )}
          {taxonomyError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {taxonomyError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">المنهج</label>
              <select className="input" value={curriculum} onChange={(e) => setCurriculum(e.target.value)} disabled={running}>
                {curricula.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label className="label">الصف</label>
              <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)} disabled={running || grades.length === 0}>
                {grades.map((g) => (<option key={g} value={g}>{g}</option>))}
              </select>
              {curriculum && grades.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">لا توجد صفوف لهذا المنهج في سراج.</p>
              )}
            </div>
            <div>
              <label className="label">المادة</label>
              <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={running || subjects.length === 0}>
                {subjects.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
              {grade && subjects.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">لا توجد مواد لهذا الصف في سراج.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">عنوان الكتاب (يصبح عنوان الدرس)</label>
              <input className="input" value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="مثال: كتاب الرياضيات — الترم الأول" disabled={running} />
            </div>
            <div>
              <label className="label">الوحدة في سراج (اختياري)</label>
              <input className="input" value={unitTitle} onChange={(e) => setUnitTitle(e.target.value)} placeholder="تُستخدم الموجودة بنفس الاسم أو تُنشأ جديدة" disabled={running} />
            </div>
          </div>

          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-6 py-8 text-center">
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={running} />
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                  <FileIcon className="h-6 w-6" />
                </span>
                <p className="font-semibold text-slate-800" dir="ltr">{file.name}</p>
                {!running && (
                  <button className="btn-ghost text-rose-600 hover:bg-rose-50" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}>
                    <TrashIcon className="h-4 w-4" /> إزالة
                  </button>
                )}
              </div>
            ) : (
              <button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()} disabled={running}>
                اختيار ملف PDF
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="text-sm text-slate-600">
          {file ? "يُنشر الكتاب كدرس واحد بصور صفحاته بعد نجاح كل الصفحات" : "اختر ملف PDF للبدء"}
        </div>
        {running ? (
          <button className="btn-danger" onClick={() => { cancelRef.current = true; pushLog("warning", "طلب إيقاف..."); }}>
            <TrashIcon className="h-4 w-4" /> إيقاف
          </button>
        ) : (
          <button className="btn-primary" onClick={handleStart} disabled={!canStart}>
            <PlayIcon className="h-4 w-4" /> ابدأ الرفع إلى سراج
          </button>
        )}
      </div>

      <ProgressLog total={total} processed={processed} currentLabel={currentLabel} running={running} pages={pages} logs={logs} />
    </div>
  );
}
