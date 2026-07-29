from heather_agent.context import ProjectAlias, identify_project, normalize_alias


def test_normalize_alias_keeps_korean_and_ascii() -> None:
    assert normalize_alias("K-Line / 케이라인") == "kline케이라인"


def test_identifies_best_project_alias() -> None:
    match = identify_project(
        "헤더 프로젝트의 최근 상태를 알려줘",
        [
            ProjectAlias("k-line", "K_LINE", ("K Line",)),
            ProjectAlias("heather", "Heather AI Assistant", ("Heather", "헤더")),
        ],
    )
    assert match is not None
    assert match.project_id == "heather"


def test_returns_none_without_alias() -> None:
    assert identify_project("오늘 날씨는 어때", [ProjectAlias("heather", "Heather", ("헤더",))]) is None
