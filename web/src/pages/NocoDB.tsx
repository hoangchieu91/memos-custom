import { ExternalLinkIcon, DatabaseIcon } from "lucide-react";

const NocoDB = () => {
  return (
    <div className="w-full h-[calc(100vh-4rem)] bg-background flex flex-col items-center justify-center gap-6">
      <div className="text-center space-y-4">
        <DatabaseIcon className="w-16 h-16 mx-auto text-violet-500 opacity-70" />
        <h1 className="text-2xl font-bold">NocoDB CRM</h1>
        <p className="text-muted-foreground max-w-md">
          NocoDB không thể nhúng iframe qua HTTPS (Mixed Content). Click bên dưới để mở trong tab mới.
        </p>
        <a
          href="http://10.25.7.212:8080"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-colors shadow-lg"
        >
          <ExternalLinkIcon className="w-5 h-5" />
          Mở NocoDB
        </a>
      </div>
    </div>
  );
};

export default NocoDB;
