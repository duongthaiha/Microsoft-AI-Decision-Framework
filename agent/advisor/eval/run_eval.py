"""Run the advisor-agent evaluation with the Azure AI Evaluation SDK.

This batch-evaluates the agent over ``dataset.jsonl``:

1. The ``AdvisorTarget`` runs the live advisor agent for each row's ``query`` and
   returns a ``response``.
2. Built-in evaluators (Relevance, Coherence, Groundedness, ResponseCompleteness)
   plus three custom graders (framework adherence, org-context adherence,
   recommendation correctness) score each response.
3. Results print to the console, save to ``eval_results.json``, and - when a
   Foundry project is configured - log to the project portal.

Configuration is read from environment variables (a local ``.env`` is loaded if
present). See ``README.md``.

Judge model (required) - an Azure OpenAI deployment used by the AI-assisted
evaluators:

    EVAL_JUDGE_ENDPOINT     https://<resource>.openai.azure.com
    EVAL_JUDGE_DEPLOYMENT   e.g. gpt-4o-mini
    EVAL_JUDGE_API_VERSION  e.g. 2024-10-21
    EVAL_JUDGE_API_KEY      optional; omit to use Microsoft Entra (az login)

Foundry project (optional, to log results):

    AZURE_AI_PROJECT_ENDPOINT   https://<resource>.services.ai.azure.com/api/projects/<project>
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

HERE = Path(__file__).resolve().parent
DATASET = HERE / "dataset.jsonl"
OUTPUT = HERE / "eval_results.json"

# Make the evaluators package and the target importable when run from anywhere.
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))


class EvalConfigError(Exception):
    pass


def _judge_model_config() -> dict:
    endpoint = os.environ.get("EVAL_JUDGE_ENDPOINT", "").strip()
    deployment = os.environ.get("EVAL_JUDGE_DEPLOYMENT", "").strip()
    api_version = os.environ.get("EVAL_JUDGE_API_VERSION", "2024-10-21").strip()
    api_key = os.environ.get("EVAL_JUDGE_API_KEY", "").strip()
    if not endpoint or not deployment:
        raise EvalConfigError(
            "Set EVAL_JUDGE_ENDPOINT and EVAL_JUDGE_DEPLOYMENT (the judge Azure "
            "OpenAI deployment used by the AI-assisted evaluators)."
        )
    config: dict = {
        "azure_endpoint": endpoint,
        "azure_deployment": deployment,
        "api_version": api_version,
    }
    if api_key:
        config["api_key"] = api_key
    return config


def _azure_ai_project() -> str | None:
    return os.environ.get("AZURE_AI_PROJECT_ENDPOINT", "").strip() or None


def main() -> int:
    if load_dotenv is not None:
        load_dotenv(HERE / ".env")
        load_dotenv(HERE.parent / "src" / ".env")

    if not DATASET.is_file():
        print(f"Dataset not found: {DATASET}", file=sys.stderr)
        return 2

    try:
        model_config = _judge_model_config()
    except EvalConfigError as exc:
        print(f"Configuration error:\n{exc}", file=sys.stderr)
        return 2

    from azure.ai.evaluation import (
        CoherenceEvaluator,
        GroundednessEvaluator,
        RelevanceEvaluator,
        ResponseCompletenessEvaluator,
        evaluate,
    )

    from evaluators import (
        FrameworkAdherenceEvaluator,
        OrgContextAdherenceEvaluator,
        RecommendationCorrectnessEvaluator,
    )
    from target import AdvisorTarget

    evaluators = {
        # Built-in quality evaluators.
        "relevance": RelevanceEvaluator(model_config),
        "coherence": CoherenceEvaluator(model_config),
        "groundedness": GroundednessEvaluator(model_config),
        "response_completeness": ResponseCompletenessEvaluator(model_config),
        # Custom agent-specific graders.
        "framework_adherence": FrameworkAdherenceEvaluator(model_config),
        "org_context_adherence": OrgContextAdherenceEvaluator(model_config),
        "recommendation_correctness": RecommendationCorrectnessEvaluator(model_config),
    }

    # Map dataset columns + the target output onto each evaluator's expected inputs.
    # ${data.*} are dataset columns; ${target.response} is the agent's generated answer.
    common = {
        "query": "${data.query}",
        "response": "${target.response}",
        "context": "${data.context}",
        "ground_truth": "${data.ground_truth}",
    }
    evaluator_config = {
        "relevance": {"column_mapping": {"query": common["query"], "response": common["response"]}},
        "coherence": {"column_mapping": {"query": common["query"], "response": common["response"]}},
        "groundedness": {
            "column_mapping": {
                "query": common["query"],
                "response": common["response"],
                "context": common["context"],
            }
        },
        "response_completeness": {
            "column_mapping": {
                "response": common["response"],
                "ground_truth": common["ground_truth"],
            }
        },
        "framework_adherence": {"column_mapping": {**common}},
        "org_context_adherence": {
            "column_mapping": {
                **common,
                "must_include_architect_review": "${data.must_include_architect_review}",
            }
        },
        "recommendation_correctness": {
            "column_mapping": {
                **common,
                "expected_grouping": "${data.expected_grouping}",
                "expected_platforms": "${data.expected_platforms}",
                "requires_human_in_loop": "${data.requires_human_in_loop}",
                "expected_gate_outcome": "${data.expected_gate_outcome}",
            }
        },
    }

    azure_ai_project = _azure_ai_project()

    print("Advisor agent evaluation")
    print(f"  Dataset:       {DATASET}")
    print(f"  Judge model:   {model_config['azure_deployment']} @ {model_config['azure_endpoint']}")
    print(f"  Foundry log:   {'yes -> ' + azure_ai_project if azure_ai_project else 'no (local only)'}")
    print("  Evaluators:    " + ", ".join(evaluators))
    print("Running... (this calls the live agent for each row and the judge model)\n")

    result = evaluate(
        data=str(DATASET),
        target=AdvisorTarget(),
        evaluators=evaluators,
        evaluator_config=evaluator_config,
        azure_ai_project=azure_ai_project,
        output_path=str(OUTPUT),
    )

    print("\n===== Aggregate metrics =====")
    for key, value in sorted(result.get("metrics", {}).items()):
        print(f"  {key}: {value}")
    studio_url = result.get("studio_url")
    if studio_url:
        print(f"\nView in Foundry: {studio_url}")
    print(f"\nFull results saved to: {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
