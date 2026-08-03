import { AlertTriangle } from "lucide-react";

export function DeletedFileBanner() {
  return (
    <div className="bg-red-500/20 border-b border-red-500/50 p-2 flex items-center justify-center gap-2 text-red-400 text-sm shrink-0">
      <AlertTriangle className="w-4 h-4" />
      <span>This file was deleted remotely. If you save, it will be recreated.</span>
    </div>
  );
}
