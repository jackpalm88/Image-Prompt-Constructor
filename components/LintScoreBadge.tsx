import React from "react";

export function LintScoreBadge({ quality }: { quality: "Green"|"Amber"|"Red" }) {
  const map = {
    Green: { cls: "bg-green-100 text-green-800", label: "Green ✓" },
    Amber: { cls: "bg-yellow-100 text-yellow-800", label: "Amber !" },
    Red:   { cls: "bg-red-100 text-red-800", label: "Red ✖" }
  } as const;
  const { cls, label } = map[quality] || map.Amber;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`} title={
    quality==="Green" ? "passes lint checks" :
    quality==="Amber" ? "usable; consider refining" :
    "fix issues to save"
  }>{label}</span>;
}
