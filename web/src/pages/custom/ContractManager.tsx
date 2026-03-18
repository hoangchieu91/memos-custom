import { FileTextIcon } from "lucide-react";

const ContractManager = () => (
  <div className="w-full min-h-screen bg-background text-foreground px-4 py-6 max-w-4xl mx-auto">
    <div className="mb-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileTextIcon className="w-6 h-6 text-violet-500" />
        Quản lý Hợp đồng
      </h1>
      <p className="text-sm text-muted-foreground mt-1">Hợp đồng A/B, trạng thái, cảnh báo hết hạn</p>
    </div>
    <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
      <FileTextIcon className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
      <h3 className="font-bold text-lg mb-2">Tính năng đang phát triển</h3>
      <p className="text-sm text-muted-foreground">Module quản lý hợp đồng sẽ bao gồm: Danh sách hợp đồng, trạng thái ký kết, và cảnh báo hết hạn.</p>
    </div>
  </div>
);

export default ContractManager;
