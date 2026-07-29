import pytest

from heather_agent.production import ENGINE_VERSION, ProductionExperimentPlan, default_plan, parse_instruction, simulate


def test_default_plan_is_valid_and_deterministic():
    plan = default_plan()
    first = simulate(plan)
    second = simulate(plan)
    assert first.model_version == ENGINE_VERSION
    assert first.final_metrics == second.final_metrics
    assert first.time_series == second.time_series


def test_instruction_parses_stage_shift_and_nitrogen_limitation():
    plan = parse_instruction("초기 48시간은 28°C에서 성장시키고 이후 온도를 25°C로 낮추고 질소를 제한해줘. 총 120시간")
    assert plan.phases[1].end_hour == 48
    assert plan.phases[2].temperature_c == 25
    assert plan.phases[2].carbon_nitrogen_state == "nitrogen_limited"


def test_invalid_temperature_is_blocked():
    with pytest.raises(ValueError):
        parse_instruction("온도 60도에서 총 120시간 운전")


def test_light_is_ignored_with_warning_for_reference_profile():
    plan = parse_instruction("광량 5000 lux로 높여줘")
    assert any("light" in warning.casefold() for warning in plan.warnings)
    assert "light" not in plan.model_dump()


def test_nitrogen_limited_stage_accumulates_lipid():
    result = simulate(default_plan())
    growth = next(point for point in result.time_series if point.time_h == 48)
    final = result.final_state
    assert final.total_lipid_g_l > growth.total_lipid_g_l
    assert final.dha_g_l > growth.dha_g_l


def test_working_volume_cannot_exceed_vessel_volume():
    payload = default_plan().model_dump()
    payload["working_volume_l"] = 7
    with pytest.raises(ValueError):
        ProductionExperimentPlan.model_validate(payload)
