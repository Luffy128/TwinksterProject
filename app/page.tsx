import type { Metadata } from "next";
import TwinksterGame from "./TwinksterGame";

export const metadata: Metadata = {
  title: "Twinkster Local",
  description: "Mesa local para jugar a Hitster por Discord con MP3 propios.",
};

export default function Home() {
  return <TwinksterGame />;
}
