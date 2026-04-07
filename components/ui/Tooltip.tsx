"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export default function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  function show() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const GAP = 8;
    let top = 0;
    let left = 0;
    if (side === "top") {
      top = rect.top - GAP;
      left = rect.left + rect.width / 2;
    } else if (side === "bottom") {
      top = rect.bottom + GAP;
      left = rect.left + rect.width / 2;
    } else if (side === "left") {
      top = rect.top + rect.height / 2;
      left = rect.left - GAP;
    } else {
      top = rect.top + rect.height / 2;
      left = rect.right + GAP;
    }
    setCoords({ top, left });
    setVisible(true);
  }

  useEffect(() => {
    if (!visible) return;
    function hide() { setVisible(false); }
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [visible]);

  const transformMap: Record<string, string> = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0%)",
    left: "translate(-100%, -50%)",
    right: "translate(0%, -50%)",
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        className={cn("inline-flex items-center", className)}
      >
        {children}
      </span>

      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: transformMap[side],
              zIndex: 9999,
              pointerEvents: "none",
            }}
          >
            {/* Arrow */}
            {side === "top" && (
              <div className="flex justify-center">
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#1e2433]" />
              </div>
            )}

            <div
              className={cn(
                "max-w-[240px] px-3 py-2 rounded-lg text-xs leading-relaxed",
                "bg-[#1e2433] text-slate-200 border border-white/10 shadow-xl",
                side === "top" && "-mt-1",
                side === "bottom" && "mt-1"
              )}
            >
              {content}
            </div>

            {side === "bottom" && (
              <div className="flex justify-center -mt-px">
                <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-[#1e2433]" />
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
