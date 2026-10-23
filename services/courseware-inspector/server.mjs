import { chromium } from 'playwright';
import { createInspectionServer } from './inspection-http.mjs';

const secret = process.env.AISECEDU_SERVICE_SECRET || '';
const renderOrigin = process.env.COURSEWARE_RENDER_ORIGIN;
if (secret.length < 24 || !renderOrigin) throw new Error('Inspector service authentication and render origin are required');
const browser = await chromium.launch({ headless: true,
  ...(process.env.INSPECTOR_CHROMIUM_PATH ? { executablePath: process.env.INSPECTOR_CHROMIUM_PATH, chromiumSandbox: true } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const server = createInspectionServer({browser, secret, renderOrigin});
server.listen(Number(process.env.PORT || 3015), process.env.HOSTNAME || '0.0.0.0');
const shutdown = async () => { server.close(); await browser.close(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
