# Acme — Systems Inventory & Approved Platforms

> **Fictional org notice.** Illustrative, anonymized estate for a Microsoft-aligned
> UK insurer. Realistic but invented; confirm specifics with Acme's architecture
> board before building.

This is the **terrain** a recommendation must fit. Use it to answer the framework's
build-style (Q2), data-grounding (Q3), trust-boundary (Q5), integration, and
operationalize questions without asking the business user.

## Platform stance (read this first)

Acme is **Microsoft-first**. The order of preference for any new AI capability:

1. **Adopt** a Microsoft-managed experience (Microsoft 365 Copilot, built-in
   Copilots, Copilot for Sales).
2. **Extend** an existing Copilot (Copilot Studio agents, declarative agents,
   connectors).
3. **Build custom** on Azure (Azure AI Foundry, Azure OpenAI, AI Search) — only when
   adopt/extend cannot meet the need.

Recommend a custom build only after showing why the managed and extensibility paths
do not fit.

## Cloud & platform estate

| Capability | Acme platform | Notes |
|---|---|---|
| Cloud | **Microsoft Azure** | API-first; governed **landing zones**; primary regions **UK South / UK West**. |
| Productivity & collaboration | **Microsoft 365** (Teams, SharePoint, Outlook, Viva) | Primary employee surface; SharePoint is the unstructured-knowledge home. |
| End-user AI | **Microsoft 365 Copilot** | Rolling out for employee productivity. |
| CRM & service | **Dynamics 365** (Customer Service, Sales) + **Copilot for Sales** | 360° customer view across direct teams and ~280 agencies. |
| Core insurance | **Guidewire suite** — PolicyCenter, ClaimCenter, BillingCenter, DataHub, InfoCenter | System of record for policy, claims, billing. Integrate; do not replace. |
| Financial advice | **Adviser Hub** (Azure-native advice platform) | API-first; handles advisers, compliance, workflow, valuations, documents. |
| Data & analytics | **Azure Data Platform** / **Data Centre of Excellence** | Enterprise analytics + AI grounding for structured data. |
| Low-code | **Power Platform** (Power Apps, Power Automate) + **Copilot Studio** | Business-unit makers build here. |
| Identity | **Microsoft Entra ID** | SSO, conditional access, MFA — the single identity authority. |
| Security | **Microsoft Sentinel** + **Microsoft Defender** | SIEM/SOAR; security baked into the platform. |

## Approved vs. exception platforms

- **Approved / preferred:** Azure (incl. Azure AI Foundry, Azure OpenAI, Azure AI
  Search), Microsoft 365 + Copilot, Copilot Studio, Power Platform, Dynamics 365,
  Guidewire (integration only), Microsoft Entra ID, Microsoft Sentinel.
- **Requires architecture-board exception:** non-Microsoft AI clouds/models,
  third-party SaaS that processes Acme customer data, any service without a UK data
  region, open-source agent frameworks in production.

When a request implies an exception platform, name Acme's sanctioned equivalent
first, then note the exception path exists but requires board approval.

## Integration points (what new solutions must touch)

A recommendation almost always has to interoperate with:

- **Dynamics 365** — customer, case, and interaction data.
- **Guidewire** — policy, claims, and billing (system of record; mutations are
  high-stakes and governed).
- **Microsoft 365 / SharePoint** — documents, policies, knowledge (via Microsoft
  Graph).
- **Azure Data Platform** — curated structured data for analytics and grounding.
- **Microsoft Entra ID** — all authentication and authorization.

## Data-grounding options (for Q3)

| Need | Use |
|---|---|
| Unstructured docs / policies / knowledge | Microsoft 365 + SharePoint via **Microsoft Graph**; Microsoft 365 Copilot for employee Q&A. |
| Structured policy/claims/billing | **Guidewire** (DataHub/InfoCenter) + **Azure Data Platform**. |
| Custom retrieval / RAG | **Azure AI Search** as the grounding/index layer inside the landing zone. |
| Customer/advice context | **Dynamics 365** + **Adviser Hub** APIs (governed). |

## Identity & networking

- **Identity:** Microsoft Entra ID for all users and workloads; managed identities
  for Azure services; conditional access enforced. No standalone credential stores.
- **Networking:** sensitive workloads use **private endpoints** and VNet
  integration; **no public egress of customer or regulated data**. UK-region
  residency is mandatory.

## Build-style split (for Q2 / Q8)

| If the owner is... | Recommend a build style of... | Example |
|---|---|---|
| A business-unit maker team | **Low-code** — Copilot Studio agent or Power Platform | Departmental knowledge agent, simple automation |
| The central platform team | **Pro-code** — Azure AI Foundry / Azure OpenAI + AI Search | Custom orchestration, deep integration with Guidewire/D365 |
| The Data Centre of Excellence | **Pro-code data/AI** | Models, data products, analytics-grounded AI |

Always tie the recommended build style to the team that will own and operate it.
