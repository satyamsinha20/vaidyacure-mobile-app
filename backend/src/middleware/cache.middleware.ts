import { Request, Response, NextFunction } from 'express';

/**
 * Lets Vercel's CDN serve public GET responses from the edge for `sMaxAge`
 * seconds (then refresh in the background for `staleWhileRevalidate` more),
 * so the mobile app gets them in milliseconds instead of hitting MongoDB.
 * Error responses, requests carrying an admin token and `?fresh=1` requests
 * (admin panel) are never cached, so admins always see their latest edits.
 */
export const cdnCache =
  (sMaxAge: number, staleWhileRevalidate: number) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      const cacheable =
        req.method === 'GET' && res.statusCode < 400 && !req.headers.authorization && req.query.fresh === undefined;
      res.set(
        'Cache-Control',
        cacheable ? `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}` : 'no-store'
      );
      return json(body);
    };
    next();
  };

/** Adds a Server-Timing header (app processing time) to every response */
export const serverTiming = (_req: Request, res: Response, next: NextFunction): void => {
  const started = process.hrtime.bigint();
  const writeHead = res.writeHead.bind(res) as (...args: any[]) => Response;
  (res as any).writeHead = (...args: any[]) => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    if (!res.headersSent) res.setHeader('Server-Timing', `app;dur=${ms.toFixed(1)}`);
    return writeHead(...args);
  };
  next();
};
