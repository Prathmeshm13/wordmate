import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Wordmates — A little friendly wordplay", description: "Six guesses. One word. Better with friends. Play daily puzzles and private multiplayer word games.", icons: { icon: "/favicon.svg" } };
export default function Layout({ children }: {
    children: React.ReactNode;
}) { return <html lang="en"><body>{children}</body></html>; }
