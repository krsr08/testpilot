import type { Metadata } from 'next';
import './globals.css';
import { Shell } from '../components/shell';

export const metadata: Metadata = { title: 'TestPilot AI — Requirement to confidence', description: 'Source-grounded test design and review workspace.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Shell>{children}</Shell></body></html>;
}
