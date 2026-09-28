import SetupSectionPage from "../../section-page";

const items = {
  "round-robin": { label: "Round Robin", description: "Configure automatic lead assignment pools.", href: "/setup/customization/round-robin" },
  objects: { label: "Object Manager", description: "Create and configure CRM objects and fields.", href: "/admin/object-manager" },
};

export default async function CustomizationSetupPage({ params }: { params: { item: string } }) {
  const item = items[params.item as keyof typeof items];
  return <SetupSectionPage title={item?.label || "Customization"} description={item?.description || "Shape CRM data and user experiences."} items={item ? [item] : Object.values(items)} />;
}
