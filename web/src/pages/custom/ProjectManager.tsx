import { BriefcaseIcon } from "lucide-react";

const ProjectManager = () => (
  <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-4xl mx-auto">
    <div className="mb-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <BriefcaseIcon className="w-6 h-6 text-blue-500" />
        Quản lý Dự án
      </h1>
      <p className="text-sm text-muted-foreground mt-1">Catalog, Kanban tiến độ & Xuất báo cáo</p>
    </div>
    <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
      <BriefcaseIcon className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
      <h3 className="font-bold text-lg mb-2">Tính năng đang phát triển</h3>
      <p className="text-sm text-muted-foreground">Module quản lý dự án sẽ bao gồm: Danh mục dự án, Kanban tiến độ, và xuất báo cáo PDF.</p>
    </div>
  </div>
);

export default ProjectManager;
