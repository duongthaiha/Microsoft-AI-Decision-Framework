# Intake Question Bank

Ask only the questions needed to unblock the next useful artifact. Do not interrogate the user with the entire list.

## Outcome

- What business result should the POC prove?
- What user pain or operational bottleneck does this solve?
- What decision should stakeholders be able to make after the POC?
- What would make the POC a failure even if the demo works?

## Users and Workflow

- Who is the primary user?
- Where does the workflow start and end today?
- Is the experience conversational, embedded in an app, autonomous in the background, or API-driven?
- What human approval steps are required before the system takes action?

## Data and Knowledge

- What data sources are required for the POC?
- Is the data structured, unstructured, real-time, or document-based?
- Does the POC need retrieval/grounding, transactional data access, or both?
- What data is sensitive, regulated, or tenant/customer-specific?

## Actions and Integrations

- What systems must the POC read from?
- What systems must it write to or trigger?
- What actions require audit logs, approval, or rollback?
- Are there rate limits, API constraints, or downstream dependencies?

## Azure and Engineering Constraints

- Which Azure hosting model is preferred or already approved?
- Which database service is expected, if any?
- Must the app support `azd up` for one-command provision and deploy?
- Must all infrastructure be represented in Bicep from the first POC milestone?
- Does the database need private endpoint access from day one?
- Is public ingress allowed for the app tier, or does the whole workload need private access?

## Success Criteria

- What demo scenario must work end-to-end?
- What metrics prove the POC is useful?
- What nonfunctional requirements matter during the POC: latency, cost, resiliency, auditability, security, or deployment repeatability?
- Who signs off that the POC is ready to move into the next phase?
