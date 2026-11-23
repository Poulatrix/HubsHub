import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import ical from "node-ical";
import axios from "axios";
import dotenv from "dotenv";
import webpush from "web-push";

dotenv.config();

// VAPID keys should be generated once and stored in .env
// If not present, we use these placeholders or generate them (ideally stored in DB)
const vapidKeys = {
  publicKey: process.env.VITE_VAPID_PUBLIC_KEY || "BE_uVfG8kZ9_C8M1vSzkvG6_R8mP2F_c6z8_x_D8n8_D8n8_D8n8_D8n8_D8n8_D", // Placeholder
  privateKey: process.env.VAPID_PRIVATE_KEY || ""
};

if (vapidKeys.publicKey && vapidKeys.privateKey) {
  webpush.setVapidDetails(
    "mailto:example@yourdomain.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Send Invitation Email
  app.post("/api/send-invite", async (req, res) => {
    const { email, familyName, invitedBy, role } = req.body;

    if (!resend) {
      console.log("RESEND_API_KEY not set. Skipping email send (simulated success).");
      return res.json({ success: true, message: "Email simulation (no API key)" });
    }

    try {
      const { data, error } = await resend.emails.send({
        from: "FamilyHub <onboarding@resend.dev>",
        to: [email],
        subject: `Invitation à rejoindre la famille ${familyName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; rounded: 10px;">
            <h2 style="color: #3b82f6;">Bonjour !</h2>
            <p><strong>${invitedBy}</strong> vous invite à rejoindre le groupe familial <strong>${familyName}</strong> sur FamilyHub en tant que <strong>${role}</strong>.</p>
            <p>Connectez-vous à l'application avec votre adresse email pour accepter l'invitation.</p>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
              Ceci est un message automatique de FamilyHub.
            </div>
          </div>
        `,
      });

      if (error) {
        return res.status(400).json({ error });
      }

      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // API: Proxy Calendar Fetch (to avoid CORS)
  app.get("/api/fetch-calendar", async (req, res) => {
    let { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      // Auto-fix Google Calendar embed URLs
      if (url.includes('calendar.google.com/calendar') && url.includes('embed')) {
        const srcMatch = url.match(/src=([^&]+)/);
        if (srcMatch) {
          const calendarId = decodeURIComponent(srcMatch[1]);
          url = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
          console.log(`Auto-corrected Google Calendar URL to iCal: ${url}`);
        }
      }

      // Auto-fix Outlook/Office365 calendar web URLs
      if (url.includes('outlook.office365.com') && url.endsWith('.html')) {
        url = url.replace('.html', '.ics');
        console.log(`Auto-corrected Outlook Calendar URL to iCal: ${url}`);
      }
      
      // Auto-fix iCloud calendar URLs (webcal:// -> https://)
      if (url.startsWith('webcal://')) {
        url = url.replace('webcal://', 'https://');
        console.log(`Auto-corrected iCloud webcal URL: ${url}`);
      }

      // Basic validation for calendar URLs
      if (!url.startsWith('http')) {
        return res.status(400).json({ error: "URL invalide (doit commencer par http)" });
      }

      console.log(`Fetching calendar from: ${url}`);
      const response = await axios.get(url, { 
        responseType: 'text',
        headers: {
          'User-Agent': 'Mozilla/5.0 (FamilyHub Calendar Fetcher)'
        },
        timeout: 10000 // 10s timeout
      });

      const content = (response.data as string).trim();

      if (!content.includes('BEGIN:VCALENDAR')) {
        if (content.toLowerCase().startsWith('<!doctype') || content.toLowerCase().startsWith('<html')) {
          console.error(`URL returned HTML instead of iCal. Likely a web page address.`);
          return res.status(400).json({ 
            error: "L'URL fournie est une page web, pas un flux de données.",
            details: "Veuillez utiliser 'l'adresse secrète au format iCal' ou 'l'adresse publique au format iCal' dans les paramètres de votre calendrier."
          });
        }
        console.error(`URL did not return a valid iCal file (missing BEGIN:VCALENDAR). Content type: ${response.headers['content-type']}`);
        return res.status(400).json({ error: "Le fichier reçu n'est pas un calendrier valide (format .ics requis)" });
      }

      const events = ical.parseICS(content);
      
      const formattedEvents = Object.values(events)
        .filter(event => event.type === 'VEVENT')
        .map(event => ({
          id: event.uid,
          title: event.summary,
          start: event.start,
          end: event.end,
          description: event.description,
          location: event.location,
          allDay: !event.start?.toString().includes('T') // Simple check for all-day
        }));

      res.json(formattedEvents);
    } catch (err: any) {
      console.error("Calendar fetch error:", err.message);
      if (err.response) {
        console.error("Response status:", err.response.status);
        console.error("Response data (first 100 chars):", err.response.data?.toString().slice(0, 100));
      }
      res.status(err.response?.status || 500).json({ 
        error: "Impossible de récupérer le calendrier. Vérifiez l'URL.",
        details: err.message
      });
    }
  });

  // API: Get VAPID Public Key
  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // API: Send Push Notification
  app.post("/api/send-push", async (req, res) => {
    const { subscription, payload } = req.body;

    if (!vapidKeys.privateKey) {
      console.log("VAPID_PRIVATE_KEY not set. Push simulation (no keys).");
      return res.json({ success: true, message: "Push simulation (no keys)", payload });
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      res.json({ success: true });
    } catch (err) {
      console.error("Push notification error:", err);
      res.status(500).json({ error: "Failed to send push notification" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
