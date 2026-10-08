// Captcha / challenge solver integration (2Captcha or CapSolver via CAPTCHA_API_KEY secret).
// Detects Turnstile / reCAPTCHA / hCaptcha site keys in a blocked page and asks the provider for a token.
export type ChallengeKind = "turnstile" | "recaptcha" | "hcaptcha";

export function detectChallenge(html: string): { kind: ChallengeKind; sitekey: string } | null {
  const ts = html.match(/cf-turnstile[^>]*data-sitekey=["']([^"']+)/i) || html.match(/turnstile\.render\([^)]*sitekey['"]?\s*:\s*['"]([^'"]+)/i);
  if (ts) return { kind: "turnstile", sitekey: ts[1] };
  const hc = html.match(/h-captcha[^>]*data-sitekey=["']([^"']+)/i);
  if (hc) return { kind: "hcaptcha", sitekey: hc[1] };
  const rc = html.match(/g-recaptcha[^>]*data-sitekey=["']([^"']+)/i) || html.match(/recaptcha\/api\.js\?render=([A-Za-z0-9_-]{20,})/i);
  if (rc) return { kind: "recaptcha", sitekey: rc[1] };
  return null;
}

const TASK_TYPE: Record<string, Record<ChallengeKind, string>> = {
  "2captcha": { turnstile: "TurnstileTaskProxyless", recaptcha: "RecaptchaV2TaskProxyless", hcaptcha: "HCaptchaTaskProxyless" },
  capsolver: { turnstile: "AntiTurnstileTaskProxyLess", recaptcha: "ReCaptchaV2TaskProxyLess", hcaptcha: "HCaptchaTaskProxyLess" },
};
const BASE: Record<string, string> = { "2captcha": "https://api.2captcha.com", capsolver: "https://api.capsolver.com" };

export function captchaConfigured() {
  return !!process.env.CAPTCHA_API_KEY;
}

export async function solveChallenge(
  provider: "2captcha" | "capsolver",
  kind: ChallengeKind,
  sitekey: string,
  pageUrl: string,
): Promise<string | null> {
  const key = process.env.CAPTCHA_API_KEY;
  if (!key) return null;
  const base = BASE[provider];
  try {
    const c = await fetch(`${base}/createTask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: key, task: { type: TASK_TYPE[provider][kind], websiteURL: pageUrl, websiteKey: sitekey } }),
    });
    const cj = (await c.json()) as { taskId?: string | number; errorId?: number };
    if (!cj.taskId) return null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const g = await fetch(`${base}/getTaskResult`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: key, taskId: cj.taskId }),
      });
      const gj = (await g.json()) as { status?: string; solution?: { token?: string; gRecaptchaResponse?: string } };
      if (gj.status === "ready") return gj.solution?.token || gj.solution?.gRecaptchaResponse || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}
