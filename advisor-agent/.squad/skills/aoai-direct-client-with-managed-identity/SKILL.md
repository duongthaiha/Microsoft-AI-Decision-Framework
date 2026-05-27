# SKILL: Azure OpenAI Direct Client with Managed Identity (Node.js / TypeScript)

**Skill ID:** `aoai-direct-client-with-managed-identity`  
**Author:** Dallas (Backend & Agent Developer)  
**Date:** 2026-05-26  
**Status:** ✅ Verified — used in production M1 reasoning loop

---

## When to Use This Skill

Use this skill when you need to call Azure OpenAI (chat completions, embeddings, function/tool calling) from a Node.js/TypeScript service running on Azure (Container App, App Service, Azure Functions) **without storing API keys or secrets**.

The managed identity eliminates credential rotation, reduces secret sprawl, and satisfies most enterprise security policies out of the box.

---

## Prerequisites

1. **Azure OpenAI resource** with a model deployment (e.g. `gpt-4.1-mini`, `text-embedding-3-small`)
2. **Managed identity** (system or user-assigned) on the compute resource
3. **RBAC role assignment:** `Cognitive Services OpenAI User` (read-only inference) or `Cognitive Services OpenAI Contributor` (fine-tuning + inference) on the AOAI resource scope

```bash
az role assignment create \
  --assignee <managed-identity-principal-id> \
  --role "Cognitive Services OpenAI User" \
  --scope /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<aoai-account>
```

---

## Package Dependencies

```json
{
  "dependencies": {
    "openai": "^4.104.0",
    "@azure/identity": "^4.4.1"
  }
}
```

> Note: `@azure/openai@^2.0.0` adds Azure-specific extension types (content filtering, data sources). Install it too if you need those types. It wraps `openai` and is NOT the primary API surface for chat completions.

---

## Core Pattern

```typescript
import { AzureOpenAI } from "openai";
import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from "@azure/identity";

/**
 * Returns the right credential for the runtime environment.
 * Production: ManagedIdentityCredential (no fallback, no secrets).
 * Local dev: DefaultAzureCredential (VS Code, Azure CLI, env vars).
 */
function getCredential(): TokenCredential {
  if (process.env.ADVISOR_LOCAL_DEV === "true") {
    return new DefaultAzureCredential();
  }
  return new ManagedIdentityCredential();
}

/**
 * Creates an AzureOpenAI client authenticated via managed identity.
 * Call once at module load; reuse the client instance for all requests.
 */
export function createAoaiClient(): AzureOpenAI {
  const endpoint = process.env.AOAI_ENDPOINT;
  if (!endpoint) throw new Error("AOAI_ENDPOINT env var is required");

  const credential = getCredential();

  return new AzureOpenAI({
    endpoint,
    // AOAI API version — use "2024-12-01-preview" for tool calling + json_object responses
    apiVersion: "2024-12-01-preview",
    // azureADTokenProvider acquires a token scoped to AOAI on every request
    azureADTokenProvider: async () => {
      const token = await credential.getToken(
        "https://cognitiveservices.azure.com/.default"
      );
      if (!token) throw new Error("Failed to acquire AOAI token");
      return token.token;
    },
  });
}
```

---

## Chat Completions with Tool Calling

```typescript
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "myTool",
      description: "Description the model uses to decide when to call this.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
        },
        required: ["query"],
      },
    },
  },
];

async function runLoop(client: AzureOpenAI, deployment: string) {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Find something for me." },
  ];

  // Agentic loop — exits when finish_reason is 'stop' or no tool calls
  for (let i = 0; i < 8; i++) {
    const response = await client.chat.completions.create({
      model: deployment,       // Azure deployment name, not model name
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 2000,
    });

    const choice = response.choices[0];
    const msg = choice.message;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });

    if (!msg.tool_calls?.length || choice.finish_reason === "stop") {
      return msg.content ?? "";
    }

    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      const result = await dispatch(call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
}
```

---

## Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `AOAI_ENDPOINT` | `https://myaccount.openai.azure.com/` | Azure OpenAI resource endpoint |
| `AOAI_MODEL_DEPLOYMENT` | `gpt-4.1-mini` | Deployment name (NOT the model name) |
| `ADVISOR_LOCAL_DEV` | `true` | Switches to DefaultAzureCredential for local dev |

**Never store `OPENAI_API_KEY` in environment — use managed identity.**

---

## Local Development Setup

For local dev, install Azure CLI and sign in:
```bash
az login
az account set --subscription <your-subscription-id>
```

Set `ADVISOR_LOCAL_DEV=true` in `.env.local`. `DefaultAzureCredential` will use your Azure CLI session.

Alternatively, use VS Code with the Azure Account extension — `DefaultAzureCredential` picks it up automatically.

---

## Gotchas

1. **Deployment name vs model name:** `model` parameter in the API call must be the **Azure deployment name** (e.g. `gpt-4.1-mini`), not the OpenAI model name. These are often the same but can differ.

2. **API version matters for tool calling:** Use `2024-12-01-preview` or later. Older versions may not support `tool_choice: "auto"` or return `finish_reason: "tool_calls"` correctly.

3. **`azureADTokenProvider` is called on every request:** The `openai` SDK calls this callback before each API call. The `TokenCredential.getToken()` call is already cached by `@azure/identity` (token refresh before expiry). Do NOT cache the token yourself.

4. **Scope format:** The AOAI token scope is `https://cognitiveservices.azure.com/.default` — always this exact string regardless of AOAI account name.

5. **`@azure/openai` vs `openai`:** In v2.0.0, `@azure/openai` is a thin wrapper around `openai` that re-exports Azure-specific types. `AzureOpenAI` class is exported from `openai`, not from `@azure/openai`. Import from `openai` for the client class.

6. **Test mocking:** In Vitest/Jest, mock the `chat.completions.create` method directly:
   ```typescript
   const mockCreate = vi.fn();
   const mockClient = { chat: { completions: { create: mockCreate } } } as unknown as AzureOpenAI;
   mockCreate.mockResolvedValue({ choices: [{ message: { content: "Hello", tool_calls: [] }, finish_reason: "stop" }] });
   ```

---

## Microsoft Learn References

- [Azure OpenAI function calling](https://learn.microsoft.com/azure/ai-services/openai/how-to/function-calling)
- [Authenticate with managed identity](https://learn.microsoft.com/azure/ai-services/openai/how-to/managed-identity)
- [Azure OpenAI JavaScript SDK](https://learn.microsoft.com/azure/ai-services/openai/quickstart?pivots=programming-language-javascript)
- [DefaultAzureCredential](https://learn.microsoft.com/javascript/api/overview/azure/identity-readme)
