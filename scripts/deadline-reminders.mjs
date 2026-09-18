// Triggers the daily deadline reminders of a running Fila ATIC server.
//
//   npm run cron:deadlines
//
// Reads NEXTAUTH_URL (where the app runs) and CRON_SECRET from .env. Schedule
// it once a day, early in the morning (see README).
const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3003").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("Defina CRON_SECRET no .env (o mesmo valor configurado no servidor).");
  process.exit(1);
}

try {
  const response = await fetch(`${base}/api/cron/deadline-reminders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log(response.status, await response.text());
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  console.error("Nao foi possivel chamar o servidor:", error.message);
  process.exit(1);
}
