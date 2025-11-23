import { Inject, Injectable } from '@nestjs/common';
import type { PostgrestResponse } from '@supabase/supabase-js';
import type { MentorAssignment } from './mentor-assignment.types';
import type { MentorAssignmentPort } from './mentor-assignment.port';
import type { SupabaseAdminClient } from '../supabase/adminClient';

type MentorAssignmentRow = {
  mentor_id: string;
  newhire_id: string;
  revoked_at?: string | null;
};

@Injectable()
export class MentorAssignmentRepository implements MentorAssignmentPort {
  constructor(
    @Inject('SUPABASE_ADMIN_CLIENT')
    private readonly supabase: SupabaseAdminClient,
  ) {}

  async findAll(): Promise<MentorAssignment[]> {
    const { data, error } = await this.supabase
      .from('mentor_assignment')
      .select();
    if (error || !data) {
      throw error ?? new Error('Failed to fetch mentor assignments.');
    }
    return data as unknown as MentorAssignment[];
  }

  async findByMentorId(
    mentorId: string,
  ): Promise<MentorAssignment | undefined> {
    const { data, error } = (await this.supabase
      .from('mentor_assignment')
      .select()
      .eq('mentor_id', mentorId)
      .is('revoked_at', null)) as PostgrestResponse<MentorAssignmentRow>;
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      return undefined;
    }
    const newhireIds = data.map((row) => row.newhire_id);
    return { mentor_id: mentorId, newhire_ids: newhireIds };
  }

  async addAssignment(
    mentorId: string,
    newhireId: string,
  ): Promise<MentorAssignment> {
    const { error } = await this.supabase
      .from('mentor_assignment')
      .upsert(
        { mentor_id: mentorId, newhire_id: newhireId },
        { onConflict: 'mentor_id,newhire_id' },
      );
    if (error) {
      throw error;
    }
    return (
      (await this.findByMentorId(mentorId)) ?? {
        mentor_id: mentorId,
        newhire_ids: [newhireId],
      }
    );
  }

  async updateAssignments(
    mentorId: string,
    newhireIds: string[],
  ): Promise<MentorAssignment> {
    // revoke existing
    const { error: deleteError } = await this.supabase
      .from('mentor_assignment')
      .delete()
      .eq('mentor_id', mentorId);
    if (deleteError) {
      throw deleteError;
    }
    const uniqueIds = Array.from(new Set(newhireIds));
    const rows = uniqueIds.map((id) => ({
      mentor_id: mentorId,
      newhire_id: id,
    }));
    if (rows.length) {
      const { error: insertError } = await this.supabase
        .from('mentor_assignment')
        .insert(rows);
      if (insertError) {
        throw insertError;
      }
    }
    return { mentor_id: mentorId, newhire_ids: uniqueIds };
  }

  async removeAssignment(
    mentorId: string,
    newhireId: string,
  ): Promise<MentorAssignment | undefined> {
    const { error } = await this.supabase
      .from('mentor_assignment')
      .delete()
      .eq('mentor_id', mentorId)
      .eq('newhire_id', newhireId);
    if (error) {
      throw error;
    }
    return this.findByMentorId(mentorId);
  }
}
