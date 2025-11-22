import type { MentorAssignment } from '../mentor-assignment.types';

/**
 * In-memory mentor → new hire assignments.
 * mentor_id is treated as the primary key, and each entry holds
 * a list of assigned new hire user IDs.
 */
export const mentorAssignmentData: MentorAssignment[] = [
  {
    mentor_id: 'user-002',
    newhire_ids: ['user-001', 'user-003'],
  },
  {
    mentor_id: 'user-004',
    newhire_ids: ['user-005'],
  },
];
