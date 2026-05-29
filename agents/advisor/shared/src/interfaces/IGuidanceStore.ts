import type { CustomerGuidanceDocument } from '../types/guidance.js';

export interface IGuidanceStore {
  loadActiveGuidance(customerOrganizationId: string): Promise<CustomerGuidanceDocument | null>;
}
