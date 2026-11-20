import type { LandingAsset, LandingProject } from "@/lib/project-landing";

export type IntakeProject = {
  public_id: string; name: string; project_type: "LAND_DEVELOPMENT" | "BUILDING" | "COMMERCIAL";
  status: string; city: string; province: string; address: string | null;
  progress: number | null; total_units: number; properties_count: number;
};
export type ProjectIntake = { project: IntakeProject; landing: LandingProject; assets: LandingAsset[]; can_edit: boolean; can_publish: boolean };
export type IntakeOption = { public_id: string; name: string; status: string; is_visible: boolean; updated_at: string; can_edit: boolean };
export type IntakeBasics = { name: string; project_type: string; city: string; province: string; address: string; status: string; progress: string; total_units: string };

export const emptyIntakeBasics: IntakeBasics = { name: "", project_type: "", city: "", province: "", address: "", status: "UNKNOWN", progress: "", total_units: "" };

export function intakeBasics(project: IntakeProject): IntakeBasics {
  return { name: project.name ?? "", project_type: project.project_type, city: project.city ?? "", province: project.province ?? "", address: project.address ?? "", status: project.status,
    progress: project.progress == null ? "" : String(project.progress), total_units: project.total_units ? String(project.total_units) : "" };
}

/** EVP-171: estados que exponen las unidades disponibles del proyecto (ProjectStatus::publicValues en la API). */
export const PUBLIC_PROJECT_STATUSES = ["PRE_SALE", "UNDER_CONSTRUCTION", "COMPLETED"];
export const publishesProject = (from: string, to: string) => PUBLIC_PROJECT_STATUSES.includes(to) && !PUBLIC_PROJECT_STATUSES.includes(from);

/** EVP-171: payload del PUT /admin/projects/{id} desde la ficha (datos básicos del ingreso más descripción). */
export function projectEditPayload(form: IntakeBasics, description: string) {
  return { ...intakePayload(form), description: description.trim() || null };
}

export function intakePayload(form: IntakeBasics) {
  if (!["LAND_DEVELOPMENT", "BUILDING", "COMMERCIAL"].includes(form.project_type)) throw new Error("Elegí el tipo de proyecto.");
  for (const field of ["name", "city", "province"] as const) if (!form[field].trim()) throw new Error("Completá nombre, ciudad y provincia.");
  const number = (value: string, maximum: number, label: string) => {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) throw new Error(`Revisá ${label}: ingresá un número entero entre 0 y ${maximum}.`);
    return Number(value);
  };
  return { name: form.name.trim(), project_type: form.project_type, city: form.city.trim(), province: form.province.trim(), address: form.address.trim() || null,
    status: form.status, progress: form.progress === "" ? null : number(form.progress, 100, "el avance"),
    total_units: form.total_units === "" ? 0 : number(form.total_units, 4294967295, "la cantidad de unidades") };
}
