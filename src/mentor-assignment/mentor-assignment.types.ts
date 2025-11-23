export interface MentorAssignment {
  /**
   * Mentor user ID (primary key)
   */
  mentor_id: string;
  /**
   * List of new hire user IDs assigned to the mentor.
   */
  newhire_ids: string[];
}
