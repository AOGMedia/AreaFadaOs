import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));

// Preserve raw body for webhook signature verification (must come before express.json).
// Express 5 dropped RegExp path support in app.use(), so we use a plain middleware
// that only runs the raw-body capture for /api/webhooks/* paths.
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.path.startsWith("/api/webhooks/")) {
    return next();
  }
  express.raw({ type: "application/json" })(req, _res, (err?: any) => {
    if (err) return next(err);
    // Attach rawBody so webhook handlers can verify HMAC against exact bytes
    (req as any).rawBody = req.body as Buffer;
    // Parse JSON body for handler convenience
    try {
      req.body = JSON.parse((req as any).rawBody.toString("utf8"));
    } catch {
      req.body = {};
    }
    next();
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
