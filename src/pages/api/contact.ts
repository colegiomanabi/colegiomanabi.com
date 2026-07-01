import type { APIRoute } from "astro";
import { Resend } from "resend";

export const prerender = false;

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const json = (data: object, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const nombre = (body.nombre || "").trim();
  const email = (body.email || "").trim();
  const telefono = (body.telefono || "").trim();
  const nivel = (body.nivel || "").trim();
  const mensaje = (body.mensaje || "").trim();

  // honeypot: filled = bot. Pretend success so it doesn't retry.
  if (body.website) return json({ ok: true });

  if (!nombre || !email) return json({ error: "Nombre y correo son obligatorios." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "El correo no es válido." }, 400);

  // process.env for Vercel runtime secrets, import.meta.env for local dev
  const apiKey = process.env.RESEND_API_KEY ?? import.meta.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO ?? import.meta.env.CONTACT_TO ?? "info@colegiomanabi.com";
  // ponytail: onboarding@resend.dev works without a verified domain (testing),
  // but it can ONLY deliver to your own Resend account email.
  // Verify colegiomanabi.com in Resend, then set CONTACT_FROM=no-reply@colegiomanabi.com to send anywhere.
  const from = process.env.CONTACT_FROM ?? import.meta.env.CONTACT_FROM ?? "Colegio Manabi <onboarding@resend.dev>";

  if (!apiKey) {
    console.error("RESEND_API_KEY no configurada");
    return json({ error: "El servicio de correo no está configurado." }, 500);
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `Nuevo mensaje de contacto — ${nombre}`,
      html: `
        <h2>Nuevo mensaje desde colegiomanabi.com</h2>
        <p><strong>Nombre:</strong> ${esc(nombre)}</p>
        <p><strong>Correo:</strong> ${esc(email)}</p>
        <p><strong>Teléfono:</strong> ${esc(telefono) || "—"}</p>
        <p><strong>Nivel de interés:</strong> ${esc(nivel) || "—"}</p>
        <p><strong>Mensaje:</strong><br>${esc(mensaje).replace(/\n/g, "<br>") || "—"}</p>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      // surface Resend's reason so misconfig (unverified domain / sandbox recipient) is obvious
      return json({ error: error.message || "No se pudo enviar el mensaje." }, 500);
    }
  } catch (e) {
    console.error("contact handler crashed:", e);
    return json({ error: e instanceof Error ? e.message : "Error inesperado." }, 500);
  }

  return json({ ok: true });
};
