from dataclasses import dataclass
import re


@dataclass(frozen=True)
class ProjectAlias:
    project_id: str
    name: str
    aliases: tuple[str, ...]


@dataclass(frozen=True)
class ProjectAliasMatch:
    project_id: str
    name: str
    confidence: float


def normalize_alias(value: str) -> str:
    return re.sub(r"[^a-z0-9가-힣]", "", value.casefold())


def identify_project(message: str, projects: list[ProjectAlias]) -> ProjectAliasMatch | None:
    source = normalize_alias(message)
    candidates: list[ProjectAliasMatch] = []
    for project in projects:
        aliases = [project.name, *project.aliases]
        match_length = max((len(alias) for alias in map(normalize_alias, aliases) if alias and alias in source), default=0)
        if match_length:
            confidence = min(0.99, 0.6 + match_length / max(len(source), 1))
            candidates.append(ProjectAliasMatch(project.project_id, project.name, confidence))
    return max(candidates, key=lambda item: item.confidence, default=None)
