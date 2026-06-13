import emailjs from '@emailjs/browser';
import { emailConfig } from '@/lib/data';

export interface WelcomeEmailInput {
  toEmail: string;
  toName: string;
  password: string;
  role: 'pic' | 'user';
}

export type WelcomeEmailResult = { ok: true } | { ok: false; reason: string };

// Sends the new-account credentials email via EmailJS (browser SDK). Called
// from the admin account-creation flows after the account is created. The
// EmailJS template (NEXT_PUBLIC_EMAILJS_WELCOME_TEMPLATE_ID) should reference
// these variables: {{to_email}} {{to_name}} {{login_email}} {{login_password}}
// {{role}} {{login_url}}.
export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<WelcomeEmailResult> {
  if (!emailConfig.enabled) {
    return { ok: false, reason: 'Email belum aktif (NEXT_PUBLIC_EMAILJS_ENABLED).' };
  }
  if (!emailConfig.welcomeTemplateId) {
    return { ok: false, reason: 'Template welcome belum diset (NEXT_PUBLIC_EMAILJS_WELCOME_TEMPLATE_ID).' };
  }

  const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';

  try {
    await emailjs.send(
      emailConfig.serviceId,
      emailConfig.welcomeTemplateId,
      {
        to_email: input.toEmail,
        to_name: input.toName,
        login_email: input.toEmail,
        login_password: input.password,
        role: input.role === 'pic' ? 'PIC / Tim IT' : 'Karyawan',
        login_url: loginUrl,
      },
      emailConfig.publicKey,
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Gagal kirim email.' };
  }
}
