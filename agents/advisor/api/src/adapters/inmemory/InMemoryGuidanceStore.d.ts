import type { IGuidanceStore } from '@advisor/shared';
import type { CustomerGuidanceDocument } from '@advisor/shared';
export declare class InMemoryGuidanceStore implements IGuidanceStore {
    private store;
    loadActiveGuidance(customerOrganizationId: string): Promise<CustomerGuidanceDocument | null>;
}
//# sourceMappingURL=InMemoryGuidanceStore.d.ts.map