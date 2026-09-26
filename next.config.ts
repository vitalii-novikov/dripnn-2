import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // next dev иначе дописывает свой блок в CLAUDE.md при каждом запуске. Файл
  // курируемый и ограничен по объёму, поэтому нужный факт про документацию
  // Next 16 перенесён в docs/architecture.md вручную.
  agentRules: false,
  // Playwright ходит на 127.0.0.1, а не на localhost: без этого dev-сервер
  // режет HMR-ресурсы как cross-origin.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
