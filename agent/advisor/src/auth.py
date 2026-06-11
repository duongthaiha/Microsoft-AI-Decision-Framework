"""
Entra ID token utility for the Advisor Console.

When the Azure AI Foundry resource has API-key auth disabled, the Copilot SDK
provider must authenticate with a Microsoft Entra bearer token instead of a key.
This module wraps ``DefaultAzureCredential`` to acquire a data-plane access token
for Azure Cognitive Services / Azure AI Foundry.

`DefaultAzureCredential` tries multiple sources in order (environment variables,
managed identity, the Azure CLI `az login`, Azure Developer CLI, etc.), so the
same code works locally and in Azure-hosted environments.

This module is intentionally independent of the Copilot SDK so it can be reused
and tested on its own.
"""

from __future__ import annotations

from azure.core.credentials import AccessToken
from azure.identity import DefaultAzureCredential

# Data-plane scope for Azure Cognitive Services / Azure OpenAI / Azure AI Foundry.
COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default"

_credential: DefaultAzureCredential | None = None


def get_credential() -> DefaultAzureCredential:
    """Return a cached ``DefaultAzureCredential`` instance.

    Reusing a single credential lets the underlying SDK cache tokens and reuse
    HTTP connections across calls.
    """
    global _credential
    if _credential is None:
        _credential = DefaultAzureCredential()
    return _credential


def get_access_token(scope: str = COGNITIVE_SERVICES_SCOPE) -> AccessToken:
    """Acquire an access token for the given scope.

    Args:
        scope: The token scope. Defaults to the Cognitive Services data-plane
            scope used by Azure OpenAI / Azure AI Foundry.

    Returns:
        An :class:`~azure.core.credentials.AccessToken` with ``.token`` (the
        bearer token string) and ``.expires_on`` (epoch seconds).
    """
    return get_credential().get_token(scope)


def get_bearer_token(scope: str = COGNITIVE_SERVICES_SCOPE) -> str:
    """Convenience wrapper returning just the bearer token string."""
    return get_access_token(scope).token
