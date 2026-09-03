import LeadDetailView from "@/components/admin/LeadDetailView";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;

  return <LeadDetailView leadId={id} />;
}
