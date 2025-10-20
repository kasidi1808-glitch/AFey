/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ensure Node-specific dependencies are bundled correctly in Server Components
    // when deploying to environments like Vercel.
    serverComponentsExternalPackages: [
      "yahoo-finance2",
      "tough-cookie",
      "tough-cookie-file-store",
    ],
  },
};

export default nextConfig;
