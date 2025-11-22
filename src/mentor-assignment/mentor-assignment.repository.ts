import { Injectable } from '@nestjs/common';
import type { MentorAssignment } from './mentor-assignment.types';
import { mentorAssignmentData } from './data/mentor-assignment.data';

@Injectable()
export class MentorAssignmentRepository {
  private readonly assignments: MentorAssignment[] = [...mentorAssignmentData];

  findAll(): MentorAssignment[] {
    return this.assignments;
  }

  findByMentorId(mentorId: string): MentorAssignment | undefined {
    return this.assignments.find((assignment) => assignment.mentor_id === mentorId);
  }

  addAssignment(mentorId: string, newhireId: string): MentorAssignment {
    let record = this.findByMentorId(mentorId);
    if (!record) {
      record = { mentor_id: mentorId, newhire_ids: [] };
      this.assignments.push(record);
    }
    if (!record.newhire_ids.includes(newhireId)) {
      record.newhire_ids.push(newhireId);
    }
    return record;
  }

  updateAssignments(mentorId: string, newhireIds: string[]): MentorAssignment {
    let record = this.findByMentorId(mentorId);
    if (!record) {
      record = { mentor_id: mentorId, newhire_ids: [] };
      this.assignments.push(record);
    }
    record.newhire_ids = Array.from(new Set(newhireIds));
    return record;
  }

  removeAssignment(mentorId: string, newhireId: string): MentorAssignment | undefined {
    const record = this.findByMentorId(mentorId);
    if (!record) {
      return undefined;
    }
    record.newhire_ids = record.newhire_ids.filter((id) => id !== newhireId);
    return record;
  }
}
