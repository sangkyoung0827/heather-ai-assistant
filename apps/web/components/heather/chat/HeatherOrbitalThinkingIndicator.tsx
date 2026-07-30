"use client";

export type OrbitalState = "analyzing" | "connecting" | "searching" | "composing" | "completed" | "warning" | "failed" | "cancelled";

export function HeatherOrbitalThinkingIndicator({ state }: { state: OrbitalState }) {
  return <svg className={`heather-orbital is-${state}`} viewBox="0 0 96 96" role="img" aria-label="Heather processing status">
    <g className="heather-orbital-orbit orbit-one"><ellipse cx="48" cy="48" rx="38" ry="15" /><circle cx="86" cy="48" r="3" /></g>
    <g className="heather-orbital-orbit orbit-two"><ellipse cx="48" cy="48" rx="32" ry="12" /><circle cx="80" cy="48" r="2.5" /></g>
    <g className="heather-orbital-orbit orbit-three"><ellipse cx="48" cy="48" rx="27" ry="10" /><circle cx="75" cy="48" r="2" /></g>
    <circle className="heather-orbital-halo" cx="48" cy="48" r="24" />
    <circle className="heather-orbital-core" cx="48" cy="48" r="15" />
    <circle className="heather-orbital-core-dot" cx="48" cy="48" r="5" />
  </svg>;
}
