# Pinta-Inspired Heather Learning Architecture

The referenced `Pinta-master` project is an image editor, not a personal AI assistant. Heather does not copy Pinta's C# source code. Instead, Heather borrows three architectural ideas and translates them into TypeScript assistant behavior:

- Service registration: Pinta has managers for services and tools. Heather now has a generative tool registry in `packages/core/src/learning.ts`.
- Tool selection: Pinta switches the active drawing tool. Heather selects a generative tool such as writing, planning, relationship analysis, decision comparison, prompt design, or image prompt generation.
- History and iteration: Pinta records document history. Heather records teaching examples, corrections, directives, skills, and boundary rules so future responses can improve.

## Teaching Records

Heather teaching records are stored separately from personal memories.

- `directive`: Always-follow behavior.
- `preference`: User taste or style.
- `example`: A response pattern worth imitating.
- `correction`: A previous mistake or changed rule.
- `skill`: A reusable capability.
- `boundary_rule`: A decision boundary Heather should keep checking.

## Generative Tools

The local generator can route prompts to:

- `conversation`
- `draft_writer`
- `project_planner`
- `relationship_analyst`
- `decision_comparator`
- `prompt_designer`
- `image_prompt`

Cloud or local-model providers also receive the active teaching context through their prompt adapters.

## How to Train Heather

Use the `학습/생성` panel:

1. Add a teaching record.
2. Choose the type.
3. Write the rule, example, or correction.
4. Keep it active when Heather should apply it.
5. Test a prompt in the generative lab.
6. Save good outputs as examples.

This creates an iterative teaching loop without requiring paid API calls.
