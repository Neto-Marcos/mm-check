/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Empacota só o necessário para rodar: imagem menor e boot mais rápido
  // no container do Railway.
  output: "standalone",
  // unpdf carrega o worker do pdf.js em runtime; mantê-lo externo evita
  // que o bundler tente empacotá-lo.
  serverExternalPackages: ["unpdf"],
};

export default config;
