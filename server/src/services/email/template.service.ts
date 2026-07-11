export interface TemplateContext {
  participantName: string;
  teamName: string;
  teamId: string;
  leaderName: string;
  leaderEmail: string;
  hackathonName: string;
  hackathonVenue: string;
  roomName: string;
  eventDate: string;
  eventTime: string;
  registrationId: string;
  certificateUrl: string;
  [key: string]: string;
}

const DEFAULT_VALUES: Record<string, string> = {
  participantName: 'Participant',
  teamName: 'Your Team',
  teamId: 'NEX-000',
  leaderName: 'Team Leader',
  leaderEmail: '',
  hackathonName: 'the Hackathon',
  hackathonVenue: 'the Venue',
  roomName: 'TBD',
  eventDate: 'TBD',
  eventTime: '',
  registrationId: '',
  certificateUrl: '',
};

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(VARIABLE_PATTERN, (_match, varName: string) => {
    if (varName in context && context[varName]) {
      return context[varName];
    }
    if (varName in DEFAULT_VALUES) {
      return DEFAULT_VALUES[varName];
    }
    return `{{${varName}}}`;
  });
}

export function extractVariables(template: string): string[] {
  const variables: string[] = [];
  let match;
  while ((match = VARIABLE_PATTERN.exec(template)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  return variables;
}

export function hasUnresolvedVariables(rendered: string): boolean {
  return VARIABLE_PATTERN.test(rendered);
}

export const BUILTIN_TEMPLATES = [
  {
    name: 'Registration Received',
    subject: 'Registration received for {{hackathon_name}}',
    body: `<p>Dear {{participant_name}},</p>
<p>Thank you for registering for <strong>{{hackathon_name}}</strong>!</p>
<p>Your team <strong>{{team_name}}</strong> has been registered successfully.</p>
<p>Your Team ID: <code>{{team_id}}</code></p>
<p>We will keep you updated with further instructions.</p>
<p>Best regards,<br/>{{hackathon_name}} Team</p>`,
  },
  {
    name: 'Registration Approved',
    subject: 'Your registration for {{hackathon_name}} is approved!',
    body: `<p>Dear {{participant_name}},</p>
<p>Great news! Your team <strong>{{team_name}}</strong> has been approved for <strong>{{hackathon_name}}</strong>.</p>
<p><strong>Event Details:</strong></p>
<ul>
<li>Date: {{event_date}}</li>
<li>Venue: {{hackathon_venue}}</li>
<li>Team ID: <code>{{team_id}}</code></li>
</ul>
<p>Please check in at the venue on the day of the event.</p>
<p>Best regards,<br/>{{hackathon_name}} Team</p>`,
  },
  {
    name: 'Hackathon Reminder',
    subject: 'Reminder: {{hackathon_name}} starts soon!',
    body: `<p>Dear {{participant_name}},</p>
<p>This is a reminder that <strong>{{hackathon_name}}</strong> is starting soon!</p>
<p><strong>When:</strong> {{event_date}} at {{event_time}}</p>
<p><strong>Where:</strong> {{hackathon_venue}}</p>
<p>Your Team: <strong>{{team_name}}</strong> ({{team_id}})</p>
<p>Please arrive on time and proceed to your assigned room.</p>
<p>Best regards,<br/>{{hackathon_name}} Team</p>`,
  },
  {
    name: 'Check-in Instructions',
    subject: 'Check-in instructions for {{hackathon_name}}',
    body: `<p>Dear {{participant_name}},</p>
<p>Here are your check-in instructions for <strong>{{hackathon_name}}</strong>:</p>
<ol>
<li>Bring a valid ID card.</li>
<li>Your team will be checked in at the registration desk.</li>
<li>Your assigned room is: <strong>{{room_name}}</strong></li>
</ol>
<p>We look forward to seeing you!</p>
<p>Best regards,<br/>{{hackathon_name}} Team</p>`,
  },
  {
    name: 'Room Assignment',
    subject: 'Room assignment for {{hackathon_name}}',
    body: `<p>Dear {{participant_name}},</p>
<p>Your team <strong>{{team_name}}</strong> has been assigned to:</p>
<p style="font-size: 1.2em; font-weight: bold;">Room: {{room_name}}</p>
<p>Please proceed to your assigned room at the venue.</p>
<p>Best regards,<br/>{{hackathon_name}} Team</p>`,
  },
  {
    name: 'Schedule Update',
    subject: 'Schedule update for {{hackathon_name}}',
    body: `<p>Dear {{participant_name}},</p>
<p>Please note the following schedule update for <strong>{{hackathon_name}}</strong>:</p>
<p><strong>Date:</strong> {{event_date}}</p>
<p><strong>Venue:</strong> {{hackathon_venue}}</p>
<p>Please check the latest schedule at the venue.</p>
<p>Best regards,<br/>{{hackathon_name}} Team</p>`,
  },
  {
    name: 'Results Announcement',
    subject: 'Results for {{hackathon_name}} are out!',
    body: `<p>Dear {{participant_name}},</p>
<p>The results for <strong>{{hackathon_name}}</strong> are now available!</p>
<p>Thank you for participating with team <strong>{{team_name}}</strong>.</p>
<p>Certificates will be sent to your registered email shortly.</p>
<p>Best regards,<br/>{{hackathon_name}} Team</p>`,
  },
  {
    name: 'Certificate Available',
    subject: 'Your certificate for {{hackathon_name}} is ready!',
    body: `<p>Dear {{participant_name}},</p>
<p>Your certificate for participating in <strong>{{hackathon_name}}</strong> is now available.</p>
<p>You can download your certificate using the link below:</p>
<p><a href="{{certificate_url}}">Download Certificate</a></p>
<p>Congratulations on your participation!</p>
<p>Best regards,<br/>{{hackathon_name}} Team</p>`,
  },
];
