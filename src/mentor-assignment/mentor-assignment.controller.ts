import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { MentorAssignmentService } from './mentor-assignment.service';

interface AssignmentRequestBody {
  mentorId: string;
  newhireId: string;
}

interface EditAssignmentsRequestBody {
  mentorId: string;
  newhireIds: string[];
}

@Controller('mentor-assignments')
export class MentorAssignmentController {
  constructor(
    private readonly mentorAssignmentService: MentorAssignmentService,
  ) {}

  @Get(':mentorId')
  getAssignments(@Param('mentorId') mentorId: string) {
    const result =
      this.mentorAssignmentService.getAssignmentsByMentor(mentorId);
    return { data: result };
  }

  @Post()
  assignNewhire(@Body() body: AssignmentRequestBody) {
    this.mentorAssignmentService.createAssignment(
      body.mentorId,
      body.newhireId,
    );
  }

  @Put()
  editAssignments(@Body() body: EditAssignmentsRequestBody) {
    this.mentorAssignmentService.editAssignments(
      body.mentorId,
      body.newhireIds,
    );
  }

  @Delete()
  unassign(@Body() body: AssignmentRequestBody) {
    this.mentorAssignmentService.removeAssignment(
      body.mentorId,
      body.newhireId,
    );
  }
}
