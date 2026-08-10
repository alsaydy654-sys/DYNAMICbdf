/*
  قراءة شجرة سراج (المنهج ← الصف ← المادة) للاختيار من قيم موجودة فعلاً.
  قراءة فقط بمفتاح anon — لا كتابة ولا تعديل على أي صف.
*/
import { supabase } from "./supabase";

export interface Curriculum {
  id: string;
  name: string;
  version: string | null;
}

export interface Grade {
  id: string;
  name: string;
  level: number | null;
  stage: string | null;
}

export interface Subject {
  id: string;
  name: string;
}

/**
 * أسماء المناهج الصالحة للرفع: التي تملك صفوفاً فعلاً.
 * الأسماء مكرّرة بين نسخ المناهج، ومنها ما لا صفوف له إطلاقاً، فنشتقّها من `grades`
 * حتى لا يقع الاختيار على منهج تظهر قوائمه فارغة.
 */
export async function fetchCurriculumNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from("grades")
    .select("curricula!inner(name,is_active)")
    .eq("curricula.is_active", true);
  if (error) throw new Error(`تعذّر قراءة المناهج من سراج: ${error.message}`);
  // يُرجِع PostgREST العلاقة ككائن واحد، وإن كان نوع العميل يصفها مصفوفة
  const rows = data as unknown as { curricula: { name: string } | { name: string }[] }[];
  const names = rows.flatMap((row) =>
    Array.isArray(row.curricula) ? row.curricula.map((c) => c.name) : [row.curricula.name]
  );
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "ar"));
}

export async function fetchGradeNames(curriculumName: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("grades")
    .select("id,name,level,stage,curricula!inner(name)")
    .eq("curricula.name", curriculumName)
    .order("level", { ascending: true });
  if (error) throw new Error(`تعذّر قراءة الصفوف من سراج: ${error.message}`);
  return Array.from(new Set((data as Grade[]).map((g) => g.name)));
}

export async function fetchSubjectNames(
  curriculumName: string,
  gradeName: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("id,name,grades!inner(name,curricula!inner(name))")
    .eq("grades.name", gradeName)
    .eq("grades.curricula.name", curriculumName)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`تعذّر قراءة المواد من سراج: ${error.message}`);
  return Array.from(new Set((data as Subject[]).map((s) => s.name)));
}
