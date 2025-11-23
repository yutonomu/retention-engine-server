import type { MentorAssignment } from './mentor-assignment.types';

export interface MentorAssignmentPort {
  findAll(): Promise<MentorAssignment[]>;
  findByMentorId(mentorId: string): Promise<MentorAssignment | undefined>;
  addAssignment(mentorId: string, newhireId: string): Promise<MentorAssignment>;
  updateAssignments(
    mentorId: string,
    newhireIds: string[],
  ): Promise<MentorAssignment>;
  removeAssignment(
    mentorId: string,
    newhireId: string,
  ): Promise<MentorAssignment | undefined>;
}

export const MENTOR_ASSIGNMENT_PORT = 'MENTOR_ASSIGNMENT_PORT';
