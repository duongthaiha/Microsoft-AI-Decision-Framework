/**
 * Cosmos DB read-only store for Projects.
 * Partition key `/projectId` — Projects are organization-wide artifacts, not
 * scoped to a single user.  The agent reads Projects for Step 1b (Reuse Gate)
 * and to resolve linked Project metadata on a Request.
 *
 * Admin write path (promote Request → Project, update metadata) is out of band
 * for MVP and is NOT represented here.
 *
 * see spec §7 Backend model — "Project"
 * Microsoft Learn: https://learn.microsoft.com/azure/cosmos-db/nosql/
 */

import { NotImplementedError } from "../errors.js";
import type { Project } from "./models.js";

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export interface ProjectFilters {
  status?: Project["status"];
  technologies?: string[];
  owner?: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IProjectStore {
  /**
   * Returns a single Project by projectId.
   * Point-read using /projectId partition key.
   */
  getProject(projectId: string): Promise<Project | null>;

  /**
   * Returns a list of Projects matching the optional filters.
   * Cross-partition when no projectId filter is provided.
   */
  listProjects(filters?: ProjectFilters): Promise<Project[]>;

  /**
   * Returns all Requests linked to a given Project.
   * Used by the admin Projects detail screen (FR-029).
   */
  listLinkedRequests(projectId: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Stub implementation
// ---------------------------------------------------------------------------

/**
 * Stub — every method throws NotImplementedError.
 *
 * M1 will implement Cosmos DB reads against the 'projects' container.
 * The similarity index in Azure AI Search is the primary path for Reuse Gate
 * matching (see project-index.ts); this store is for metadata lookups and
 * admin detail screens.
 */
export class CosmosProjectStore implements IProjectStore {
  getProject(_projectId: string): Promise<Project | null> {
    // M1: point-read by (projectId, projectId partition key).
    throw new NotImplementedError("CosmosProjectStore.getProject");
  }

  listProjects(_filters?: ProjectFilters): Promise<Project[]> {
    // M1: query 'projects' container with optional filters.
    // Note: cross-partition read required when no single projectId is specified.
    throw new NotImplementedError("CosmosProjectStore.listProjects");
  }

  listLinkedRequests(_projectId: string): Promise<string[]> {
    // M1: return project.linkedRequestIds from the Project document.
    // Used by admin Projects detail screen (FR-029); requires AdvisorAdmin role at the API layer.
    throw new NotImplementedError("CosmosProjectStore.listLinkedRequests");
  }
}
