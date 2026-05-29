# Ghost — History

## Seed Context
- **Project:** Microsoft-AI-Decision-Framework — AI Framework Advisor Agent POC.
- **Principle:** Public ingress only for app/API tier; data plane (Cosmos, AI Search, storage) stays private with public access disabled. Managed identity preferred; secrets only in Key Vault.
- **Auth:** Entra ID / Entra External ID for customer-facing users/admins; admin instructions scoped per customer org.
- **Output root:** security artifacts/docs under `agents/advisor/`.
- **User:** Ha Duong.

## Learnings
