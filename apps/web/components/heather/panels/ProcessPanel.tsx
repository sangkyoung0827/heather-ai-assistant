"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Beaker, BookOpen, CheckCircle2, ClipboardList, FlaskConical, Loader2, Pause, Play, RotateCcw, Sparkles, Thermometer, Waves } from "lucide-react";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";

type Phase = { phase_name: string; start_hour: number; end_hour: number; temperature_c: number; ph_target: number; do_target_percent: number; agitation_rpm_max: number; aeration_vvm_max: number; glucose_feed_rate: number; nitrogen_feed_rate: number; carbon_nitrogen_state: string };
type Plan = { profile_id: string; objective: string; total_duration_hours: number; sampling_interval_hours: number; working_volume_l: number; vessel_volume_l: number; phases: Phase[]; assumptions: string[]; warnings: string[]; random_seed: number };
type Point = { time_h: number; phase: string; temperature_c: number; ph: number; dissolved_oxygen_percent: number; agitation_rpm: number; aeration_vvm: number; glucose_g_l: number; biomass_g_l: number; total_lipid_g_l: number; dha_g_l: number; dha_percent_total_fatty_acids: number; viscosity_index: number; contamination_risk: number; productivity_g_l_h: number; warning_codes: string[] };
type Result = { plan: Plan; time_series: Point[]; final_metrics: Record<string, number>; recommended_harvest_hour: number; simulation_disclaimer: string; analysis: Array<{ statement: string; evidence_level: string; confidence: number }>; next_experiments: Array<{ type: string; title: string; proposed_changes: string; requires_user_approval: boolean }>; memory_candidate: { status: string; content: string } };
type Experiment = { id: string; title: string; status: string; profile_id: string; created_at: string; final_result?: Result | null };
type LiteratureSource = { title: string; url: string; authors?: string[]; journal?: string; published_at?: string; verification_level?: string };

const EXAMPLE = "초기 48시간은 28°C에서 세포 성장에 집중하고 DO를 20% 이상으로 유지해줘. 그 이후에는 온도를 25°C로 낮추고 질소를 제한하면서 포도당을 fed-batch로 공급해 DHA 축적을 유도해줘. 총 120시간 운전하고 안정성도 고려해줘.";

export function ProcessPanel() {
  const [instruction, setInstruction] = useState(EXAMPLE);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [activeExperimentId, setActiveExperimentId] = useState<string | null>(null);
  const [literature, setLiterature] = useState<LiteratureSource[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"simulation" | "records" | "analysis" | "next" | "model">("simulation");

  const activePoint = useMemo(() => {
    if (!result?.time_series.length) return null;
    return result.time_series[Math.min(result.time_series.length - 1, Math.round((result.time_series.length - 1) * progress / 100))];
  }, [progress, result]);

  useEffect(() => {
    void (async () => {
      try {
        const session = await getSupabaseBrowserClient()?.auth.getSession();
        const accessToken = session?.data.session?.access_token;
        if (!accessToken) return;
        const response = await fetch("/api/production?path=experiments", { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!response.ok) return;
        const payload = await response.json() as { experiments?: Experiment[] };
        setExperiments(payload.experiments || []);
      } catch {
        // The panel remains usable before a user signs in or migration 008 is applied.
      }
    })();
  }, []);

  async function token() {
    const session = await getSupabaseBrowserClient()?.auth.getSession();
    return session?.data.session?.access_token || null;
  }

  async function call(path: string, method: "GET" | "POST", body?: unknown) {
    const accessToken = await token();
    if (!accessToken) throw new Error("생산공정 시뮬레이션을 사용하려면 먼저 로그인하세요.");
    const response = await fetch(`/api/production?path=${encodeURIComponent(path)}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "요청을 완료하지 못했습니다.");
    return payload;
  }

  async function loadExperiments() {
    try {
      const payload = await call("experiments", "GET") as { experiments?: Experiment[] };
      setExperiments(payload.experiments || []);
    } catch {
      // The panel remains usable before a user signs in or migration 008 is applied.
    }
  }

  async function parsePlan() {
    setLoading(true); setError("");
    try {
      const payload = await call("parse", "POST", { instruction }) as { plan: Plan };
      setPlan(payload.plan); setResult(null); setProgress(0);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "조건을 해석하지 못했습니다."); }
    finally { setLoading(false); }
  }

  async function runSimulation() {
    if (!plan) return;
    setLoading(true); setError("");
    try {
      const created = await call("experiments", "POST", { instruction, plan, title: "DHA staged fed-batch simulation" }) as { experiment: Experiment };
      const payload = await call(`experiments/${created.experiment.id}/run`, "POST") as { result: Result };
      setActiveExperimentId(created.experiment.id); setLiterature([]); setResult(payload.result); setRunning(true); setProgress(0); setTab("simulation");
      const started = Date.now();
      const timer = window.setInterval(() => {
        const next = Math.min(100, Math.round((Date.now() - started) / 90));
        setProgress(next);
        if (next >= 100) { window.clearInterval(timer); setRunning(false); }
      }, 80);
      void loadExperiments();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "시뮬레이션을 실행하지 못했습니다."); }
    finally { setLoading(false); }
  }

  async function discoverLiterature() {
    if (!activeExperimentId) return;
    setLoading(true); setError("");
    try {
      const payload = await call(`experiments/${activeExperimentId}/literature`, "POST") as { sources?: LiteratureSource[] };
      setLiterature(payload.sources || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "문헌을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }

  return <section className="production-process" aria-live="polite">
    <header className="production-header"><div><span>PRODUCTION PROCESS MANAGEMENT</span><h2>생산공정관리 <em>연구용 시뮬레이션</em></h2><p>Schizochytrium-like 해양성 종속영양 미생물 기반 DHA 생산 모델입니다.</p></div><div className="production-status"><strong>{experiments.length}</strong><small>누적 시뮬레이션</small><span>v1.0.0</span></div></header>
    <p className="production-disclaimer"><AlertTriangle /> 실제 배양 결과를 보증하지 않음 · 실제 생산공정 적용 전 실험실 검증 필요</p>
    <nav className="production-tabs" aria-label="생산공정관리 탭">{([ ["simulation", "공정 시뮬레이션", FlaskConical], ["records", "실험 기록", ClipboardList], ["analysis", "분석 및 논문", BookOpen], ["next", "다음 실험", Sparkles], ["model", "모델 정보", Beaker] ] as const).map(([id, label, Icon]) => <button key={id} type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}><Icon />{label}</button>)}</nav>
    {tab === "simulation" && <div className="production-grid"><section className="digital-twin-card"><DigitalTwin point={activePoint} progress={progress} running={running} /><div className="twin-stage"><strong>{activePoint?.phase || "대기"}</strong><span>{activePoint ? `${activePoint.time_h} h / ${result?.plan.total_duration_hours} h` : "실행 전"}</span></div></section><section className="production-command"><label><span>내용</span><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="온도 28°C, pH 5.8, DO 25% 이상으로 세포를 먼저 성장시킨 뒤..." /></label><div className="production-actions"><button type="button" className="production-secondary" onClick={() => { setInstruction(EXAMPLE); setPlan(null); setResult(null); setProgress(0); }}>초기화</button><button type="button" className="production-secondary" onClick={() => setInstruction("지난 실험보다 생산량은 유지하면서 DHA 비율을 높이고 안정적으로 운전해줘.")}>추천조건 불러오기</button><button type="button" className="production-primary" disabled={loading} onClick={() => void parsePlan()}>{loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} 조건 해석</button></div>{plan && <PlanReview plan={plan} />}{plan && <button type="button" className="production-run" disabled={loading || running} onClick={() => void runSimulation()}>{loading ? <Loader2 className="animate-spin" /> : <Play />} 사용자 승인 후 시뮬레이션 실행</button>}{error && <p className="production-error"><AlertTriangle />{error}</p>}</section></div>}
    {tab === "simulation" && result && <SimulationOutput result={result} point={activePoint} progress={progress} running={running} />}
    {tab === "records" && <ExperimentRecords experiments={experiments} onOpen={(experiment) => { if (experiment.final_result) { setActiveExperimentId(experiment.id); setResult(experiment.final_result); setProgress(100); setTab("simulation"); } }} />}
    {tab === "analysis" && <Analysis result={result} literature={literature} loading={loading} onDiscover={() => void discoverLiterature()} />}
    {tab === "next" && <Recommendations result={result} />}
    {tab === "model" && <ModelInformation />}
  </section>;
}

function DigitalTwin({ point, progress, running }: { point: Point | null; progress: number; running: boolean }) {
  const fill = Math.max(.25, Math.min(.84, .28 + (point?.biomass_g_l || 0) / 115));
  const bubbles = Math.max(2, Math.round((point?.aeration_vvm || .3) * 12));
  return <div className="digital-twin" data-running={running}><svg viewBox="0 0 620 370" role="img" aria-label="DHA production process digital twin"><defs><linearGradient id="broth" x1="0" x2="1"><stop stopColor="#2ca7c6" stopOpacity={fill} /><stop offset="1" stopColor="#6657b9" stopOpacity={fill + .08} /></linearGradient></defs><path className="twin-pipe" d="M52 110H170M450 115H570M500 280H594"/><rect x="184" y="55" width="256" height="270" rx="100" className="twin-tank"/><path d={`M190 290V${290 - 205 * fill}Q312 ${270 - 205 * fill} 434 ${290 - 205 * fill}V290Z`} fill="url(#broth)"/><path className="twin-feed glucose" d="M80 110H184"/><path className="twin-feed nitrogen" d="M568 115H440"/><g className="twin-impeller" style={{ transform: `rotate(${progress * (point?.agitation_rpm || 0) / 28}deg)`, transformOrigin: "312px 225px" }}><path d="M254 225H370M312 175V275"/><circle cx="312" cy="225" r="12"/></g>{Array.from({ length: bubbles }).map((_, index) => <circle key={index} className="twin-bubble" cx={260 + index * 12} cy={280 - (index % 4) * 18 - progress * .5} r={2 + index % 3}/>) }<rect x="260" y="18" width="104" height="38" rx="8" className="twin-motor"/><text x="312" y="42" textAnchor="middle">MOTOR</text><g className="twin-sensors"><text x="456" y="170">T {point?.temperature_c?.toFixed(1) || "--"}°C</text><text x="456" y="200">pH {point?.ph?.toFixed(2) || "--"}</text><text x="456" y="230">DO {point?.dissolved_oxygen_percent?.toFixed(1) || "--"}%</text></g><text x="44" y="92">GLUCOSE FEED</text><text x="462" y="96">NITROGEN FEED</text><text x="496" y="306">HARVEST</text></svg><div className="twin-live"><span><Thermometer />{point?.temperature_c?.toFixed(1) || "--"}°C</span><span><Waves />DO {point?.dissolved_oxygen_percent?.toFixed(1) || "--"}%</span><span>RPM {Math.round(point?.agitation_rpm || 0)}</span></div></div>;
}

function PlanReview({ plan }: { plan: Plan }) { return <div className="plan-review"><strong>해석된 조건</strong><p>{plan.profile_id} · {plan.total_duration_hours} h · {plan.working_volume_l}/{plan.vessel_volume_l} L · seed {plan.random_seed}</p>{plan.phases.map((phase) => <div key={phase.phase_name}><b>{phase.phase_name}</b><span>{phase.start_hour}-{phase.end_hour} h · {phase.temperature_c}°C · pH {phase.ph_target} · DO {phase.do_target_percent}% · {phase.carbon_nitrogen_state}</span></div>)}<small>자동 보완: {plan.assumptions.join(" ")}</small>{plan.warnings.map((warning) => <small key={warning} className="is-warning">주의: {warning}</small>)}</div>; }

function SimulationOutput({ result, point, progress, running }: { result: Result; point: Point | null; progress: number; running: boolean }) { const series = result.time_series; const maxDha = Math.max(...series.map((item) => item.dha_g_l), 1); return <section className="simulation-output"><header><div><span>{running ? "시간 가속 실행 중" : "시뮬레이션 완료"}</span><h3>{Math.round(progress)}% · 권장 수확 {result.recommended_harvest_hour} h</h3></div>{running ? <Pause /> : <CheckCircle2 />}</header><div className="simulation-metrics">{([ ["Biomass", point?.biomass_g_l, "g/L"], ["Lipid", point?.total_lipid_g_l, "g/L"], ["DHA", point?.dha_g_l, "g/L"], ["DHA %", point?.dha_percent_total_fatty_acids, "%"], ["pH", point?.ph, ""], ["DO", point?.dissolved_oxygen_percent, "%"] ] as Array<[string, number | undefined, string]>).map(([label, value, unit]) => <div key={label}><span>{label}</span><strong>{value?.toFixed(label === "pH" ? 2 : 2) || "--"}<small>{unit}</small></strong></div>)}</div><div className="production-chart"><svg viewBox="0 0 600 150" aria-label="DHA time series"><polyline points={series.map((item, index) => `${index / Math.max(series.length - 1, 1) * 580 + 10},${135 - item.dha_g_l / maxDha * 115}`).join(" ")} /><line x1="10" y1="136" x2="590" y2="136" /></svg><p>시간대별 DHA g/L · 내부 시간축을 유지한 가속 시각화</p></div><p className="production-disclaimer"><AlertTriangle />{result.simulation_disclaimer}</p></section>; }

function ExperimentRecords({ experiments, onOpen }: { experiments: Experiment[]; onOpen: (experiment: Experiment) => void }) { return <section className="production-records"><header><h3>실험 기록</h3><span>개인 시뮬레이션만 표시</span></header>{experiments.length ? experiments.map((experiment) => <button type="button" key={experiment.id} onClick={() => onOpen(experiment)}><div><strong>{experiment.title}</strong><small>{new Date(experiment.created_at).toLocaleString("ko-KR")} · {experiment.profile_id}</small></div><span>{experiment.status}</span>{experiment.final_result?.final_metrics ? <em>DHA {experiment.final_result.final_metrics.final_dha_g_l?.toFixed(2)} g/L</em> : null}</button>) : <p>저장된 시뮬레이션이 없습니다. 조건을 해석한 뒤 실행하면 이곳에 안전한 연구용 기록으로 저장됩니다.</p>}</section>; }

function Analysis({ result, literature, loading, onDiscover }: { result: Result | null; literature: LiteratureSource[]; loading: boolean; onDiscover: () => void }) { return <section className="production-analysis"><h3>분석 및 논문</h3>{result ? <><article><span>시뮬레이션 기반</span><p>{result.analysis[0]?.statement}</p><small>신뢰도 {Math.round((result.analysis[0]?.confidence || 0) * 100)}% · 문헌 검색은 실행 결과의 메타데이터를 보조 근거로만 사용합니다.</small></article><article><span>한계</span><p>동일 profile, 입력, seed에서는 재현 가능한 결과이지만 실제 균주, 배양기, scale-up의 결과를 예측하거나 보증하지 않습니다.</p></article><button type="button" className="production-primary" disabled={loading} onClick={onDiscover}>{loading ? <Loader2 className="animate-spin" /> : <BookOpen />} 관련 논문 검색</button>{literature.map((source) => <a key={source.url} className="production-source" href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><small>{source.journal || "Academic index"} · {source.verification_level || "metadata_only"}</small></a>)}</> : <p>완료된 시뮬레이션을 선택하면 근거 수준과 문헌 탐색 결과를 표시합니다.</p>}</section>; }

function Recommendations({ result }: { result: Result | null }) { return <section className="production-recommendations"><h3>다음 실험</h3>{result ? result.next_experiments.map((item) => <article key={item.type}><span>{item.type}</span><strong>{item.title}</strong><p>{item.proposed_changes}</p><button type="button">승인 후 조건으로 불러오기</button></article>) : <p>사용자 승인 없이 다음 실험은 자동 실행하지 않습니다.</p>}</section>; }

function ModelInformation() { return <section className="production-model"><h3>모델 정보</h3><dl><div><dt>Simulation engine</dt><dd>phase9-simulation-1.0.0</dd></div><div><dt>Organism reference</dt><dd>Schizochytrium-like thraustochytrid</dd></div><div><dt>Core variables</dt><dd>온도, pH, DO, 교반, 통기, 탄소·질소, 염도, 배양시간</dd></div><div><dt>사용하지 않은 변수</dt><dd>광량: 기본 profile은 비광합성형이라 결과 계산에 사용하지 않음</dd></div><div><dt>실제 공정 검증 여부</dt><dd>미검증 · 연구용 시뮬레이션</dd></div></dl></section>; }
