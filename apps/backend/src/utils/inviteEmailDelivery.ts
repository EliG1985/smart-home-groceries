import nodemailer, { type Transporter } from 'nodemailer';

type SendInviteEmailParams = {
  email: string;
  role: string;
  inviteUrl: string;
};

let transporter: Transporter | null = null;

const getEnv = (name: string): string => process.env[name]?.trim() || '';

const getPort = (): number => {
  const raw = Number(getEnv('SMTP_PORT') || '587');
  return Number.isFinite(raw) && raw > 0 ? raw : 587;
};

const isSecure = (): boolean => getEnv('SMTP_SECURE').toLowerCase() === 'true';

export const emailDeliveryConfigured = (): boolean =>
  Boolean(
    getEnv('SMTP_URL')
    || (getEnv('SMTP_HOST') && getEnv('SMTP_USER') && getEnv('SMTP_PASS') && getEnv('SMTP_FROM')),
  );

const getTransporter = (): Transporter => {
  if (transporter) {
    return transporter;
  }

  const smtpUrl = getEnv('SMTP_URL');
  if (smtpUrl) {
    transporter = nodemailer.createTransport(smtpUrl);
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: getEnv('SMTP_HOST'),
    port: getPort(),
    secure: isSecure(),
    auth: {
      user: getEnv('SMTP_USER'),
      pass: getEnv('SMTP_PASS'),
    },
  });
  return transporter;
};

export const sendInviteEmail = async ({ email, role, inviteUrl }: SendInviteEmailParams): Promise<void> => {
  if (!emailDeliveryConfigured()) {
    throw new Error('Invite email delivery is not configured. Set SMTP_URL or SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM.');
  }

  const from = getEnv('SMTP_FROM');
  const replyTo = getEnv('SMTP_REPLY_TO');
  const appName = getEnv('INVITE_EMAIL_APP_NAME') || 'SmartHome Groceries';

  await getTransporter().sendMail({
    from,
    to: email,
    replyTo: replyTo || undefined,
    subject: `You were invited to ${appName}`,
    text: [
      `You were invited to join a family in ${appName}.`,
      `Assigned role: ${role}.`,
      '',
      `Open this link on your phone: ${inviteUrl}`,
      '',
      'If the app is not installed, the link will take you to the store first.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #142218; line-height: 1.5;">
        <h2 style="margin: 0 0 12px;">You were invited to join ${appName}</h2>
        <p style="margin: 0 0 12px;">Assigned role: <strong>${role}</strong>.</p>
        <p style="margin: 0 0 16px;">Open this invite on your phone. If the app is not installed yet, the same link will take you to the store first.</p>
        <p style="margin: 0;">
          <a href="${inviteUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #146c43; color: #ffffff; font-weight: 700; text-decoration: none;">Open Invite</a>
        </p>
      </div>
    `,
  });
};