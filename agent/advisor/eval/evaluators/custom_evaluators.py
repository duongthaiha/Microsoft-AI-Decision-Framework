"""Custom prompt-based evaluators for the advisor agent.

These are AI-assisted graders that score the agent's recommendation against the
framework methodology, Acme's org-context standards, and the scenario's expected
outcome. Each is a plain callable class, so it plugs straight into the Azure AI
Evaluation SDK ``evaluate(evaluators={...})`` API and logs to Azure AI Foundry.

Each grader returns a 1-5 score, a short reason, and a pass/fail result against a
threshold (default 3), following the shape of the built-in AI-assisted evaluators.

A judge model is required. Pass a ``model_config`` dict shaped like
``AzureOpenAIModelConfiguration``::

    {
        "azure_endpoint": "https://<resource>.openai.azure.com",
        "azure_deployment": "gpt-4o-mini",
        "api_version": "2024-10-21",
        "api_key": "<key>",        # OR omit for Microsoft Entra (az login)
    }

If ``api_key`` is absent, Microsoft Entra auth is used via
``DefaultAzureCredential`` (the resource must grant your identity the
``Cognitive Services OpenAI User`` role).
"""

from __future__ import annotations

import json
import re
from typing import Any

DEFAULT_THRESHOLD = 3


def _build_client(model_config: dict):
    """Build an AzureOpenAI client from an AzureOpenAIModelConfiguration-style dict."""
    from openai import AzureOpenAI

    endpoint = model_config["azure_endpoint"]
    api_version = model_config.get("api_version", "2024-10-21")
    api_key = model_config.get("api_key")
    if api_key:
        return AzureOpenAI(
            azure_endpoint=endpoint, api_version=api_version, api_key=api_key
        )

    # Microsoft Entra auth (key-disabled resources).
    from azure.identity import DefaultAzureCredential, get_bearer_token_provider

    token_provider = get_bearer_token_provider(
        DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"
    )
    return AzureOpenAI(
        azure_endpoint=endpoint,
        api_version=api_version,
        azure_ad_token_provider=token_provider,
    )


def _parse_score(raw: str) -> tuple[float, str]:
    """Parse a ``{"score": int, "reason": str}`` JSON judge response defensively."""
    try:
        data = json.loads(raw)
        return float(data["score"]), str(data.get("reason", "")).strip()
    except Exception:
        # Fallback: pull the first integer 1-5 out of the text.
        m = re.search(r"[1-5]", raw or "")
        score = float(m.group(0)) if m else 1.0
        return score, (raw or "").strip()[:500]


class _BasePromptGrader:
    """Shared judge-model plumbing for the custom graders."""

    name: str = "custom"
    system_prompt: str = ""

    def __init__(self, model_config: dict, *, threshold: int = DEFAULT_THRESHOLD) -> None:
        self._model_config = model_config
        self._deployment = model_config.get("azure_deployment") or model_config.get(
            "model"
        )
        self._threshold = threshold
        self._client = None

    def _client_lazy(self):
        if self._client is None:
            self._client = _build_client(self._model_config)
        return self._client

    def _build_user_prompt(self, **kwargs: Any) -> str:  # overridden
        raise NotImplementedError

    def __call__(self, **kwargs: Any) -> dict:
        user_prompt = self._build_user_prompt(**kwargs)
        client = self._client_lazy()
        completion = client.chat.completions.create(
            model=self._deployment,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        raw = completion.choices[0].message.content or ""
        score, reason = _parse_score(raw)
        return {
            self.name: score,
            f"{self.name}_reason": reason,
            f"{self.name}_result": "pass" if score >= self._threshold else "fail",
            f"{self.name}_threshold": self._threshold,
        }


class FrameworkAdherenceEvaluator(_BasePromptGrader):
    """Did the answer follow the decision methodology instead of product-first picking?"""

    name = "framework_adherence"
    system_prompt = (
        "You are a strict evaluator of how well an AI architecture advisor follows "
        "the Microsoft AI Decision Framework methodology. The methodology is: a "
        "pre-phase GATE (pull product-first requests back to outcome, user "
        "experience, and the simplest useful technology; check whether an agent is "
        "even needed), then PHASE 1 BXT (viability, desirability, feasibility), "
        "PHASE 2 the nine critical questions to shortlist a capability grouping, and "
        "PHASE 3 selection that frames technologies as a CAST of roles (front door, "
        "orchestrator, engine, grounding, action, governance) rather than naming a "
        "single 'winner'. Reward answers that reason through the phases and avoid "
        "jumping straight to a product; penalise answers that name a product with no "
        "outcome/feasibility/role reasoning. Respond ONLY as JSON: "
        '{"score": <1-5 integer>, "reason": "<one or two sentences>"}.'
    )

    def _build_user_prompt(self, *, query: str = "", response: str = "", **_: Any) -> str:
        return (
            f"USER USE CASE:\n{query}\n\n"
            f"ADVISOR RESPONSE:\n{response}\n\n"
            "Score 1-5 how well the response follows the framework methodology "
            "(gate -> BXT -> nine questions -> selection as a cast), not whether you "
            "personally agree with the product. 5 = clearly methodology-driven with a "
            "structured decision; 1 = product-first with no methodology."
        )


class OrgContextAdherenceEvaluator(_BasePromptGrader):
    """Did the answer apply Acme's standards and append the Architect Review section?"""

    name = "org_context_adherence"
    system_prompt = (
        "You evaluate whether an AI architecture advisor correctly applied the "
        "organization's (Acme's) enterprise-architecture standards instead of asking "
        "the non-technical business user architecture questions. Acme standards "
        "include: Microsoft-first approved platforms; UK data residency and the Azure "
        "UK landing zone / Microsoft 365 trust boundary; read-only by default with "
        "human-in-the-loop for customer-facing, advice, or money-moving actions "
        "(Consumer Duty); default to a single agent; grounding via Guidewire + Azure "
        "Data Platform (structured) and SharePoint/Azure AI Search (unstructured). A "
        "strong answer auto-answers the architecture-heavy questions from these "
        "standards, labels org-derived answers, and APPENDS an 'Architect Review' "
        "section. Respond ONLY as JSON: "
        '{"score": <1-5 integer>, "reason": "<one or two sentences>"}.'
    )

    def _build_user_prompt(
        self,
        *,
        query: str = "",
        response: str = "",
        context: str = "",
        must_include_architect_review: Any = True,
        **_: Any,
    ) -> str:
        need_review = str(must_include_architect_review).lower() in ("true", "1", "yes")
        return (
            f"USER USE CASE:\n{query}\n\n"
            f"RELEVANT ACME STANDARDS (context):\n{context}\n\n"
            f"ADVISOR RESPONSE:\n{response}\n\n"
            f"Architect Review section expected: {need_review}.\n"
            "Score 1-5 how well the response applied Acme's standards (approved "
            "platforms, UK data boundary, action safety / human-in-the-loop, single "
            "agent, correct grounding sources), auto-answered architecture questions "
            "rather than asking the user, and included an 'Architect Review' section "
            "when expected. 5 = fully applied and includes Architect Review; 1 = "
            "ignored org standards or asked the user the architecture questions."
        )


class RecommendationCorrectnessEvaluator(_BasePromptGrader):
    """Does the recommendation match the expected grouping/platforms and gate outcome?"""

    name = "recommendation_correctness"
    system_prompt = (
        "You evaluate whether an AI architecture advisor reached the correct "
        "recommendation for a scenario, using the provided reference answer and "
        "expectations. Judge against the reference, not your own preference. Check: "
        "the recommended capability grouping and platform(s) match the expectation; "
        "the gate outcome is correct (proceed vs reshape vs not-an-agent); and action "
        "safety / human-in-the-loop is handled correctly. Respond ONLY as JSON: "
        '{"score": <1-5 integer>, "reason": "<one or two sentences>"}.'
    )

    def _build_user_prompt(
        self,
        *,
        query: str = "",
        response: str = "",
        ground_truth: str = "",
        expected_grouping: str = "",
        expected_platforms: str = "",
        requires_human_in_loop: Any = "",
        expected_gate_outcome: str = "",
        **_: Any,
    ) -> str:
        return (
            f"USER USE CASE:\n{query}\n\n"
            f"REFERENCE / IDEAL ANSWER KEY POINTS:\n{ground_truth}\n\n"
            f"EXPECTED capability grouping: {expected_grouping}\n"
            f"EXPECTED platform(s): {expected_platforms}\n"
            f"EXPECTED gate outcome: {expected_gate_outcome}\n"
            f"Requires human-in-the-loop: {requires_human_in_loop}\n\n"
            f"ADVISOR RESPONSE:\n{response}\n\n"
            "Score 1-5 how well the response matches the reference: correct grouping "
            "and platform direction, correct gate outcome, and correct action-safety "
            "handling. 5 = matches the reference on all points; 1 = wrong "
            "recommendation or wrong gate outcome."
        )
