import { Suspense } from "react";
import { NewLeadForm } from "@/components/admin/NewLeadForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LeadEditPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-[120rem] px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-900" />}>
        <NewLeadForm leadId={id} isEditing={true} />
      </Suspense>
    </div>
  );
}
