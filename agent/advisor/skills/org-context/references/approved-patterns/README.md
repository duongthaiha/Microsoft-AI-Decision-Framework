# Acme Approved AI Patterns

These patterns are Acme's standard implementation paths for AI use cases.  
Every recommendation should map to one primary pattern before proposing specific services.

## Quick routing

| Pattern | Best fit | Owner profile | Complexity | Risk profile |
|---|---|---|---|---|
| [Pattern 0 - M365 Copilot baseline](pattern-0-m365-copilot.md) | Personal productivity, summarization, drafting, search in existing M365 experience | End user / business team | Low | Low to medium |
| [Pattern 1 - Agent Builder in M365 Copilot](pattern-1-agent-builder.md) | Lightweight team assistants with simple tools and prompts | Business analyst / power user | Low to medium | Medium |
| [Pattern 3 - Copilot Studio orchestrated agent](pattern-3-copilot-studio.md) | Department workflows with connectors and actions across systems | Low-code maker team | Medium to high | Medium to high |
| [Pattern 2 - Azure AI Foundry engineered agent](pattern-2-azure-ai-foundry.md) | Enterprise-grade, deeply integrated, high-control solutions | Central engineering platform team | High | High / regulated |

## Selection rule

Choose the simplest pattern that still satisfies:
1. business outcome,
2. data boundary and compliance,
3. action safety and approval model,
4. integration needs,
5. ownership capability.

If a request spans multiple patterns, pick the primary one and note secondary components in Architect Review.

