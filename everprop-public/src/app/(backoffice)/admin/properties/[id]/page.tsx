import PropertyDetailView from "@/components/admin/PropertyDetailView";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function PropertyDetailPage({ params }: Props) {
  const { id } = await params;

  return <PropertyDetailView propertyId={id} />;
}
