"""Deterministic, research-only DHA fed-batch simulation primitives.

The equations provide a literature-calibrated demonstration envelope, not a
prediction of an actual culture or a controller for physical equipment.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from math import exp
from random import Random
import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator


ENGINE_VERSION = "phase9-simulation-1.0.0"
SIMULATION_DISCLAIMER = "연구용 시뮬레이션입니다. 실제 배양 결과를 보증하지 않으며, 실제 생산공정 적용 전 실험실 검증이 필요합니다."


class ProductionPhase(BaseModel):
    phase_name: Literal["adaptation", "growth", "accumulation", "stabilization"]
    start_hour: float = Field(ge=0)
    end_hour: float = Field(gt=0)
    temperature_c: float = Field(ge=18, le=35)
    ph_target: float = Field(ge=4.5, le=8.5)
    ph_control_mode: Literal["fixed_control", "staged_control", "uncontrolled_drift"] = "fixed_control"
    do_target_percent: float = Field(ge=0, le=100)
    agitation_rpm_min: float = Field(ge=50, le=1500)
    agitation_rpm_max: float = Field(ge=50, le=1500)
    aeration_vvm_min: float = Field(ge=0, le=3)
    aeration_vvm_max: float = Field(ge=0, le=3)
    glucose_feed_rate: float = Field(ge=0, le=12)
    nitrogen_feed_rate: float = Field(ge=0, le=3)
    carbon_nitrogen_state: Literal["balanced", "carbon_excess", "nitrogen_limited"]

    @model_validator(mode="after")
    def valid_ranges(self) -> "ProductionPhase":
        if self.end_hour <= self.start_hour:
            raise ValueError("phase_end_must_follow_start")
        if self.agitation_rpm_min > self.agitation_rpm_max:
            raise ValueError("agitation_range_is_reversed")
        if self.aeration_vvm_min > self.aeration_vvm_max:
            raise ValueError("aeration_range_is_reversed")
        return self


class ProductionExperimentPlan(BaseModel):
    profile_id: str = "DEMO_SYNTHETIC_SAFE_V1"
    objective: str = "balance biomass, DHA concentration, and process stability"
    organism: str = "Schizochytrium-like thraustochytrid"
    process_mode: Literal["batch", "fed_batch", "staged_fed_batch"] = "staged_fed_batch"
    total_duration_hours: float = Field(default=120, gt=0, le=240)
    sampling_interval_hours: float = Field(default=6, ge=1, le=24)
    vessel_volume_l: float = Field(default=5, gt=0, le=1000)
    working_volume_l: float = Field(default=3, gt=0, le=900)
    inoculum_g_l: float = Field(default=0.7, gt=0, le=20)
    salinity_ppt: float = Field(default=20, ge=0, le=50)
    initial_glucose_g_l: float = Field(default=25, ge=0, le=150)
    initial_nitrogen_g_l: float = Field(default=2.2, ge=0, le=30)
    phases: list[ProductionPhase]
    stop_conditions: list[str] = Field(default_factory=lambda: ["contamination risk index >= 0.80"])
    safety_constraints: list[str] = Field(default_factory=lambda: ["simulation_only", "no_equipment_control"])
    parser_confidence: float = Field(default=0.72, ge=0, le=1)
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    random_seed: int = Field(default=20260729, ge=0, le=2_147_483_647)

    @model_validator(mode="after")
    def valid_plan(self) -> "ProductionExperimentPlan":
        if self.working_volume_l > self.vessel_volume_l:
            raise ValueError("working_volume_exceeds_vessel_volume")
        phases = sorted(self.phases, key=lambda phase: phase.start_hour)
        if not phases or phases[0].start_hour != 0 or phases[-1].end_hour != self.total_duration_hours:
            raise ValueError("phases_must_cover_full_duration")
        if any(left.end_hour != right.start_hour for left, right in zip(phases, phases[1:])):
            raise ValueError("phase_gap_or_overlap")
        return self


class SimulationProfile(BaseModel):
    id: str
    code: str
    name: str
    organism_label: str
    version: str
    evidence_level: Literal["synthetic_safe", "literature_calibrated"]
    light_required: bool = False
    limitations: list[str]


PROFILES: dict[str, SimulationProfile] = {
    "DEMO_SYNTHETIC_SAFE_V1": SimulationProfile(id="DEMO_SYNTHETIC_SAFE_V1", code="DEMO_SYNTHETIC_SAFE_V1", name="Synthetic safe two-stage demo", organism_label="Schizochytrium-like thraustochytrid", version="1.0.0", evidence_level="synthetic_safe", limitations=["Literature-range synthetic demonstration profile", "Not validated for a named isolate or physical reactor"]),
    "SCHIZOCHYTRIUM_REFERENCE_V1": SimulationProfile(id="SCHIZOCHYTRIUM_REFERENCE_V1", code="SCHIZOCHYTRIUM_REFERENCE_V1", name="Schizochytrium reference envelope", organism_label="Schizochytrium-like thraustochytrid", version="1.0.0", evidence_level="literature_calibrated", limitations=["Parameter envelope requires strain-specific wet-lab validation"]),
    "SCHIZOCHYTRIUM_TWO_STAGE_DO_TEMP_V1": SimulationProfile(id="SCHIZOCHYTRIUM_TWO_STAGE_DO_TEMP_V1", code="SCHIZOCHYTRIUM_TWO_STAGE_DO_TEMP_V1", name="Two-stage DO and temperature shift", organism_label="Schizochytrium-like thraustochytrid", version="1.0.0", evidence_level="literature_calibrated", limitations=["Temperature and DO shift are not universal optima"]),
    "SCHIZOCHYTRIUM_STAGED_PH_V1": SimulationProfile(id="SCHIZOCHYTRIUM_STAGED_PH_V1", code="SCHIZOCHYTRIUM_STAGED_PH_V1", name="Staged pH control", organism_label="Schizochytrium-like thraustochytrid", version="1.0.0", evidence_level="literature_calibrated", limitations=["pH response is strain dependent"]),
}


class Timepoint(BaseModel):
    time_h: float
    phase: str
    temperature_c: float
    ph: float
    dissolved_oxygen_percent: float
    agitation_rpm: float
    aeration_vvm: float
    glucose_g_l: float
    nitrogen_g_l: float
    biomass_g_l: float
    total_lipid_g_l: float
    dha_g_l: float
    dha_percent_total_fatty_acids: float
    viscosity_index: float
    estimated_kla: float
    contamination_risk: float
    viability_percent: float
    productivity_g_l_h: float
    energy_index: float
    warning_codes: list[str] = Field(default_factory=list)


class SimulationResult(BaseModel):
    status: Literal["completed"] = "completed"
    model_version: str = ENGINE_VERSION
    profile_id: str
    random_seed: int
    plan: ProductionExperimentPlan
    final_state: Timepoint
    time_series: list[Timepoint]
    events: list[dict]
    warnings: list[str]
    assumptions: list[str]
    final_metrics: dict[str, float]
    recommended_harvest_hour: float
    analysis: list[dict]
    next_experiments: list[dict]
    memory_candidate: dict
    confidence: float
    simulation_disclaimer: str = SIMULATION_DISCLAIMER


class ProductionParseRequest(BaseModel):
    instruction: str = Field(min_length=1, max_length=3000)
    random_seed: int | None = Field(default=None, ge=0, le=2_147_483_647)


class ProductionExperimentRequest(ProductionParseRequest):
    title: str | None = Field(default=None, max_length=160)
    plan: ProductionExperimentPlan | None = None


class ProductionCompareRequest(BaseModel):
    experiment_ids: list[str] = Field(min_length=2, max_length=4)


def default_plan() -> ProductionExperimentPlan:
    return ProductionExperimentPlan(
        phases=[
            ProductionPhase(phase_name="adaptation", start_hour=0, end_hour=12, temperature_c=28, ph_target=5.8, do_target_percent=30, agitation_rpm_min=300, agitation_rpm_max=500, aeration_vvm_min=.3, aeration_vvm_max=.7, glucose_feed_rate=0, nitrogen_feed_rate=0, carbon_nitrogen_state="balanced"),
            ProductionPhase(phase_name="growth", start_hour=12, end_hour=48, temperature_c=28, ph_target=5.8, do_target_percent=25, agitation_rpm_min=400, agitation_rpm_max=750, aeration_vvm_min=.5, aeration_vvm_max=1.0, glucose_feed_rate=.7, nitrogen_feed_rate=.10, carbon_nitrogen_state="balanced"),
            ProductionPhase(phase_name="accumulation", start_hour=48, end_hour=120, temperature_c=25, ph_target=5.7, do_target_percent=15, agitation_rpm_min=450, agitation_rpm_max=850, aeration_vvm_min=.5, aeration_vvm_max=1.2, glucose_feed_rate=.55, nitrogen_feed_rate=.01, carbon_nitrogen_state="nitrogen_limited"),
        ],
        assumptions=["Defaults are a synthetic, literature-range demonstration envelope.", "Light is not a modeled energy variable for the selected non-photosynthetic reference profile."],
        warnings=["Simulation only; confirm all conditions in a laboratory before use."],
    )


def parse_instruction(instruction: str, seed: int | None = None) -> ProductionExperimentPlan:
    if len(instruction.strip()) > 3000:
        raise ValueError("instruction_too_long")
    plan = default_plan().model_copy(deep=True)
    text = instruction.casefold()
    assumptions = list(plan.assumptions)
    warnings = list(plan.warnings)
    duration_matches = re.findall(r"(\d{1,3})\s*(?:시간|hours?|h)", text, re.IGNORECASE)
    duration = float(duration_matches[-1]) if duration_matches else None
    if duration:
        plan.total_duration_hours = duration
        plan.phases[-1].end_hour = duration
    transition = _number_after(text, r"(\d{1,3})\s*(?:시간|hours?|h)\s*(?:이후|after)")
    if transition and 18 <= transition < plan.total_duration_hours - 12:
        plan.phases[1].end_hour = transition
        plan.phases[2].start_hour = transition
    temp = _number_after(text, r"(?:온도|temperature)\s*(\d{2}(?:\.\d+)?)")
    if temp:
        plan.phases[1].temperature_c = temp
        assumptions.append("Growth temperature extracted from the instruction.")
    accumulation_temp = _number_after(text, r"(?:이후|after).*?(?:온도|temperature).*?(\d{2}(?:\.\d+)?)")
    if accumulation_temp:
        plan.phases[2].temperature_c = accumulation_temp
    ph = _number_after(text, r"p\s*h\s*(\d(?:\.\d+)?)")
    if ph:
        for phase in plan.phases:
            phase.ph_target = ph
    do = _number_after(text, r"(?:do|용존산소).*?(\d{1,3})\s*%")
    if do:
        plan.phases[1].do_target_percent = do
    if "질소" in text and any(term in text for term in ("제한", "limited", "limit")):
        plan.phases[2].nitrogen_feed_rate = 0.005
        plan.phases[2].carbon_nitrogen_state = "nitrogen_limited"
    if "fed-batch" in text or "fed batch" in text or "공급" in text:
        plan.process_mode = "staged_fed_batch"
    if "안정" in text or "stable" in text:
        plan.objective = "improve DHA accumulation while prioritizing process stability"
    if "광" in text or "light" in text or "lux" in text:
        warnings.append("The selected Schizochytrium-like profile is non-photosynthetic; light is not used in this simulation.")
    if seed is not None:
        plan.random_seed = seed
    plan.assumptions = assumptions
    plan.warnings = warnings
    return ProductionExperimentPlan.model_validate(plan.model_dump())


def _number_after(text: str, pattern: str) -> float | None:
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    return float(match.group(1)) if match else None


def simulate(plan: ProductionExperimentPlan) -> SimulationResult:
    if plan.profile_id not in PROFILES:
        raise ValueError("unknown_profile")
    profile = PROFILES[plan.profile_id]
    rng = Random(plan.random_seed)
    state = {"biomass": plan.inoculum_g_l, "glucose": plan.initial_glucose_g_l, "nitrogen": plan.initial_nitrogen_g_l, "lipid": plan.inoculum_g_l * .10, "dha": plan.inoculum_g_l * .025, "do": 42.0, "risk": .03, "energy": 0.0}
    points: list[Timepoint] = []
    events: list[dict] = []
    step = min(plan.sampling_interval_hours, 3)
    hour = 0.0
    while hour <= plan.total_duration_hours + .001:
        phase = next(item for item in plan.phases if item.start_hour <= hour <= item.end_hour)
        do, agitation, aeration, event = _control_do(state, phase)
        if event:
            events.append({"time_h": round(hour, 2), "event_type": "do_control", "severity": "info", "message": event})
        if hour > 0:
            dt = min(step, plan.total_duration_hours - (hour - step))
            _advance(state, phase, dt, rng)
        warnings: list[str] = []
        if state["do"] < 10: warnings.append("oxygen_limitation")
        if state["glucose"] > 55: warnings.append("residual_glucose_high")
        if state["risk"] >= .55: warnings.append("relative_process_risk_high")
        point = _point(hour, phase, state, agitation, aeration, warnings)
        if abs(hour / plan.sampling_interval_hours - round(hour / plan.sampling_interval_hours)) < .01 or hour == plan.total_duration_hours:
            points.append(point)
        hour = round(hour + step, 5)
    harvest = max(points, key=lambda item: item.dha_g_l / max(item.energy_index + 1, 1) * item.viability_percent / 100 * (1 - item.contamination_risk * .35))
    final = points[-1]
    metrics = {"final_biomass_g_l": final.biomass_g_l, "final_total_lipid_g_l": final.total_lipid_g_l, "final_dha_g_l": final.dha_g_l, "dha_percent_total_fatty_acids": final.dha_percent_total_fatty_acids, "max_dha_g_l": max(point.dha_g_l for point in points), "volumetric_productivity": harvest.productivity_g_l_h, "residual_glucose": final.glucose_g_l, "process_stability_score": round(max(0, 100 - final.contamination_risk * 70 - abs(final.dissolved_oxygen_percent - 15) * 1.2), 2), "contamination_risk_index": final.contamination_risk, "energy_index": final.energy_index}
    return SimulationResult(profile_id=profile.id, random_seed=plan.random_seed, plan=plan, final_state=final, time_series=points, events=events, warnings=sorted({warning for point in points for warning in point.warning_codes} | set(plan.warnings)), assumptions=plan.assumptions + profile.limitations, final_metrics=metrics, recommended_harvest_hour=harvest.time_h, analysis=[{"statement": "현재 시뮬레이션에서는 질소 제한 축적 단계에서 lipid 및 DHA 축적 경향이 나타났습니다.", "evidence_level": "simulation_only", "confidence": .62, "limitations": "Strain and reactor-specific laboratory validation is required."}], next_experiments=_recommendations(plan), memory_candidate={"status": "suggested", "content": f"{plan.profile_id} simulation: recommended harvest at {harvest.time_h} h with DHA {harvest.dha_g_l} g/L. {SIMULATION_DISCLAIMER}"}, confidence=.62)


def _advance(state: dict[str, float], phase: ProductionPhase, dt: float, rng: Random) -> None:
    temp_factor = exp(-((phase.temperature_c - 28) / 5) ** 2)
    ph_factor = exp(-((phase.ph_target - 5.8) / 1.2) ** 2)
    salinity_factor = .95
    glucose_factor = state["glucose"] / (4 + state["glucose"])
    nitrogen_factor = state["nitrogen"] / (.18 + state["nitrogen"])
    oxygen_factor = max(.05, min(1, state["do"] / 24))
    inhibition = 1 / (1 + max(0, state["glucose"] - 60) / 35)
    mu = .115 * temp_factor * ph_factor * salinity_factor * glucose_factor * nitrogen_factor * oxygen_factor * inhibition
    carrying = 92.0
    growth = state["biomass"] * mu * (1 - state["biomass"] / carrying) * dt
    carbon_added = phase.glucose_feed_rate * dt
    nitrogen_added = phase.nitrogen_feed_rate * dt
    state["glucose"] = max(0, state["glucose"] + carbon_added - growth * 1.45 - state["lipid"] * .012 * dt)
    state["nitrogen"] = max(0, state["nitrogen"] + nitrogen_added - growth * .055)
    state["biomass"] += max(0, growth) * (1 + rng.uniform(-.012, .012))
    nitrogen_limited = phase.carbon_nitrogen_state == "nitrogen_limited" or state["nitrogen"] < .22
    lipid_rate = (.010 + (.050 if nitrogen_limited else .006)) * state["biomass"] * glucose_factor * dt
    temp_shift_bonus = 1.12 if nitrogen_limited and 23 <= phase.temperature_c <= 26 else 1
    dha_fraction = min(.56, (.19 + (.15 if nitrogen_limited else .02) + (.06 if temp_shift_bonus > 1 else 0)) * temp_shift_bonus)
    state["lipid"] += lipid_rate
    state["dha"] += lipid_rate * dha_fraction
    viscosity = state["biomass"] / 65 + state["lipid"] / 45
    our = state["biomass"] * (.42 + growth / max(dt, .01))
    kla = (phase.agitation_rpm_max / 650) ** .55 * (phase.aeration_vvm_max + .1) ** .45 * 32 / (1 + viscosity * .7)
    state["do"] = max(1, min(95, state["do"] + (kla * (phase.do_target_percent / 100) - our * .24) * dt))
    risk_terms = .00075 * dt + max(0, 10 - state["do"]) * .0015 * dt + max(0, abs(phase.ph_target - 5.8) - .6) * .002
    state["risk"] = min(.98, state["risk"] + risk_terms + rng.uniform(0, .0008))
    state["energy"] += (phase.agitation_rpm_max / 900 + phase.aeration_vvm_max * .55 + abs(phase.ph_target - 5.8) * .12) * dt


def _control_do(state: dict[str, float], phase: ProductionPhase) -> tuple[float, float, float, str | None]:
    agitation, aeration, event = phase.agitation_rpm_min, phase.aeration_vvm_min, None
    if state["do"] < phase.do_target_percent:
        agitation = phase.agitation_rpm_max
        aeration = phase.aeration_vvm_max
        event = "DO below target: agitation and aeration increased within configured limits."
    return state["do"], agitation, aeration, event


def _point(hour: float, phase: ProductionPhase, state: dict[str, float], agitation: float, aeration: float, warnings: list[str]) -> Timepoint:
    lipid = max(state["lipid"], .001)
    return Timepoint(time_h=round(hour, 2), phase=phase.phase_name, temperature_c=phase.temperature_c, ph=phase.ph_target, dissolved_oxygen_percent=round(state["do"], 2), agitation_rpm=agitation, aeration_vvm=aeration, glucose_g_l=round(state["glucose"], 3), nitrogen_g_l=round(state["nitrogen"], 3), biomass_g_l=round(state["biomass"], 3), total_lipid_g_l=round(lipid, 3), dha_g_l=round(state["dha"], 3), dha_percent_total_fatty_acids=round(min(65, state["dha"] / lipid * 100), 2), viscosity_index=round(state["biomass"] / 65 + state["lipid"] / 45, 3), estimated_kla=round((agitation / 650) ** .55 * (aeration + .1) ** .45 * 32 / (1 + (state["biomass"] / 65 + state["lipid"] / 45) * .7), 2), contamination_risk=round(state["risk"], 3), viability_percent=round(max(45, 98 - state["risk"] * 27 - max(0, 8 - state["do"]) * 1.1), 2), productivity_g_l_h=round(state["dha"] / max(hour, 1), 4), energy_index=round(state["energy"], 2), warning_codes=warnings)


def _recommendations(plan: ProductionExperimentPlan) -> list[dict]:
    return [
        {"type": "exploitation", "title": "Accumulation temperature micro-adjustment", "proposed_changes": "Evaluate 24-26°C accumulation range", "requires_user_approval": True, "confidence": .48},
        {"type": "exploration", "title": "Controlled DO envelope", "proposed_changes": "Compare 12%, 15%, and 20% accumulation DO targets", "requires_user_approval": True, "confidence": .43},
        {"type": "reproducibility", "title": "Repeat this simulated plan", "proposed_changes": "Use the same seed and plan for reproducibility review", "requires_user_approval": True, "confidence": .70},
    ]
