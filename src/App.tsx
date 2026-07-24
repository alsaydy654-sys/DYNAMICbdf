import { useState } from "react";
import { AppConfig } from "./types";
import { loadConfig, saveConfig } from "./config";
import SettingsPanel from "./components/SettingsPanel";
import Uploader from "./components/Uploader";
import GalleryView from "./components/GalleryView";
import { SparkleIcon } from "./components/icons";

type Tab = "processor" | "gallery" | "settings";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("processor");
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());

  const handleConfigChange = (next: AppConfig) => {
    setConfig(next);
    saveConfig(next);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-600/30">
              <SparkleIcon className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold text-slate-800">معالج كتب PDF</h1>
              <p className="text-xs text-slate-500">تحويل ورفع صفحات الكتب المدرسية إلى Supabase</p>
            </div>
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-xs text-slate-400">الجدول الهدف</p>
            <p className="font-mono text-sm font-semibold text-emerald-600" dir="ltr">
              {config.tableName}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("processor")}
            className={`pb-3 px-6 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "processor"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            معالجة ورفع الكتب
          </button>
          <button
            onClick={() => setActiveTab("gallery")}
            className={`pb-3 px-6 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "gallery"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            معاينة الصور المسجلة (قاعدة البيانات)
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`pb-3 px-6 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "settings"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            إعدادات المسارات والجداول
          </button>
        </div>
        {/* محتوى التبويبات */}
        {activeTab === "processor" && (
          <Uploader config={config} onViewGallery={() => setActiveTab("gallery")} />
        )}
        {activeTab === "gallery" && <GalleryView config={config} />}
        {activeTab === "settings" && (
          <SettingsPanel config={config} onChange={handleConfigChange} />
        )}

        <footer className="pt-2 text-center text-xs text-slate-400">
          يتم حفظ الإعدادات محليًا في المتصفح · المعالجة تتم داخل المتصفح
        </footer>
      </main>
    </div>
  );
}
