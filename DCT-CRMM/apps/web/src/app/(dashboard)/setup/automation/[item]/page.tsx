import SetupSectionPage from "../../section-page";

const items = {
  workflows: { label: "Workflow Rules", description: "Automate follow-ups, notifications, and record changes.", href: "/workflows" },
};

export default async function AutomationSetupPage({ params }: { params: { item: string } }) {
  const item = items[params.item as keyof typeof items];
  return <SetupSectionPage title={item?.label || "Automation"} description={item?.description || "Keep operational work moving automatically."} items={item ? [item] : Object.values(items)} />;
}
