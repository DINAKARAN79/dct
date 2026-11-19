import { describe, expect, it } from 'vitest';
import { getSidebarItems } from './profileSecurity';

describe('profile security sidebar items', () => {
  it('includes database navigation objects and excludes disabled or built-in duplicates', () => {
    const items = getSidebarItems([
      { name: 'WarrantyCase', label: 'Warranty Case', pluralLabel: 'Warranty Cases', isAvailableInNavigation: true },
      { name: 'HiddenRecord', label: 'Hidden Record', pluralLabel: 'Hidden Records', isAvailableInNavigation: false },
      { name: 'Lead', label: 'Lead', pluralLabel: 'Leads', isAvailableInNavigation: true },
      { name: 'Activity', label: 'Activity', pluralLabel: 'Activities', isAvailableInNavigation: true },
      { name: 'Enquiry', label: 'Enquiry', pluralLabel: 'Enquiries', isAvailableInNavigation: true },
      { name: 'Task', label: 'Task', pluralLabel: 'Tasks', isAvailableInNavigation: true },
    ]);

    expect(items.some((item) => item.id === 'object:WarrantyCase' && item.label === 'Warranty Cases')).toBe(true);
    expect(items.some((item) => item.id === 'object:HiddenRecord')).toBe(false);
    expect(items.filter((item) => item.id === 'leads')).toHaveLength(1);
    expect(items.some((item) => item.id === 'object:Lead')).toBe(false);
    expect(items.some((item) => ['object:Activity', 'object:Enquiry', 'object:Task'].includes(item.id))).toBe(false);
  });
});
