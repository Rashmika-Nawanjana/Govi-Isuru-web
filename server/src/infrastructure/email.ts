import nodemailer from "nodemailer";
import { env } from "./env";

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: false,
  auth: env.smtp.user
    ? { user: env.smtp.user, pass: env.smtp.pass }
    : undefined,
});

function brandShell(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="font-family:Segoe UI,sans-serif;background:#f0f7f2;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1b5e20,#43a047);padding:24px;color:#fff">
  <h1 style="margin:0;font-size:22px">Govi Isuru</h1>
  <p style="margin:6px 0 0;opacity:.9">${title}</p></div>
  <div style="padding:28px;color:#333;line-height:1.6">${body}</div>
  <div style="padding:16px 28px;background:#f8faf8;color:#888;font-size:12px;text-align:center">
  © ${new Date().getFullYear()} Govi Isuru</div></div></body></html>`;
}

export async function sendVerificationEmail(
  email: string,
  username: string,
  token: string
) {
  if (!env.smtp.user) {
    console.warn("[email] SMTP not configured; skip verification send");
    return;
  }
  const link = `${env.frontendUrl}/verify-email?token=${token}`;
  await transporter.sendMail({
    from: `"Govi Isuru" <${env.smtp.user}>`,
    to: email,
    subject: "Verify your Govi Isuru account",
    html: brandShell(
      "Email verification",
      `<p>Welcome, <strong>${username}</strong>.</p>
       <p>Confirm your email to finish signing up.</p>
       <p style="text-align:center;margin:28px 0">
         <a href="${link}" style="background:#2e7d32;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a>
       </p>
       <p style="font-size:12px;color:#666;word-break:break-all">${link}</p>`
    ),
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  if (!env.smtp.user) {
    console.warn("[email] SMTP not configured; skip reset send");
    return;
  }
  const link = `${env.frontendUrl}/reset-password?token=${token}`;
  await transporter.sendMail({
    from: `"Govi Isuru" <${env.smtp.user}>`,
    to: email,
    subject: "Reset your Govi Isuru password",
    html: brandShell(
      "Password reset",
      `<p>Use the button below to choose a new password. Link expires in 1 hour.</p>
       <p style="text-align:center;margin:28px 0">
         <a href="${link}" style="background:#2e7d32;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a>
       </p>`
    ),
  });
}
