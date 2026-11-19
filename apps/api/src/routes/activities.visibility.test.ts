import { describe, expect, it } from 'vitest';
import { calendarActivityVisibilityFilter } from './activities';

describe('calendar activity visibility', () => {
  it('limits users to their own and descendant-role activities', () => {
    expect(calendarActivityVisibilityFilter({ type: 'TEAM', userIds: ['user-a', 'tm-a', 'tm-b'] })).toEqual({
      userId: { in: ['user-a', 'tm-a', 'tm-b'] },
    });
  });

  it('returns no additional owner constraint for an all-access scope', () => {
    expect(calendarActivityVisibilityFilter({ type: 'ALL' })).toEqual({});
  });
});
