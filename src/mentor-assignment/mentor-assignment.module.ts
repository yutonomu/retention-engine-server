import { Module } from '@nestjs/common';
import { MentorAssignmentController } from './mentor-assignment.controller';
import { MentorAssignmentService } from './mentor-assignment.service';
import { MentorAssignmentRepository } from './mentor-assignment.repository';
import { MENTOR_ASSIGNMENT_PORT } from './mentor-assignment.port';

@Module({
  controllers: [MentorAssignmentController],
  providers: [
    MentorAssignmentService,
    {
      provide: MENTOR_ASSIGNMENT_PORT,
      useClass: MentorAssignmentRepository,
    },
  ],
  exports: [
    MentorAssignmentService,
    MENTOR_ASSIGNMENT_PORT,
  ],
})
export class MentorAssignmentModule {}
