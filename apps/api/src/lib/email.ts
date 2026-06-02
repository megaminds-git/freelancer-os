import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendOtpEmail(to: string, otp: string, purpose: 'verify' | 'reset'): Promise<void> {
  const isReset = purpose === 'reset';
  const subject = isReset ? 'Reset your FreelancerOS password' : 'Verify your FreelancerOS account';
  const action  = isReset ? 'reset your password' : 'verify your email address';

  await transporter.sendMail({
    from: `"FreelancerOS" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text: `Your FreelancerOS verification code is: ${otp}\n\nThis code expires in 10 minutes. Use it to ${action}.\n\nIf you did not request this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:8px">
        <h2 style="color:#1e293b;margin-bottom:8px">FreelancerOS</h2>
        <p style="color:#475569;margin-bottom:24px">Use the code below to ${action}. It expires in <strong>10 minutes</strong>.</p>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0f172a">${otp}</span>
        </div>
        <p style="color:#94a3b8;font-size:13px">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}
