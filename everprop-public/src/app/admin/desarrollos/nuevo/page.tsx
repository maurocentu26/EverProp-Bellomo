import { Suspense } from "react";
import ProjectIntakeForm from "@/components/admin/ProjectIntakeForm";

export default function NewProjectPage() {
  return <Suspense fallback={<p role="status">Cargando ingreso de proyectos…</p>}><ProjectIntakeForm /></Suspense>;
}
