/** @type {import('next').NextConfig} */
const nextConfig = {
  // A separate output directory can be selected for isolated verification builds.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
