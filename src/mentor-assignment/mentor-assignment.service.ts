import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MentorAssignmentRepository } from './mentor-assignment.repository';

export interface MentorAssignmentListResponse {
  mentorId: string;
  newhireIds: string[];
}

@Injectable()
export class MentorAssignmentService {
  constructor(
    private readonly mentorAssignmentRepository: MentorAssignmentRepository,
  ) {}

  getAssignmentsByMentor(mentorId: string): MentorAssignmentListResponse {
    if (!mentorId?.trim()) {
      throw new BadRequestException('mentorId is required');
    }
    const record = this.mentorAssignmentRepository.findByMentorId(mentorId);
    if (!record) {
      throw new NotFoundException(
        `No assignments found for mentor ${mentorId}`,
      );
    }
    return {
      mentorId: record.mentor_id,
      newhireIds: record.newhire_ids,
    };
  }

  createAssignment(mentorId: string, newhireId: string): void {
    if (!mentorId?.trim()) {
      throw new BadRequestException('mentorId is required');
    }
    if (!newhireId?.trim()) {
      throw new BadRequestException('newhireId is required');
    }
    this.mentorAssignmentRepository.addAssignment(mentorId, newhireId);
  }

  editAssignments(mentorId: string, newhireIds: string[]): void {
    if (!mentorId?.trim()) {
      throw new BadRequestException('mentorId is required');
    }
    if (!Array.isArray(newhireIds) || !newhireIds.length) {
      throw new BadRequestException(
        'newhireIds must include at least one entry',
      );
    }
    const filtered = Array.from(new Set(newhireIds.filter((id) => id?.trim())));
    if (!filtered.length) {
      throw new BadRequestException('newhireIds must include valid entries');
    }
    this.mentorAssignmentRepository.updateAssignments(mentorId, filtered);
  }

  removeAssignment(mentorId: string, newhireId: string): void {
    if (!mentorId?.trim() || !newhireId?.trim()) {
      throw new BadRequestException('mentorId and newhireId are required');
    }
    const record = this.mentorAssignmentRepository.removeAssignment(
      mentorId,
      newhireId,
    );
    if (!record) {
      throw new NotFoundException(`Mentor ${mentorId} has no assignments.`);
    }
  }
}
