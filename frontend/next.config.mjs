/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdf.js (react-pdf) trae una dependencia opcional de 'canvas' (solo Node);
    // en el browser no se usa. La desactivamos para que el build no la busque.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
