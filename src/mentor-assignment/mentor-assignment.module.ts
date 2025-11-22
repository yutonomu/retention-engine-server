import { Module } from '@nestjs/common';
import { MentorAssignmentController } from './mentor-assignment.controller';
import { MentorAssignmentService } from './mentor-assignment.service';
import { MentorAssignmentRepository } from './mentor-assignment.repository';

@Module({
  controllers: [MentorAssignmentController],
  providers: [MentorAssignmentService, MentorAssignmentRepository],
  exports: [MentorAssignmentService],
})
export class MentorAssignmentModule {}
