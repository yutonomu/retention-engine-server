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
  async assignNewhire(@Body() body: AssignmentRequestBody) {
    await this.mentorAssignmentService.createAssignment(
      body.mentorId,
      body.newhireId,
    );
    return { success: true };
  }

  @Put()
  async editAssignments(@Body() body: EditAssignmentsRequestBody) {
    await this.mentorAssignmentService.editAssignments(
      body.mentorId,
      body.newhireIds,
    );
    return { success: true };
  }

  @Delete()
  unassign(@Body() body: AssignmentRequestBody) {
    this.mentorAssignmentService.removeAssignment(
      body.mentorId,
      body.newhireId,
    );
  }
}
