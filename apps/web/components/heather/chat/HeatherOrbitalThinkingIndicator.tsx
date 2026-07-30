"use client";

export type OrbitalState = "analyzing" | "connecting" | "searching" | "validating" | "comparing" | "synthesizing" | "candidate_preparation" | "composing" | "completed" | "warning" | "failed" | "cancelled";

export function HeatherOrbitalThinkingIndicator({ state, mode = "personal", candidateCount = 0 }: { state: OrbitalState; mode?: "personal" | "research"; candidateCount?: number }) {
  const visibleNodes = Math.min(4, Math.max(0, candidateCount));
  return <svg className={`heather-orbital is-${state} is-${mode}`} viewBox="0 0 96 96" role="img" aria-label={mode === "research" ? "Heather research workflow status" : "Heather processing status"}>
    <g className="heather-orbital-orbit orbit-one"><ellipse cx="48" cy="48" rx="38" ry="15" /><circle cx="86" cy="48" r="3" /></g>
    <g className="heather-orbital-orbit orbit-two"><ellipse cx="48" cy="48" rx="32" ry="12" /><circle cx="80" cy="48" r="2.5" /></g>
    <g className="heather-orbital-orbit orbit-three"><ellipse cx="48" cy="48" rx="27" ry="10" /><circle cx="75" cy="48" r="2" /></g>
    {mode === "research" ? <g className="heather-orbital-research-nodes" aria-hidden="true">
      {[{ x: 19, y: 30 }, { x: 77, y: 27 }, { x: 76, y: 68 }, { x: 22, y: 68 }].map((node, index) => <circle key={`${node.x}-${node.y}`} className={index < visibleNodes ? "is-confirmed" : ""} cx={node.x} cy={node.y} r="2.6" />)}
      <path d="M22 68 L48 48 L76 68" />
    </g> : null}
    <circle className="heather-orbital-halo" cx="48" cy="48" r="24" />
    <circle className="heather-orbital-core" cx="48" cy="48" r="15" />
    <circle className="heather-orbital-core-dot" cx="48" cy="48" r="5" />
  </svg>;
}
