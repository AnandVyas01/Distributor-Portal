// Vercel serverless entry point.
// An Express app is itself a (req, res) handler, so we just export it.
// Every request gets routed here by ../vercel.json, then Express routes
// it normally based on the original URL.
import app from "../src/server";

export default app;
