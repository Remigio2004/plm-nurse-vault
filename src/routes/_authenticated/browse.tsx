import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { FolderView } from "@/components/browse/FolderView";
import { RecordsTable } from "@/components/browse/RecordsTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/browse")({
  head: () => ({
    meta: [
      { title: "Browse Folders — NurseVault" },
      {
        name: "description",
        content:
          "Navigate nursing student records by batch, classification and student, or search the students table.",
      },
      { property: "og:title", content: "Browse Folders — NurseVault" },
      {
        property: "og:description",
        content:
          "Navigate records by batch, classification and student, or search the students table.",
      },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  return (
    <TooltipProvider delayDuration={200}>
      <AppShell
        title="Browse Folders"
        description="Batch → Classification → Student → Folder → files."
      >
        <Tabs defaultValue="folders" className="space-y-6">
          <TabsList className="rounded-xl bg-muted p-1">
            <TabsTrigger
              value="folders"
              className="rounded-lg px-4 data-[state=active]:bg-background data-[state=active]:text-primary"
            >
              Folder View
            </TabsTrigger>
            <TabsTrigger
              value="table"
              className="rounded-lg px-4 data-[state=active]:bg-background data-[state=active]:text-primary"
            >
              Records Table
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folders" className="space-y-5">
            <FolderView />
          </TabsContent>

          <TabsContent value="table" className="space-y-5">
            <RecordsTable />
          </TabsContent>
        </Tabs>
      </AppShell>
    </TooltipProvider>
  );
}
