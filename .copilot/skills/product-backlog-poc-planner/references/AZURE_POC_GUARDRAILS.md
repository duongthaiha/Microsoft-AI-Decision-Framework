# Azure POC Guardrails

These guardrails keep the POC small without making it disposable.

## Bicep Requirements

Microsoft Learn describes Bicep as a declarative infrastructure-as-code language for deploying Azure resources, with support for parameters, conditions, loops, and modules. Treat Bicep as the source of truth for Azure resources.

Backlog requirements:

- Create an `infra/` folder for Bicep assets.
- Use parameters for environment-specific values.
- Use modules when resource groups become too large to reason about.
- Include outputs needed by app deployment configuration.
- Add validation tasks for Bicep linting and preflight/what-if checks where the team workflow supports them.

Reference: [Fundamentals of Bicep](https://learn.microsoft.com/training/paths/fundamentals-bicep/)

## Azure Developer CLI Requirements

Microsoft Learn describes `azd` templates as repositories that typically include an `infra/` folder, `azure.yaml`, `.azure` environment configuration, and deployable source folders. `azd up` runs package, provision, and deploy phases for supported templates.

Backlog requirements:

- Add `azure.yaml` at the repository root for the POC application.
- Map each deployable service to the Azure resource that hosts it.
- Support:
  - `azd provision` for infrastructure.
  - `azd deploy` for application deployment.
  - `azd up` for end-to-end provision and deploy.
- Document required `azd env` values without committing secrets.
- Include a story to add CI/CD only if the POC needs repeatable shared deployment.

References:

- [What is the Azure Developer CLI?](https://learn.microsoft.com/azure/developer/azure-developer-cli/overview)
- [Azure Developer CLI templates overview](https://learn.microsoft.com/azure/developer/azure-developer-cli/azd-templates)
- [Full-stack deployment with Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/full-stack-deployment)

## Identity and Secrets

Backlog requirements:

- Prefer managed identity for Azure resource access.
- Store secrets in Key Vault or managed hosting configuration.
- Do not put secrets in source, sample backlog output, Bicep parameter files, or `azd` environment files.
- Add RBAC tasks for each service-to-service dependency.

## Architecture Decision Defaults

Use these defaults unless the user says otherwise:

| Decision | Default |
|---|---|
| IaC | Bicep |
| Deployment | `azd` with `azure.yaml` and `infra/` |
| Database access | Private endpoint and private DNS |
| Credentials | Managed identity first, Key Vault for secrets |
| Public database access | Disabled where supported |
| POC scope | Thin end-to-end slice with production-shaped deployment and security bones |
