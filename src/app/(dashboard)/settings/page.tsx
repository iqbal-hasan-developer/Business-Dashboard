import { Settings } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function SettingsPage() {
  return <><PageHeading title="Settings" description="Review the development connection state without changing business data." /><Empty className="panel min-h-80"><EmptyHeader><EmptyMedia variant="icon"><Settings /></EmptyMedia><EmptyTitle>Settings editing is not enabled</EmptyTitle><EmptyDescription>The application connection is read-only during this checkpoint. No defaults or financial settings can be changed.</EmptyDescription></EmptyHeader></Empty></>;
}
