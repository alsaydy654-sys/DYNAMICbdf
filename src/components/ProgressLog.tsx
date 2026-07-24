import { LogEntry, PageRecord, UploadStatus } from "../types";
import { CheckIcon, AlertIcon, InfoIcon } from "./icons";

interface Props {
  total: number;
  processed: number;
  currentLabel: string;
  running: boolean;
  pages: PageRecord[];
  logs: LogEntry[];
}

export default function ProgressLog({
  total,
  processed,
  currentLabel,
  running,
  pages,
  logs,
}: Props) {
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <section className="card">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">التقدّم والسجل</h2>
          <p className="text-xs text-slate-500">متابعة لحظية لعمليات الرفع والإدراج</p>
        </div>
        <div className="text-left">
          <div className="text-2xl font-bold text-emerald-600" dir="ltr">{pct}%</div>
          <div className="text-xs text-slate-400" dir="ltr">{processed} / {total}</div>
        </div>
      </header>

      <div className="space-y-5 px-5 py-5">
        <div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={
                "h-full rounded-full transition-all duration-300 ease-out " +
                (running ? "bg-gradient-to-l from-emerald-500 to-emerald-700" : "bg-emerald-600")
              }
              style={{ width: `${pct}%` }}
            />
          </div>
          {currentLabel && (
            <p className="mt-2 truncate text-xs text-slate-500" dir="ltr">{currentLabel}</p>
          )}
        </div>

        {pages.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-400">الصفحات</h3>
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {pages.map((p) => (
                <PageChip key={p.index} page={p} />
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase text-slate-400">السجل</h3>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">الوقت</th>
                  <th className="px-3 py-2 font-semibold">الحالة</th>
                  <th className="px-3 py-2 font-semibold">الرسالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-400">لا توجد رسائل بعد</td>
                  </tr>
                )}
                {logs.map((l) => (
                  <tr key={l.id} className="animate-slide-in">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-400" dir="ltr">{l.time}</td>
                    <td className="px-3 py-2"><LevelBadge level={l.level} /></td>
                    <td className="px-3 py-2 text-slate-700">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function PageChip({ page }: { page: PageRecord }) {
  const map: Record<UploadStatus, { cls: string; label: string }> = {
    pending: { cls: "border-slate-200 bg-slate-50 text-slate-500", label: "بانتظار" },
    processing: { cls: "border-amber-200 bg-amber-50 text-amber-700 animate-pulse", label: "جاري" },
    done: { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "تم" },
    failed: { cls: "border-rose-200 bg-rose-50 text-rose-700", label: "فشل" },
  };
  const s = map[page.status];
  return (
    <div className={"rounded-lg border px-2.5 py-2 " + s.cls}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold" dir="ltr">{page.fileName}</span>
        <span className="text-[10px] font-semibold">{s.label}</span>
      </div>
      {page.error && <p className="mt-1 line-clamp-2 text-[10px] text-rose-600">{page.error}</p>}
    </div>
  );
}

function LevelBadge({ level }: { level: LogEntry["level"] }) {
  const map = {
    info: { cls: "bg-slate-100 text-slate-600", Icon: InfoIcon, label: "معلومة" },
    success: { cls: "bg-emerald-100 text-emerald-700", Icon: CheckIcon, label: "نجاح" },
    warning: { cls: "bg-amber-100 text-amber-700", Icon: AlertIcon, label: "تنبيه" },
    error: { cls: "bg-rose-100 text-rose-700", Icon: AlertIcon, label: "خطأ" },
  } as const;
  const { cls, Icon, label } = map[level];
  return (
    <span className={"chip " + cls}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}
