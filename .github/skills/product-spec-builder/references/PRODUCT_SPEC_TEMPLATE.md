# Product Specification Template

Use this template to produce the final Markdown product specification. Keep confirmed decisions, assumptions, and open questions distinct. Replace placeholder text; do not leave "TBD" unless it is explicitly listed under Open Questions.

## Metadata

| Field | Value |
|-------|-------|
| Product/feature name |  |
| Status | Draft / Ready for dev handoff / Blocked |
| Owner |  |
| Date |  |
| Source repository |  |
| Target release or milestone |  |

## 1. Executive Summary

### What we are building

Describe the feature in one or two paragraphs.

### Why it matters

Explain the user or business outcome. Focus on the job to be done, not the technology.

### What this is not

List non-goals so the dev team does not accidentally expand scope.

## 2. Users and Jobs

| User or operator | Job to be done | Current pain | Success signal |
|------------------|----------------|--------------|----------------|
|  |  |  |  |

## 3. Scope

### In scope

- <item>

### Out of scope

- <item>

### Assumptions

- <assumption>

## 4. User Journeys

### Happy path

1. <step>
2. <step>
3. <step>

### Edge cases

| Scenario | Expected behavior | Owner |
|----------|-------------------|-------|
|  |  |  |

## 5. Functional Requirements

| ID | Requirement | Priority | Acceptance signal |
|----|-------------|----------|-------------------|
| FR-001 |  | Must |  |

## 6. Acceptance Criteria

- [ ] <criterion>
- [ ] <criterion>
- [ ] <criterion>

## 7. Data, Actions, and Integrations

### Data sources

| Source | Data used | Access pattern | Sensitivity | Notes |
|--------|-----------|----------------|-------------|-------|
|  |  |  |  |  |

### Actions and side effects

| Action | Trigger | Approval needed? | Rollback or compensation |
|--------|---------|------------------|--------------------------|
|  |  |  |  |

### Integrations

| System | Direction | Protocol/API | Auth model | Notes |
|--------|-----------|--------------|------------|-------|
|  |  |  |  |  |

## 8. Architecture Overview

Describe the major components, responsibilities, and system boundaries. Include a diagram if the target project expects diagrams.

### Key design decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
|  |  |  |

## 9. Azure Deployment Requirements

### Infrastructure as code: Bicep

- Bicep is the required IaC format.
- Expected structure:
  - `infra/main.bicep`
  - environment-specific parameters or overlays
  - reusable modules when the resource set grows beyond a simple template
- Every required Azure resource must be represented in Bicep or explicitly listed as an exception.

### AZD deployability

- The feature must be deployable with Azure Developer CLI unless explicitly exempted.
- Include or update:
  - `azure.yaml`
  - documented environment setup
  - documented deploy command, usually `azd up` or `azd deploy`
  - any required pre-provisioning steps

### Identity: managed identity first

- Use managed identity where the Azure service supports Microsoft Entra authentication.
- Prefer no application secrets in local config, CI variables, or app settings.
- If a secret is unavoidable, document:
  - why managed identity is not possible
  - where the secret is stored
  - who owns rotation
  - the rotation interval

### Environments

| Environment | Purpose | Deployment command | Approval gate |
|-------------|---------|--------------------|---------------|
| dev |  |  |  |
| test |  |  |  |
| prod |  |  |  |

## 10. Networking Configuration

### Selected posture

Choose one and document the rationale:

- Public: public ingress is acceptable with strong auth and monitoring.
- Private: no public ingress/data access; use private endpoints, VNet integration, or equivalent private connectivity where supported.
- Hybrid: public UI/API where needed, private data plane and internal service access.

Selected posture:

Rationale:

### Network requirements

| Area | Requirement | Notes |
|------|-------------|-------|
| Ingress |  |  |
| Egress |  |  |
| Private endpoints |  |  |
| VNet integration |  |  |
| DNS |  |  |
| Firewall or NSG rules |  |  |
| Local development |  |  |

### Networking open questions

- <question>

## 11. Security and Governance

| Concern | Requirement | Owner |
|---------|-------------|-------|
| Authentication |  |  |
| Authorization |  |  |
| Secrets | Managed identity first; document any exception |  |
| Data retention |  |  |
| Audit logging |  |  |
| Compliance constraints |  |  |

## 12. Observability and Operations

| Signal | Requirement | Alert or dashboard |
|--------|-------------|--------------------|
| Logs |  |  |
| Metrics |  |  |
| Traces |  |  |
| Availability |  |  |
| Cost |  |  |

### Runbook requirements

- <runbook item>

## 13. Documentation Requirements

The dev team must produce or update:

- [ ] README or feature overview.
- [ ] Local setup guide.
- [ ] AZD deployment instructions.
- [ ] Bicep infrastructure notes.
- [ ] Managed identity and access setup notes.
- [ ] Networking configuration notes.
- [ ] Operational runbook.
- [ ] Troubleshooting guide.

## 14. Testing Strategy

| Test type | Coverage needed | Owner |
|-----------|-----------------|-------|
| Unit |  |  |
| Integration |  |  |
| End-to-end |  |  |
| Security |  |  |
| Deployment smoke |  |  |

## 15. Rollout and Migration

| Phase | Entry criteria | Exit criteria | Rollback |
|-------|----------------|---------------|----------|
| Pilot |  |  |  |
| Production |  |  |  |

## 16. Risks

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
|  |  |  |  |

## 17. Open Questions

| Question | Why it matters | Owner | Needed by |
|----------|----------------|-------|-----------|
|  |  |  |  |

## 18. Decision Log

| Date | Decision | Rationale | Source |
|------|----------|-----------|--------|
|  |  |  |  |

## 19. Dev Handoff Checklist

- [ ] User outcome is clear.
- [ ] Scope and non-goals are explicit.
- [ ] Acceptance criteria are testable.
- [ ] Data sources, actions, and integrations are documented.
- [ ] Bicep requirements are documented.
- [ ] AZD deployability is documented.
- [ ] Managed identity is the default or exceptions are justified.
- [ ] Networking posture is selected and documented.
- [ ] Documentation deliverables are listed.
- [ ] Open questions have owners.
