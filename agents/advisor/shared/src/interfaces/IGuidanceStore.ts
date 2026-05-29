import type { CustomerGuidanceDocument } from '../types/guidance.js';

export interface IGuidanceStore {
  loadActiveGuidance(customerOrganizationId: string): Promise<CustomerGuidanceDocument | null>;
  loadAllGuidance(customerOrganizationId: string): Promise<CustomerGuidanceDocument[]>;
  saveGuidance(doc: CustomerGuidanceDocument): Promise<void>;
  activateGuidance(customerOrganizationId: string, instructionSetId: string): Promise<void>;
}
