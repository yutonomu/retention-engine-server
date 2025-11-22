import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MENTOR_ASSIGNMENT_PORT } from './mentor-assignment.port';
import type { MentorAssignmentPort } from './mentor-assignment.port';

export interface MentorAssignmentListResponse {
  mentorId: string;
  newhireIds: string[];
}

@Injectable()
export class MentorAssignmentService {
  constructor(
    @Inject(MENTOR_ASSIGNMENT_PORT)
    private readonly mentorAssignmentRepository: MentorAssignmentPort,
  ) {}

  getAssignmentsByMentor(mentorId: string): Promise<MentorAssignmentListResponse> {
    return this.getAssignmentsByMentorAsync(mentorId);
  }

  private async getAssignmentsByMentorAsync(
    mentorId: string,
  ): Promise<MentorAssignmentListResponse> {
    if (!mentorId?.trim()) {
      throw new BadRequestException('mentorId is required');
    }
    const record = await this.mentorAssignmentRepository.findByMentorId(mentorId);
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

  async createAssignment(mentorId: string, newhireId: string): Promise<void> {
    if (!mentorId?.trim()) {
      throw new BadRequestException('mentorId is required');
    }
    if (!newhireId?.trim()) {
      throw new BadRequestException('newhireId is required');
    }
    await this.mentorAssignmentRepository.addAssignment(mentorId, newhireId);
  }

  async editAssignments(
    mentorId: string,
    newhireIds: string[],
  ): Promise<void> {
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
    await this.mentorAssignmentRepository.updateAssignments(
      mentorId,
      filtered,
    );
  }

  async removeAssignment(
    mentorId: string,
    newhireId: string,
  ): Promise<void> {
    if (!mentorId?.trim() || !newhireId?.trim()) {
      throw new BadRequestException('mentorId and newhireId are required');
    }
    const record = await this.mentorAssignmentRepository.removeAssignment(
      mentorId,
      newhireId,
    );
    if (!record) {
      throw new NotFoundException(`Mentor ${mentorId} has no assignments.`);
    }
    return;
  }
}
