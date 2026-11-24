import WorkspaceShell from "@/components/site/workspace-shell";
import SignalInspector from "@/components/site/signal-inspector";

export const metadata = {
  title: "Asset inspector | Rarebird",
  description: "Inspect source evidence, market measurements and review checks for Rarebird’s six pilot assets.",
  alternates: { canonical: "/app/asset-inspector" },
};

export default function AssetInspectorPage() {
  return <WorkspaceShell active="/app/asset-inspector" title="Asset inspector">
    <SignalInspector />
  </WorkspaceShell>;
}
