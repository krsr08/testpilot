import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = { output:'standalone', turbopack:{root:path.resolve(__dirname,'../..')}, serverExternalPackages: ['@prisma/client', 'bullmq', 'ioredis'], async headers() { return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'}]}]; } };
export default config;
