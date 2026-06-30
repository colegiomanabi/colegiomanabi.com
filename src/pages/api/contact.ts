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

  const apiKey = import.meta.env.RESEND_API_KEY;
  const to = import.meta.env.CONTACT_TO || "info@colegiomanabi.com";
  // ponytail: onboarding@resend.dev works without a verified domain (testing).
  // Swap to no-reply@colegiomanabi.com once the domain is verified in Resend.
  const from = import.meta.env.CONTACT_FROM || "Colegio Manabí <onboarding@resend.dev>";

  if (!apiKey) {
    console.error("RESEND_API_KEY no configurada");
    return json({ error: "El servicio de correo no está configurado." }, 500);
  }

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
    return json({ error: "No se pudo enviar el mensaje. Intenta de nuevo." }, 502);
  }

  return json({ ok: true });
};
