"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Globe2 } from "lucide-react";
import type { Stats } from "./types";

// World-atlas TopoJSON — loaded from a CDN at runtime. react-simple-maps
// fetches this; if it fails (sandbox network), we fall back to the bar list.
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Map our country names (from the stats API) to ISO numeric codes used by
// world-atlas. Only countries that appear in our threat data need mapping.
const NAME_TO_ID: Record<string, number> = {
  "United States": 840,
  "Germany": 276,
  "Japan": 392,
  "Taiwan": 158,
  "Netherlands": 528,
  "India": 356,
  "United Kingdom": 826,
  "France": 250,
  "China": 156,
  "South Korea": 410,
  "Canada": 124,
  "Italy": 380,
  "Spain": 724,
  "Russia": 643,
  "Brazil": 76,
  "Australia": 36,
  "Mexico": 484,
  "Sweden": 752,
  "Switzerland": 756,
  "Poland": 616,
  "Turkey": 792,
  "Israel": 376,
  "Singapore": 702,
  "Ireland": 372,
  "Belgium": 56,
  "Austria": 40,
  "Norway": 578,
  "Denmark": 208,
  "Finland": 246,
  "Portugal": 620,
  "Czech Republic": 203,
  "Romania": 642,
  "Ukraine": 804,
  "Thailand": 764,
  "Malaysia": 458,
  "Indonesia": 360,
  "Argentina": 32,
  "Chile": 152,
  "Colombia": 170,
  "South Africa": 710,
  "Saudi Arabia": 682,
  "UAE": 784,
  "Iran": 364,
  "Egypt": 818,
};

function heatFill(ratio: number): string {
  if (ratio <= 0) return "#1e293b";
  if (ratio < 0.25) return "#0e7490"; // cyan-700
  if (ratio < 0.5) return "#0891b2"; // cyan-600
  if (ratio < 0.75) return "#f59e0b"; // amber-500
  return "#f43f5e"; // rose-500
}

export function WorldMap({ stats }: { stats: Stats | null }) {
  const [geoError, setGeoError] = useState(false);

  const countryData = useMemo(() => {
    const byName = new Map<string, number>();
    for (const c of stats?.byCountry ?? []) {
      byName.set(c.name, c.count);
    }
    const byId = new Map<number, { name: string; count: number }>();
    for (const [name, count] of byName) {
      const id = NAME_TO_ID[name];
      if (id) byId.set(id, { name, count });
    }
    return { byName, byId };
  }, [stats]);

  const maxCount = useMemo(
    () => Math.max(1, ...(stats?.byCountry ?? []).map((c) => c.count)),
    [stats],
  );
  const total = (stats?.byCountry ?? []).reduce((s, c) => s + c.count, 0);

  return (
    <Card className="border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Globe2 className="h-4 w-4 text-cyan-400" /> Global Threat Distribution
          </h3>
          <p className="text-[11px] text-slate-400">
            {total} threats across {stats?.byCountry.length ?? 0} countries · choropleth by threat density
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>low</span>
          <div className="flex h-2.5 w-28 overflow-hidden rounded">
            <div className="flex-1" style={{ background: "#1e293b" }} />
            <div className="flex-1" style={{ background: "#0e7490" }} />
            <div className="flex-1" style={{ background: "#0891b2" }} />
            <div className="flex-1" style={{ background: "#f59e0b" }} />
            <div className="flex-1" style={{ background: "#f43f5e" }} />
          </div>
          <span>high</span>
        </div>
      </div>

      {!geoError ? (
        <div className="relative h-[260px] w-full overflow-hidden rounded-lg bg-slate-950/40">
          <ComposableMap
            projectionConfig={{ scale: 130, center: [0, 20] }}
            width={760}
            height={260}
            style={{ width: "100%", height: "100%" }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: Array<{ id: string; properties: { name: string } }> }) => {
                return geographies.map((geo, idx) => {
                  const id = parseInt(geo.id, 10);
                  const data = countryData.byId.get(id);
                  const count = data?.count ?? 0;
                  const ratio = count / maxCount;
                  return (
                    <TooltipProvider key={geo.id || `geo-${idx}`} delayDuration={80}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Geography
                            geography={geo}
                            fill={count > 0 ? heatFill(ratio) : "#0f172a"}
                            stroke="#1e293b"
                            strokeWidth={0.4}
                            style={{
                              default: { outline: "none", transition: "fill 150ms" },
                              hover: { fill: count > 0 ? "#22d3ee" : "#1e293b", outline: "none" },
                              pressed: { outline: "none" },
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="border-slate-700 bg-slate-900 text-xs">
                          <p className="font-medium text-slate-100">{data?.name ?? geo.properties.name}</p>
                          <p className="text-slate-400">{count} threat{count === 1 ? "" : "s"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                });
              }}
            </Geographies>
          </ComposableMap>
        </div>
      ) : (
        // Fallback: bar list (same as the old GeoDistribution).
        <div className="space-y-1.5">
          {(stats?.byCountry ?? []).map((c) => {
            const ratio = c.count / maxCount;
            return (
              <div key={c.name} className="flex items-center gap-2 text-[11px]">
                <span className="w-28 shrink-0 truncate text-slate-300">{c.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: heatFill(ratio) }} />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-slate-400">{c.count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Top countries list */}
      <div className="mt-3 border-t border-slate-800 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Top Countries</p>
        <div className="flex flex-wrap gap-1.5">
          {(stats?.byCountry ?? []).slice(0, 8).map((c) => (
            <Badge
              key={c.name}
              variant="outline"
              className="border-slate-600 bg-slate-800/40 px-1.5 text-[10px] text-slate-300"
            >
              {c.name} <span className="ml-1 font-mono text-cyan-300">{c.count}</span>
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
}
