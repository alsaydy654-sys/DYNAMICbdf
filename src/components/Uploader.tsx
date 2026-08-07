import { useCallback, useMemo, useRef, useState } from "react";
import { AppConfig, LogEntry, LogLevel, PageRecord, ResultLog } from "../types";
import { parsePdfToImages } from "../lib/pdf";
import { syncPage } from "../lib/sync";
import { GRADES, TERMS } from "../constants";
import { previewPath } from "../config";
import ProgressLog from "./ProgressLog";
import ResultsScreen from "./ResultsScreen";
import { UploadIcon, FileIcon, TrashIcon, PlayIcon, FolderIcon } from "./icons";

interface Props {
  config: AppConfig;
  onViewGallery: () => void;
}

type Phase = "idle" | "processing" | "results";

let logSeq = 0;
const newId = () => `${Date.now()}-${logSeq++}`;
const nowTime = () => new Date().toLocaleTimeString("ar-EG", { hour12: false });

export default function Uploader({ config, onViewGallery }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [grade, setGrade] = useState(GRADES[0]);
  const [term, setTerm] = useState(TERMS[0]);
  const [bookTitle, setBookTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<ResultLog[]>([]);
  const [running, setRunning] = useState(false);
  const [currentLabel, setCurrentLabel] = useState("");
  const cancelRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const lastCtxRef = useRef<{
    grade: string;
    term: string;
    bookTitle: string;
    file: File;
  } | null>(null);

  const total = pages.length;
  const processed = useMemo(
    () => pages.filter((p) => p.status === "done" || p.status === "failed").length,
    [pages]
  );

  const pushLog = useCallback((level: LogLevel, message: string) => {
    setLogs((prev) =>
      [{ id: newId(), time: nowTime(), level, message }, ...prev].slice(0, 200)
    );
  }, []);

  const updatePage = (index: number, patch: Partial<PageRecord>) =>
    setPages((prev) => prev.map((p) => (p.index === index ? { ...p, ...patch } : p)));

  const pick = (f: File | null) => {
    if (f && !/\.pdf$/i.test(f.name)) return;
    setFile(f);
  };

  const canStart = !!file && !running;
  const livePreview = previewPath(config, grade, term);

  const mergeResults = (newResults: ResultLog[]) =>
    setResults((prev) => {
      const map = new Map<number, ResultLog>();
      for (const r of prev) if (r.status === "success") map.set(r.pageNumber, r);
      for (const r of newResults) map.set(r.pageNumber, r);
      return Array.from(map.values()).sort((a, b) => a.pageNumber - b.pageNumber);
    });

  /** رفع صفحة واحدة مع إعادة المحاولة التلقائية؛ لا يرمي استثناءً بل يسجّل النتيجة. */
  const uploadOne = async (
    rec: PageRecord,
    ctx: { grade: string; term: string; bookTitle: string; file: File }
  ): Promise<ResultLog> => {
    setCurrentLabel(`${rec.fileName} → ${rec.storagePath}`);
    updatePage(rec.index, { status: "processing", error: undefined });
    try {
      const { insertedId } = await syncPage(
        rec,
        config,
        {
          grade: ctx.grade,
          term: ctx.term,
          bookTitle: ctx.bookTitle,
          originalPdfName: ctx.file.name,
        },
        {
          onRetry: ({ attempt, attempts, delayMs, message }) =>
            pushLog(
              "warning",
              `تعذّر رفع ${rec.fileName} (محاولة ${attempt}/${attempts}): ${message} — إعادة المحاولة بعد ${Math.round(delayMs / 1000)}ث`
            ),
        }
      );
      // نُفرغ الـ blob بعد النجاح لتحرير الذاكرة في الكتب الكبيرة
      updatePage(rec.index, {
        status: "done",
        insertedId: insertedId ?? undefined,
        blob: new Blob([]),
      });
      pushLog("success", `رفع ${rec.fileName} إلى ${rec.storagePath}`);
      return { pageNumber: rec.pageNumber, status: "success", message: `رفعت إلى ${rec.storagePath}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updatePage(rec.index, { status: "failed", error: msg });
      pushLog("error", `فشل ${rec.fileName}: ${msg}`);
      return { pageNumber: rec.pageNumber, status: "error", message: msg };
    }
  };

  const runUpload = async (
    records: PageRecord[],
    ctx: { grade: string; term: string; bookTitle: string; file: File }
  ): Promise<void> => {
    pushLog("info", `بدء الرفع إلى حاوية "${config.storageBucket}" والجدول "${config.tableName}"`);

    const newResults: ResultLog[] = [];
    for (const rec of records) {
      if (cancelRef.current) break;
      newResults.push(await uploadOne(rec, ctx));
    }
    mergeResults(newResults);
  };

  const handleStart = async () => {
    if (!file) return;
    cancelRef.current = false;
    setRunning(true);
    setPhase("processing");
    setPages([]);
    setLogs([]);
    setResults([]);
    pushLog("info", `بدء المعالجة: ${file.name}`);
    pushLog("info", `المسار الأساسي: ${config.basePath || "(جذر)"}`);
    pushLog("info", `الوجهة: ${livePreview}`);

    const ctxBookTitle = bookTitle || file.name.replace(/\.pdf$/i, "");
    const ctx = { grade, term, bookTitle: ctxBookTitle, file };
    lastCtxRef.current = ctx;

    try {
      // خط أنابيب: كل صفحة تُرفع فور تحويلها، فلا يُحتفظ بالكتاب كاملاً في الذاكرة
      const streamResults: ResultLog[] = [];
      await parsePdfToImages(
        file,
        config,
        { grade, term, bookTitle: ctxBookTitle },
        async (record, totalP) => {
          if (cancelRef.current) return;
          setPages((prev) => [...prev, record]);
          pushLog("info", `تم تحويل الصفحة ${record.pageNumber} من ${totalP} → ${record.fileName}`);
          streamResults.push(await uploadOne(record, ctx));
        }
      );
      mergeResults(streamResults);

      if (cancelRef.current) pushLog("warning", "تم إيقاف العملية");
      else pushLog("success", "اكتملت المعالجة والرفع بنجاح");
      setPhase("results");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog("error", `خطأ عام: ${msg}`);
      setPhase("results");
    } finally {
      setRunning(false);
      setCurrentLabel("");
    }
  };

  const handleRetryFailed = async () => {
    const ctx = lastCtxRef.current;
    if (!ctx) return;
    const failedRecords = pages.filter((p) => p.status === "failed");
    if (failedRecords.length === 0) return;

    cancelRef.current = false;
    setRunning(true);
    setPhase("processing");
    pushLog("info", `إعادة محاولة ${failedRecords.length} صفحة فاشلة`);

    for (const r of failedRecords) updatePage(r.index, { status: "pending", error: undefined });

    try {
      await runUpload(failedRecords, ctx);
      pushLog("success", "اكتملت إعادة المحاولة");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog("error", `خطأ أثناء إعادة المحاولة: ${msg}`);
    } finally {
      setRunning(false);
      setCurrentLabel("");
      setPhase("results");
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    pushLog("warning", "طلب إيقاف...");
  };

  const handleReset = () => {
    setPhase("idle");
    setPages([]);
    setLogs([]);
    setResults([]);
    setFile(null);
    setBookTitle("");
    if (inputRef.current) inputRef.current.value = "";
    lastCtxRef.current = null;
  };

  if (phase === "results") {
    return (
      <ResultsScreen
        logs={results}
        onRetryFailed={handleRetryFailed}
        onReset={handleReset}
        onViewGallery={onViewGallery}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
            <UploadIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-800">معالجة ورفع الكتب</h2>
            <p className="text-xs text-slate-500">اختر الصف والترم وملف PDF المراد معالجته</p>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">الصف</label>
              <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)} disabled={running}>
                {GRADES.map((g) => (<option key={g} value={g}>{g}</option>))}
              </select>
            </div>
            <div>
              <label className="label">الترم</label>
              <select className="input" value={term} onChange={(e) => setTerm(e.target.value)} disabled={running}>
                {TERMS.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div>
              <label className="label">عنوان الكتاب</label>
              <input className="input" value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="مثال: الرياضيات" disabled={running} />
            </div>
          </div>

          {/* Live path preview in the uploader */}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <FolderIcon className="h-4 w-4 text-emerald-600" />
              <span>مسار الرفع المتوقع:</span>
            </div>
            <code className="break-all font-mono text-xs text-emerald-700" dir="ltr">
              {config.storageBucket} / {livePreview}
            </code>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); if (!running) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (running) return; pick(e.dataTransfer.files?.[0] ?? null); }}
            className={
              "rounded-2xl border-2 border-dashed px-6 py-8 text-center transition " +
              (dragging ? "border-emerald-500 bg-emerald-50/60" : "border-slate-300 bg-slate-50/50 hover:border-emerald-400")
            }
          >
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} disabled={running} />
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <FileIcon className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-semibold text-slate-800" dir="ltr">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} ميجابايت</p>
                </div>
                {!running && (
                  <button className="btn-ghost text-rose-600 hover:bg-rose-50" onClick={() => { pick(null); if (inputRef.current) inputRef.current.value = ""; }}>
                    <TrashIcon className="h-4 w-4" /> إزالة
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-200 text-slate-500">
                  <UploadIcon className="h-6 w-6" />
                </span>
                <p className="font-semibold text-slate-700">اسحب ملف PDF هنا أو اضغط للاختيار</p>
                <p className="text-xs text-slate-400">صيغة PDF فقط</p>
                <button type="button" className="btn-ghost mt-2" onClick={() => inputRef.current?.click()} disabled={running}>
                  اختيار ملف
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="text-sm text-slate-600">
          {file ? (
            <span>جاهز للمعالجة: <span className="font-semibold text-slate-800" dir="ltr">{file.name}</span></span>
          ) : (
            <span>اختر ملف PDF للبدء</span>
          )}
        </div>
        <div className="flex gap-2">
          {running ? (
            <button className="btn-danger" onClick={handleCancel}>
              <TrashIcon className="h-4 w-4" /> إيقاف
            </button>
          ) : (
            <button className="btn-primary" onClick={handleStart} disabled={!canStart}>
              <PlayIcon className="h-4 w-4" /> ابدأ المعالجة والرفع
            </button>
          )}
        </div>
      </div>

      <ProgressLog
        total={total}
        processed={processed}
        currentLabel={currentLabel}
        running={running}
        pages={pages}
        logs={logs}
      />
    </div>
  );
}
