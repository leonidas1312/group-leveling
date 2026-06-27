import WorkflowMonitor from "./workflow-monitor";

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkflowMonitor id={id} />;
}
