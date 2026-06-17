import { ExternalLinkIcon, WorkflowIcon } from "lucide-react";

const N8n = () => {
  return (
    <div className="w-full h-[calc(100vh-4rem)] bg-background flex flex-col items-center justify-center gap-6">
      <div className="text-center space-y-4">
        <WorkflowIcon className="w-16 h-16 mx-auto text-orange-500 opacity-70" />
        <h1 className="text-2xl font-bold">n8n Automation</h1>
        <p className="text-muted-foreground max-w-md">
          n8n không thể nhúng iframe qua HTTPS (X-Frame-Options). Click bên dưới để mở trong tab mới.
        </p>
        <a
          href={`http://${window.location.hostname}:5678`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition-colors shadow-lg"
        >
          <ExternalLinkIcon className="w-5 h-5" />
          Mở n8n
        </a>
      </div>
    </div>
  );
};

export default N8n;
