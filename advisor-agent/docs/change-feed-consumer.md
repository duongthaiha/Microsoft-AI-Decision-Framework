# Cosmos DB Change Feed Consumer Contract

## Overview

When a user submits an AI project idea, the advisor writes a `Request` document to Azure Cosmos DB with `status: New`. Downstream systems (e.g., a triage dashboard, a workflow engine, a metrics collector) can consume these `New` Requests via **Cosmos DB's Change Feed**.

This guide describes the change feed contract and provides a sample TypeScript consumer using the `@azure/cosmos` SDK.

## Change Feed Basics

Cosmos DB's Change Feed is an event stream of all changes to documents in a container. Consumers can:

- **Poll periodically:** Fetch change feed items every N minutes
- **Listen continuously:** Stream changes in real-time via a ChangeFeedProcessor
- **Replay history:** Start from a specific point in time

For detailed Change Feed patterns, see [Azure Cosmos DB Change Feed Design Patterns](https://learn.microsoft.com/azure/cosmos-db/nosql/change-feed-design-patterns).

## Document Shape on Status: New

When a Request reaches `status: New`, the consumer receives a change feed item in this shape:

```typescript
interface RequestChangeEvent {
  // Document identity
  id: string;                                // Request ID (same as requestId in doc)
  requestId: string;
  sessionId: string;
  ownerId: string;                           // User's Entra oid (or demo id)
  
  // Business content
  title: string;
  businessOutcome: string;
  targetUsers: string;
  desiredBehavior: string;
  dataSources: string[];
  actions: string[];
  constraints: string[];
  
  // Framework answers (from Phase 1–3)
  frameworkAnswers: {
    viability: number;
    desirability: number;
    feasibility: number;
    q1_userInteraction: string;
    q2_buildStyle: string;
    q3_dataStrategy: string;
    q4_orchestrationComplexity: number;
    q5_compliance: string;
    q6_scale: string;
    q7_actionSafety: string;
    q8_teamSkills: string[];
    q9_proactive: boolean;
  };
  
  // Reuse decision
  similarProjectMatches?: Array<{
    projectId: string;
    name: string;
    owner: string;
    relevanceScore: number;
  }>;
  reuseDecision: "new" | "link-to-existing" | "cancel";
  linkedProjectId?: string;
  
  // Readiness brief
  readinessBriefRef: {
    recommendedPlatform: string;
    rationale: string;
    estimatedComplexity: string;
    risks: string[];
    nextActions: string[];
    customInstructionAlignment: Array<{
      instructionId: string;
      outcome: string;
      reason?: string;
    }>;
  };
  
  // Status and org context
  status: "New";                             // Only "New" requests are forwarded
  orgContextVersion: number;                 // Version of org policy applied
  timestamps: {
    createdAt: string;
    submittedAt: string;
  };
  
  // Cosmos DB metadata
  _rid: string;
  _self: string;
  _ts: number;                               // Cosmos DB timestamp (for ordering)
  _etag: string;
}
```

## Sample TypeScript Consumer

This example uses the `@azure/cosmos` ChangeFeedProcessor to listen for `status: New` Requests and process them.

```typescript
import { CosmosClient, ChangeFeedProcessor } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";

const cosmosEndpoint = "https://<cosmos-account>.documents.azure.com:443/";
const databaseId = "advisor-db";
const containerId = "requests";
const leaseContainerId = "change-feed-leases"; // Processor tracks progress here

// Initialize client with managed identity
const credential = new DefaultAzureCredential();
const client = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });

const database = client.database(databaseId);
const requestsContainer = database.container(containerId);
const leaseContainer = database.container(leaseContainerId);

// Initialize ChangeFeedProcessor
const changeFeedProcessor = requestsContainer.changeFeed()
  .startFrom("Beginning")  // Start from first item; use "Now" for new items only
  .create({
    maxItemsPerPage: 100,
    leaseContainer,
    onChanges: async (changes, context) => {
      for (const change of changes) {
        // Check if status is "New"
        if (change.status === "New") {
          console.log(`Processing new Request: ${change.requestId}`);
          
          // Your business logic here:
          // - Send to a triage workflow
          // - Index in a metrics dashboard
          // - Trigger notifications
          // - Archive to a data lake
          // etc.
          
          try {
            await processNewRequest(change);
            console.log(`✓ Processed ${change.requestId}`);
          } catch (error) {
            console.error(`✗ Failed to process ${change.requestId}:`, error);
            // On error, the processor will retry on the next batch
            throw error;  // Signal failure so processor retries
          }
        }
      }
    },
    onError: (error) => {
      console.error("ChangeFeedProcessor error:", error);
    },
  });

// Start listening
await changeFeedProcessor.start();
console.log("Change feed processor started. Listening for status: New requests...");

// Keep the processor running
process.on("SIGINT", async () => {
  await changeFeedProcessor.stop();
  console.log("Change feed processor stopped.");
  process.exit(0);
});

// Example business logic
async function processNewRequest(request: RequestChangeEvent) {
  // Example: Log to a downstream system
  const payload = {
    requestId: request.requestId,
    submittedBy: request.ownerId,
    businessOutcome: request.businessOutcome,
    recommendedPlatform: request.readinessBriefRef.recommendedPlatform,
    status: "pending-review",
  };
  
  // POST to downstream triage service
  const response = await fetch("https://triage-service.example.com/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    throw new Error(`Triage service returned ${response.status}`);
  }
}
```

## Consumer Best Practices

1. **Use managed identity:** The consumer should authenticate to Cosmos DB using a managed identity (or DefaultAzureCredential in local dev), not a connection string.

2. **Filter by status:** Always check `change.status === "New"` to avoid processing drafts or other statuses.

3. **Idempotent processing:** Design your consumer so processing the same Request multiple times is safe (e.g., store the `requestId` in your system; if you've seen it, skip it).

4. **Lease container:** The ChangeFeedProcessor tracks progress in the lease container. Make sure the processor's identity can write to this container.

5. **Error handling:** If processing fails, let the error propagate so the processor retries. Log the failure with the `requestId` for debugging.

6. **Monitoring:** Track processor lag (delay between Cosmos DB write and your processing). Alert if lag exceeds SLA.

## Deployment

In your environment:

1. **Create the lease container** (if it doesn't exist):
   ```bash
   az cosmosdb sql container create \
     --account-name <cosmos-account> \
     --database-name <db-id> \
     --name change-feed-leases \
     --partition-key-path /id
   ```

2. **Assign RBAC to the consumer identity:**
   ```bash
   az cosmosdb sql role assignment create \
     --account-name <cosmos-account> \
     --resource-group <resource-group> \
     --scope "/dbs/<db-id>/colls/requests" \
     --principal-id <consumer-identity-objectid> \
     --role-definition-id <reader-role-id>
   
   az cosmosdb sql role assignment create \
     --account-name <cosmos-account> \
     --resource-group <resource-group> \
     --scope "/dbs/<db-id>/colls/change-feed-leases" \
     --principal-id <consumer-identity-objectid> \
     --role-definition-id <read-write-role-id>
   ```

3. **Run the consumer** as a containerized service or Azure Function.

## Testing the Contract

To verify the contract locally:

```bash
# Start Cosmos DB emulator or connect to test environment
npm install @azure/cosmos @azure/identity

# Run the sample consumer
node change-feed-consumer.ts

# Submit a Request in the advisor and watch the consumer process it
```

---

## Supported Changes

Currently, only `status: New` transitions trigger a change feed event for downstream consumption. In M2+, you may extend this to:

- `status: ReadyForConfirmation` (brief ready for user review)
- `status: Archived` (user abandons session)
- `linkedProjectId` changes (user links to a different project)

---

See [docs/data-model.md](./data-model.md) for the full Request schema and [Azure Cosmos DB Change Feed Design Patterns](https://learn.microsoft.com/azure/cosmos-db/nosql/change-feed-design-patterns) for advanced patterns (multiple consumers, scaling, replaying history).
