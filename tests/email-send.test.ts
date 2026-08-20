import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailEnabled, emailFrom, sendEmail } from "@/lib/email/send";

/**
 * Sending must be *optional* — a tenant with no Resend key still has WhatsApp
 * and the public link, which is how most Paraguayan SMBs send anything.
 */

const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.RESEND_FROM;

const content = { subject: "Factura", text: "hola", html: "<p>hola</p>" };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  if (originalFrom === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = originalFrom;
});

describe("emailEnabled", () => {
  it("is off with no key, and off for a blank one", () => {
    delete process.env.RESEND_API_KEY;
    expect(emailEnabled()).toBe(false);

    process.env.RESEND_API_KEY = "   ";
    expect(emailEnabled()).toBe(false);
  });

  it("is on once a key is set", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    expect(emailEnabled()).toBe(true);
  });
});

describe("emailFrom", () => {
  it("uses the configured sender", () => {
    process.env.RESEND_FROM = "facturar <no-reply@facturar.clientes.com.py>";
    expect(emailFrom()).toBe("facturar <no-reply@facturar.clientes.com.py>");
  });

  it("falls back to something that works locally", () => {
    delete process.env.RESEND_FROM;
    expect(emailFrom()).toContain("@");
  });
});

describe("sendEmail", () => {
  it("does not call the provider at all when sending is disabled", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sendEmail({ to: "ana@example.com", content });

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the message and returns the provider id", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "abc-123" }), { status: 200 }),
    );

    const result = await sendEmail({ to: "ana@example.com", content });

    expect(result).toEqual({ ok: true, id: "abc-123" });
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.to).toEqual(["ana@example.com"]);
    expect(body.subject).toBe("Factura");
    expect(body.text).toBe("hola");
  });

  it("reports a rejection without leaking the provider's message", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }),
    );

    const result = await sendEmail({ to: "ana@example.com", content });
    expect(result).toEqual({ ok: false, reason: "rejected" });
  });

  it("survives a network failure rather than throwing into the action", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));

    const result = await sendEmail({ to: "ana@example.com", content });
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  it("sets a reply-to only when one was given", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    await sendEmail({ to: "ana@example.com", content, replyTo: "ventas@sanblas.com.py" });
    await sendEmail({ to: "ana@example.com", content, replyTo: null });

    const withReply = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    const without = JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body));

    expect(withReply.reply_to).toBe("ventas@sanblas.com.py");
    expect(without).not.toHaveProperty("reply_to");
  });

  it("never puts the API key anywhere but the Authorization header", async () => {
    process.env.RESEND_API_KEY = "re_secret_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    await sendEmail({ to: "ana@example.com", content });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).not.toContain("re_secret_key");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_secret_key",
    );
  });
});
