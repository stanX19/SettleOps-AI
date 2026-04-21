import { InputsPane } from "@/components/dashboard/InputsPane"
import { WorkflowPane } from "@/components/dashboard/WorkflowPane"
import { BlackboardPane } from "@/components/dashboard/BlackboardPane"
import { ActionBar } from "@/components/dashboard/ActionBar"

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full w-full bg-neutral-background">
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Inputs */}
        <div className="w-[290px] min-w-[290px] h-full border-r border-neutral-border bg-neutral-surface overflow-hidden">
          <InputsPane />
        </div>

        {/* Middle Pane: Workflow */}
        <div className="flex-1 min-w-[560px] h-full border-r border-neutral-border bg-neutral-background flex flex-col relative">
          <WorkflowPane />
        </div>

        {/* Right Pane: Blackboard */}
        <div className="w-[290px] min-w-[290px] h-full bg-neutral-surface flex flex-col">
          <BlackboardPane />
        </div>
      </div>
      
      {/* Bottom Action Bar */}
      <ActionBar />
    </div>
  )
}
