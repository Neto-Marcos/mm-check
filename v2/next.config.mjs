/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // unpdf carrega o worker do pdf.js em runtime; mantê-lo externo evita
  // que o bundler tente empacotá-lo.
  serverExternalPackages: ["unpdf"],
};

export default config;
