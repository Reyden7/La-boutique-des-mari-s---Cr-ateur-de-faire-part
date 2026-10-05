import type { ReactNode } from "react";
import { PreviewDeviceSwitcher } from "./PreviewDeviceSwitcher";
import { ZoomControls } from "./ZoomControls";

/** Editor-only chrome, anchored to the central grid cell rather than its scroll content. */
export function EditorWorkspace({ pageName, children }: { pageName?: string; children: ReactNode }) {
  return <main className="editor-workspace">
    <div className="editor-preview-toolbar">
      {pageName && <div className="workspace-label" title={pageName}>{pageName}</div>}
      <PreviewDeviceSwitcher />
    </div>
    <div className="editor-main">{children}</div>
    <ZoomControls />
  </main>;
}
