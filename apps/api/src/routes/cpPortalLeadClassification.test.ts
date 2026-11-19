import { describe, expect, it } from 'vitest';
import {
  getCPPortalDashboardLeadCount,
  getCPPortalLeadClassification,
  getCPPortalLeadMatchInput,
} from './cpPortalLeadClassification';

describe('CP portal lead classification', () => {
  it('marks a phone-matched lead as Existing and No Count', () => {
    expect(getCPPortalLeadClassification('ADDITIONAL')).toEqual({
      type: 'Existing',
      status: 'No Count',
    });
  });

  it('marks a newly created lead as New and Count', () => {
    expect(getCPPortalLeadClassification('ORIGINAL')).toEqual({
      type: 'New',
      status: 'Count',
    });
  });

  it('checks both primary and secondary phones and emails, excluding tertiary contacts', () => {
    const input = {
      phones: [
        { field: 'phone', value: 'primary' },
        { field: 'secondaryPhone', value: 'secondary' },
        { field: 'tertiaryPhone', value: 'tertiary' },
      ],
      emails: [
        { field: 'email', value: 'primary@example.com' },
        { field: 'secondaryEmail', value: 'secondary@example.com' },
        { field: 'tertiaryEmail', value: 'tertiary@example.com' },
      ],
    };

    expect(getCPPortalLeadMatchInput(input)).toEqual({
      phones: input.phones.slice(0, 2),
      emails: input.emails.slice(0, 2),
    });
  });

  it('counts CP-owned New leads and Existing submission rows', () => {
    expect(getCPPortalDashboardLeadCount(3, 4)).toBe(7);
  });
});
