# Advisor Agent Evaluation (Azure AI Foundry)

An evaluation dataset, custom evaluators, and a runner for the advisor agent, built
for the **Azure AI Evaluation SDK** and **Azure AI Foundry**. It measures whether the
agent (the Copilot SDK console with the `microsoft-ai-decision-framework` and
`org-context` skills) gives sound, in-policy recommendations to non-technical business
users.

## What it measures

The runner generates a live agent response for each scenario, then scores it with
built-in and custom evaluators:

| Evaluator | Type | Measures |
| --- | --- | --- |
| `relevance` | built-in | Does the answer address the user's use case? |
| `coherence` | built-in | Is the answer well-structured and readable? |
| `groundedness` | built-in | Is the answer grounded in the provided Acme/framework `context`? |
| `response_completeness` | built-in | Does it cover the `ground_truth` key points? |
| `framework_adherence` | custom | Did it follow Gate → BXT → 9 Questions → Phase 3 (cast of roles), not jump to a product? |
| `org_context_adherence` | custom | Did it apply Acme standards (approved platforms, UK boundary, action safety, single agent) and append an **Architect Review**? |
| `recommendation_correctness` | custom | Does the recommended grouping/platform + gate outcome + human-in-the-loop match the reference? |

The custom evaluators live in [`evaluators/custom_evaluators.py`](evaluators/custom_evaluators.py)
and are plain callables, so they also work standalone or in a Foundry cloud evaluation.

## Dataset

[`dataset.jsonl`](dataset.jsonl) holds **~15 input-only scenarios** (the runner
generates responses at eval time). Each row:

| Field | Purpose |
| --- | --- |
| `id`, `category` | identify / group the scenario |
| `query` | the business-user use case (the agent input) |
| `context` | relevant Acme standards + framework principle (for groundedness/relevance) |
| `ground_truth` | ideal-answer key points (for completeness / correctness) |
| `expected_grouping` | framework capability grouping (1–5) |
| `expected_platforms` | platforms a correct answer should name |
| `requires_human_in_loop` | whether human-in-the-loop is required |
| `must_include_architect_review` | whether the Architect Review section is expected |
| `expected_gate_outcome` | `proceed` / `reshape` / `not-an-agent` |

Categories span agent-fit, not-an-agent, customer-facing high-risk, adopt M365
Copilot, extend Copilot, Fabric analytics, low-code, pro-code Foundry, specialized
copilots, cross-boundary / non-approved platform, BXT failure, multi-agent pushback,
autonomous action, non-UK data residency, and product-first/vague requests.

## Prerequisites

- **Python 3.10+** and **Node.js 22.5+** (the target runs the Copilot SDK / CLI).
- Install dependencies:
  ```powershell
  cd agent\advisor\eval
  pip install -r requirements.txt
  pip install -r ..\src\requirements.txt
  ```
- The **agent under test** must be runnable — i.e. `agent/advisor/src/.env` is
  configured for the Azure AI Foundry model (see `../src/README.md`). For Entra auth,
  run `az login`.
- A **judge model**: an Azure OpenAI deployment (e.g. `gpt-4o-mini`) used by the
  AI-assisted evaluators. Grant your identity **Cognitive Services OpenAI User** if
  using Entra.

## Configuration

Set via environment or a local `eval/.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `EVAL_JUDGE_ENDPOINT` | Yes | Judge Azure OpenAI endpoint, e.g. `https://<resource>.openai.azure.com`. |
| `EVAL_JUDGE_DEPLOYMENT` | Yes | Judge deployment name, e.g. `gpt-4o-mini`. |
| `EVAL_JUDGE_API_VERSION` | No | Default `2024-10-21`. |
| `EVAL_JUDGE_API_KEY` | No | Judge API key. Omit to use Microsoft Entra (`az login`). |
| `AZURE_AI_PROJECT_ENDPOINT` | No | Foundry project endpoint to log results to, e.g. `https://<resource>.services.ai.azure.com/api/projects/<project>`. |
| `ADVISOR_EVAL_TIMEOUT` | No | Per-row agent timeout in seconds (default 300). |

> The agent's own model config (which model it recommends *with*) comes from
> `../src/.env` (`FOUNDRY_*`). The judge model (`EVAL_*`) is separate and only scores.

## Run

```powershell
cd agent\advisor\eval
python run_eval.py
```

The runner:
1. runs the live advisor agent for each `query` (via [`target.py`](target.py)),
2. scores each response with the built-in + custom evaluators,
3. prints aggregate metrics, writes `eval_results.json`, and — if
   `AZURE_AI_PROJECT_ENDPOINT` is set — logs to your Foundry project (the run prints a
   `studio_url`).

### Smoke-test the target alone

```powershell
python target.py "We want claims handlers to summarise new claims faster."
```

## Running as a Foundry cloud evaluation

`dataset.jsonl` is standard JSONL and uploads directly as a Foundry evaluation
dataset. In a cloud evaluation you can:
- pre-generate responses (add a `response` column) or wire a target, and
- use the built-in evaluators from the portal plus the custom graders here
  (registered via the SDK against your Foundry project with
  `AZURE_AI_PROJECT_ENDPOINT`).

See Microsoft Learn: *Local Evaluation with the Azure AI Evaluation SDK* and
*Evaluate your AI agents*.

## Notes

- The dataset is **input-only**; responses are generated at eval time so the dataset
  stays reusable and model-agnostic.
- Custom graders embed their rubric in the system prompt for portability; move them to
  `.prompty` files if you prefer externalized prompts.
- Agentic evaluators (`ToolCallAccuracy`, `IntentResolution`, `TaskAdherence`) need
  tool-call traces in the agent message schema; the console captures final text, so
  they're an optional future extension.
- No secrets are committed; all config is via environment / `az login`.
