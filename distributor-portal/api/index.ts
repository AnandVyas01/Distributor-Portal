// Vercel serverless wrapper around the Express app.
//
// Vercel routes every request matching /api/* here (see ../vercel.json
// rewrites). Express's own routes live at /products, /quotes, etc. — so we
// strip the /api prefix before delegating.
import app from "../backend/src/server";

export default function handler(req: any, res: any) {
  if (typeof req.url === "string") {
    const stripped = req.url.replace(/^\/api/, "");
    req.url = stripped.length === 0 ? "/" : stripped;
  }
  return app(req, res);
}
