export function buildStoragePath(pageData: any, config: AppConfig, context: { curriculum?: string, grade: string, term: string, part?: string }): string {
  // اختيار المنهج الديناميكي (افتراضياً 'sanaa' أو القيمة المحددة من الإعدادات/الواجهة)
  const curriculumFolder = sanitizeColumnName(context.curriculum || config.curriculum || 'sanaa');
  const gradeFolder = sanitizeColumnName(context.grade || 'general');
  const subjectFolder = sanitizeColumnName(config.subject || 'book');
  const partFolder = context.part ? sanitizeColumnName(context.part) : '';
  const termFolder = sanitizeColumnName(context.term || 'term1');
  const fileName = pageData.fileName;

  // بناء المسار المباشر: المنهج / الصف / المادة / الجزء / الترم / الملف
  const pathSegments = [
    curriculumFolder,
    gradeFolder,
    subjectFolder,
    partFolder,
    termFolder,
    fileName
  ].filter(Boolean);

  return pathSegments.join('/');
}
