import { Suspense } from "react";
import { NewLeadForm } from "@/components/admin/NewLeadForm";

export default function NewLeadPage() {
  return (
    <div className="mx-auto w-full max-w-[120rem] px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-slate-100" />}>
        <NewLeadForm />
      </Suspense>
    </div>
  );
}
