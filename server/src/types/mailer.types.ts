/**
 * Mailer / email service types.
 */
export interface SendInvitationEmailOptions {
  to: string;
  firstName: string;
  setPasswordUrl: string;
}
