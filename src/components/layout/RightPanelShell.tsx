/**
 * Client shell for the right panel — handles collapse/expand toggle.
 * The actual panel content is rendered server-side and passed as children.
 */

"use client";

import { useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

interface RightPanelShellProps {
  children: React.ReactNode;
  hasContent: boolean;
}

export default function RightPanelShell({ children, hasContent }: RightPanelShellProps) {
  const [collapsed, setCollapsed] = useState(!hasContent);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-l border-gray-200 bg-gray-50 w-10 py-4">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          title="Show AI insights"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-72 border-l border-gray-200 bg-gray-50 overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Insights</span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          title="Collapse panel"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 p-4 space-y-5">
        {children}
      </div>
    </aside>
  );
}
