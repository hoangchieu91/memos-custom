import { ScrollTextIcon } from "lucide-react";

const DocumentEditor = () => (
  <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-4xl mx-auto">
    <div className="mb-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ScrollTextIcon className="w-6 h-6 text-amber-500" />
        Biên bản Nghiệm thu
      </h1>
      <p className="text-sm text-muted-foreground mt-1">Soạn thảo biên bản kỹ thuật & Xuất PDF</p>
    </div>
    <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
      <ScrollTextIcon className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
      <h3 className="font-bold text-lg mb-2">Tính năng đang phát triển</h3>
      <p className="text-sm text-muted-foreground">Module soạn thảo biên bản sẽ bao gồm: Template biên bản, editor Markdown, và xuất PDF.</p>
    </div>
  </div>
);

export default DocumentEditor;
