import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatWidget } from "@/components/public/ChatWidget";

export const metadata: Metadata = { title: "Chat", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function WidgetPage({ params, searchParams }: {
  params: Promise<{ widgetId: string }>;
  searchParams: Promise<{ title?: string }>;
}) {
  const { widgetId } = await params;
  const { title } = await searchParams;
  if (!UUID.test(widgetId)) notFound();

  return <ChatWidget widgetId={widgetId} title={typeof title === "string" && title.length <= 60 ? title : undefined} />;
}
