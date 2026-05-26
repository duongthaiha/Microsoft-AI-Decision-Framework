/*
  foundry.bicep — Foundry / Hosted Agent placeholder module.

  STATUS: Foundry Hosted Agent Bicep resource coverage is in PREVIEW as of M0.
  The resource type `Microsoft.FoundryService/agents` (or equivalent) is not yet
  GA in the Azure Bicep / ARM provider. Until it reaches GA parity, the Hosted
  Agent lifecycle (create/update/version/deploy) is managed via an explicit AZD
  predeploy hook that calls the Foundry CLI or REST API.

  AZD hook: See `scripts/deploy-hosted-agent.sh` (to be added in M1).
  The hook is referenced in azure.yaml as hooks.predeploy.

  Per product-spec.md §9 line 371:
    "If a Hosted Agent operation requires Azure CLI or REST, document it as an
    explicit AZD hook/script rather than hiding it in manual portal work."

  When Foundry Hosted Agent Bicep support reaches GA, replace the commented
  resource block below with the actual resource declaration.

  Docs: https://learn.microsoft.com/azure/foundry/agents/concepts/hosted-agents
*/

@description('Prefix for the agent resource name.')
param namePrefix string

@description('Foundry Hosted Agent invocation protocol: "responses" or "invocations".')
@allowed(['responses', 'invocations'])
param hostedAgentProtocol string = 'responses'

@description('Copilot SDK model path.')
@allowed(['azure-byom', 'github-default'])
param modelPath string = 'azure-byom'

// ---------------------------------------------------------------------------
// TODO: Replace the block below with a real Bicep resource declaration once
// Microsoft.FoundryService/agents (or the confirmed resource type) reaches GA.
//
// Expected shape (subject to change — verify against MS Learn before using):
//
// resource hostedAgent 'Microsoft.FoundryService/agents@<preview-api-version>' = {
//   name: '${namePrefix}-agent'
//   location: resourceGroup().location
//   properties: {
//     protocol: hostedAgentProtocol   // 'responses' | 'invocations'
//     modelPath: modelPath            // 'azure-byom' | 'github-default'
//     // identity wired via the agent managed identity from identity.bicep
//   }
// }
//
// AZD hook bridge (until GA):
//   scripts/deploy-hosted-agent.sh — calls:
//     az rest --method PUT \
//       --url "https://management.azure.com/subscriptions/.../providers/Microsoft.FoundryService/agents/..." \
//       --body @agent-config.json
//   or equivalent Foundry CLI command once documented.
// ---------------------------------------------------------------------------

// Placeholder output so downstream modules can reference the agent name
// without depending on the real resource existing yet.
output agentPlaceholder string = '${namePrefix}-agent'
